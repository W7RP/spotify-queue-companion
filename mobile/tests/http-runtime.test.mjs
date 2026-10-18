import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';

const transport = await readFile(new URL('../lib/queue/http.mjs', import.meta.url), 'utf8');
const oauth = await readFile(new URL('../lib/queue/spotify-signin.mjs', import.meta.url), 'utf8');
const script = transport + '\n' + oauth + `
export default { async fetch(request) {
  try {
    const path = new URL(request.url).pathname;
    if (path === '/oauth') {
      let saved = null;
      await finishSpotifySignIn(new Request('https://queue.example/callback?state=FAKE_STATE&code=FAKE_CODE', { headers: { cookie: 'qc_spotify_oauth=FAKE_BROWSER' } }), {
        clientId: 'FAKE_CLIENT', hash: async value => 'hash:' + value,
        consumeAttempt: async () => ({ sealed: 'FAKE_SEALED' }),
        openAttempt: async () => ({ browser: 'hash:FAKE_BROWSER', verifier: 'FAKE_VERIFIER', redirect: 'https://queue.example/callback' }),
        readAccount: async () => ({ value: {}, revision: -1 }),
        saveAccount: async value => { saved = value.spotify.subject; },
        fetch: boundedFetch,
      });
      return Response.json({ saved });
    }
    const url = path === '/models' ? 'https://api.anthropic.com/v1/models' : path === '/queue' ? 'https://api.spotify.com/v1/me/player/queue' : 'https://provider.example' + path;
    const response = await boundedFetch(url, { method: path === '/queue' ? 'POST' : 'GET', headers: { Authorization: 'Bearer FAKE_ACCESS', 'x-api-key': 'FAKE_KEY' } }, path === '/slow' ? 20 : 5000);
    return Response.json({ status: response.status });
  } catch (error) { return Response.json({ error: error.message }, { status: 502 }); }
} };
`;

test('real workerd runtime completes the PKCE callback and provider requests', async () => {
  const calls = [];
  const worker = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script, outboundService: async request => {
    const url = new URL(request.url); calls.push({ host: url.hostname, path: url.pathname, method: request.method });
    if (url.pathname === '/api/token') {
      const form = new URLSearchParams(await request.text());
      assert.equal(form.get('code_verifier'), 'FAKE_VERIFIER'); assert.equal(form.get('client_id'), 'FAKE_CLIENT');
      assert.equal(form.get('redirect_uri'), 'https://queue.example/callback');
      return Response.json({ access_token: 'FAKE_ACCESS', refresh_token: 'FAKE_REFRESH', expires_in: 3600 });
    }
    if (url.pathname === '/v1/me') { assert.equal(request.headers.get('authorization'), 'Bearer FAKE_ACCESS'); return Response.json({ id: 'FAKE_SUBJECT', product: 'premium' }); }
    if (url.hostname === 'api.anthropic.com') { assert.equal(request.headers.get('x-api-key'), 'FAKE_KEY'); return Response.json({ data: [] }); }
    return new Response(null, { status: 204 });
  } });
  try {
    const result = await worker.dispatchFetch('http://queue.test/oauth');
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { saved: 'FAKE_SUBJECT' });
    assert.deepEqual(await (await worker.dispatchFetch('http://queue.test/models')).json(), { status: 200 });
    assert.deepEqual(await (await worker.dispatchFetch('http://queue.test/queue')).json(), { status: 204 });
    assert.deepEqual(calls.map(c => c.method), ['POST', 'GET', 'GET', 'POST']);
  } finally { await worker.dispose(); }
});

test('workerd rejects provider redirects without forwarding credentials or replaying writes', async () => {
  const calls = [];
  const worker = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script, outboundService: async request => {
    calls.push(request.url);
    return Response.redirect('https://untrusted.example/collect', new URL(request.url).pathname === '/redirect302' ? 302 : 307);
  } });
  try {
    for (const path of ['/redirect302', '/queue']) {
      const response = await worker.dispatchFetch('http://queue.test' + path);
      assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'Provider redirect rejected.' });
    }
    assert.equal(calls.length, 2); assert.ok(calls.every(url => !url.includes('untrusted.example')));
  } finally { await worker.dispose(); }
});

test('workerd aborts stalled requests at the configured deadline without retrying', async () => {
  let calls = 0;
  const worker = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script, outboundService: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 100)); return Response.json({});
  } });
  try {
    const response = await worker.dispatchFetch('http://queue.test/slow');
    assert.equal(response.status, 502); assert.equal(calls, 1);
  } finally { await worker.dispose(); }
});
