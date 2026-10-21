import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Miniflare, Log, LogLevel } from 'miniflare';

const files = ['core.mjs', 'http.mjs', 'lease.mjs', 'review.mjs', 'playback.mjs', 'server.ts', 'devices.ts', 'commit.ts'];
let source = "import { env } from 'cloudflare:workers';\n";
for (const file of files) {
  let value = await readFile(new URL('../lib/queue/' + file, import.meta.url), 'utf8');
  value = value.replace(/^import .*;\r?\n/gm, '').replace('export { boundedFetch };', '');
  source += file.endsWith('.ts') ? ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText : value;
  source += '\n';
}
const schema = await readFile(new URL('../drizzle/0000_low_thunderbolt.sql', import.meta.url), 'utf8');
const tracks = Array.from({ length: 20 }, (_, n) => ({ id: String(n + 1).padStart(22, '0'), uri: 'spotify:track:' + String(n + 1).padStart(22, '0'), title: 'Song ' + n, artist: 'Artist ' + n, artistNames: ['Artist ' + n], artistIds: [], source: 'catalogue', image: '', url: '' }));
source += `
const fixtureTracks = ${JSON.stringify(tracks)};
const selectionId = '00000000-0000-4000-8000-000000000001';
export default { async fetch(request) {
  try {
    const params = new URL(request.url).searchParams;
    if (new URL(request.url).pathname === '/init') {
      for (const sql of ${JSON.stringify(schema)}.split(';').map(s => s.trim()).filter(Boolean)) await db().prepare(sql).run();
      await saveAccount('owner', { spotify: { access: 'FAKE_ACCESS', refresh: 'FAKE_REFRESH', expires: Date.now() + 3600000, subject: 'fake-owner' }, lastDevice: { id: 'paused-phone', name: 'iPhone', type: 'Smartphone', seen: Date.now(), subject: 'fake-owner' } }, -1);
      await db().prepare('INSERT INTO selections VALUES (?, ?, ?, ?)').bind(selectionId, 'owner', await seal({ tracks: fixtureTracks, prompt: 'Fixture request', count: 20, subject: 'fake-owner', deviceId: 'paused-phone' }, 'owner'), Date.now() + 600000).run();
      return response({ ready: true });
    }
    if (params.has('restart')) return response(await restartSelection(params.get('owner') || 'owner', selectionId, undefined, 'paused-phone'));
    return response(await addSelection(params.get('owner') || 'owner', selectionId, undefined, params.get('mode') || 'replace', 'paused-phone'));
  } catch (error) { return fail(error); }
} };
`;

async function fixture(mode, status = 200, cold = false, refusesWake = false, failStarts = 0) {
  const writes = []; let playing = false, active = !cold, queued = false, warmFirst = false;
  const raw = t => ({ type: 'track', id: t.id, name: t.title, artists: [{ name: t.artist }], album: { images: [] } });
  const worker = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script: source, d1Databases: ['DB'], bindings: { DATA_ENCRYPTION_KEY: '01'.repeat(32) }, log: new Log(LogLevel.NONE), outboundService: async request => {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') { writes.push({ path, method: request.method, body: request.method === 'PUT' ? await request.json() : null }); if (refusesWake && !active) return new Response(null, { status: 404 }); active = true; playing = true; if (path.endsWith('/play')) { if (failStarts > 0) { failStarts--; playing = false; queued = false; } else queued = true; } return new Response(null, { status }); }
    if (path.endsWith('/devices')) return Response.json({ devices: cold ? [] : [{ id: 'paused-phone', name: 'iPhone', type: 'Smartphone', is_active: playing }] });
    if (path.endsWith('/queue')) return Response.json({ currently_playing: playing ? raw(queued || warmFirst ? tracks[0] : tracks[19]) : null, queue: queued && mode === 'replace' ? tracks.slice(1).map(raw) : [] });
    if (!active) return new Response(null, { status: 204 });
    return Response.json({ device: { id: 'paused-phone' }, shuffle_state: false, repeat_state: 'off', is_playing: playing, item: playing ? raw(queued || warmFirst ? tracks[0] : tracks[19]) : null });
  } });
  const init = await worker.dispatchFetch('https://fixture.test/init'); assert.equal(init.status, 200, await init.text());
  return { worker, writes, confirmPlaying: () => { active = true; playing = true; queued = true; }, makeReachable: () => { active = true; playing = true; warmFirst = true; }, restart: () => worker.dispatchFetch('https://fixture.test/send?restart=1'), send: () => worker.dispatchFetch('https://fixture.test/send?mode=' + mode) };
}

test('actual commit route with D1 handles twenty empty-success append replies and receipts prevent replay', async () => {
  const { worker, writes, send } = await fixture('append');
  try {
    const result = await send(); assert.equal(result.status, 200); assert.equal((await result.json()).accepted, 20); assert.equal(writes.length, 20);
    const replay = await (await send()).json(); assert.equal(replay.accepted, 20); assert.equal(writes.length, 20);
    const other = await worker.dispatchFetch('https://fixture.test/send?owner=other'); assert.equal(other.status, 410); assert.equal(writes.length, 20);
  } finally { await worker.dispose(); }
});

test('actual Play now route starts a paused phone with all twenty URIs in one PUT, observes order and never replays', async () => {
  const { worker, writes, send } = await fixture('replace', 202);
  try {
    const result = await send(); assert.equal(result.status, 200); const body = await result.json();
    assert.equal(body.accepted, 20); assert.equal(body.playbackConfirmed, true); assert.equal(body.sequenceConfirmed, true);
    assert.equal(writes.length, 2); assert.deepEqual(writes[0].body, { device_ids: ['paused-phone'], play: true }); assert.equal(writes[1].path, '/v1/me/player/play'); assert.deepEqual(writes[1].body, { uris: tracks.map(t => t.uri), position_ms: 0 });
    await send(); assert.equal(writes.length, 2);
  } finally { await worker.dispose(); }
});


test('a remembered phone missing from devices and playback state can be resumed before sending', async () => {
  const { worker, writes, send } = await fixture('replace', 204, true);
  try {
    const result = await send(); assert.equal(result.status, 200); assert.equal((await result.json()).accepted, 20);
    assert.deepEqual(writes.map(w => w.path), ['/v1/me/player', '/v1/me/player/play']);
    assert.equal(writes[0].body.play, true);
  } finally { await worker.dispose(); }
});

test('a refused wake leaves the selection unsent and it can finish after the user reconnects Spotify', async () => {
  const { worker, writes, send, makeReachable } = await fixture('replace', 204, true, true);
  try {
    const first = await send(); assert.equal(first.status, 404);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 0);
    makeReachable(); const resumed = await send(); assert.equal(resumed.status, 200); assert.equal((await resumed.json()).accepted, 20);
    await send(); assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
  } finally { await worker.dispose(); }
});

test('an acknowledged play that empties Spotify stays unconfirmed through receipts and never auto-replays', async () => {
  const { worker, writes, send, restart } = await fixture('replace', 204, false, false, 1);
  try {
    const response = await send(); assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.state, 'unconfirmed'); assert.equal(result.accepted, 20);
    assert.equal(result.playbackConfirmed, false); assert.equal(result.sequenceConfirmed, false);
    const read = await (await send()).json();
    assert.equal(read.state, 'unconfirmed'); assert.equal(read.tracks.length, 20);
    assert.match(read.message, /did not confirm playback/);
    const retry = await restart(); assert.equal(retry.status, 409);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
  } finally { await worker.dispose(); }
});

test('explicit recovery waits for the saved first song and starts the full saved list only once', async () => {
  const { worker, writes, send, restart, makeReachable } = await fixture('replace', 204, false, false, 1);
  try {
    await send(); assert.equal((await restart()).status, 409);
    makeReachable();
    const result = await (await restart()).json();
    assert.equal(result.state, 'complete'); assert.equal(result.recoveryAttempt, true);
    assert.equal(result.playbackConfirmed, true); assert.equal(result.sequenceConfirmed, true);
    assert.deepEqual(writes.filter(w => w.path.endsWith('/play')).map(w => w.body.uris), [tracks.map(t => t.uri), tracks.map(t => t.uri)]);
    const repeated = await (await restart()).json();
    assert.equal(repeated.selectionId, result.selectionId);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 2);
    assert.equal((await worker.dispatchFetch('https://fixture.test/send?restart=1&owner=other')).status, 409);
  } finally { await worker.dispose(); }
});

test('a delayed observation can confirm the original command through a read without resending it', async () => {
  const { worker, writes, send, confirmPlaying } = await fixture('replace', 204, false, false, 1);
  try {
    const result = await (await send()).json(); assert.equal(result.state, 'unconfirmed');
    confirmPlaying();
    const reread = await (await send()).json(); assert.equal(reread.playbackConfirmed, true); assert.equal(reread.sequenceConfirmed, true);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
  } finally { await worker.dispose(); }
});

test('a second accepted-but-empty start cannot create a third playback attempt', async () => {
  const { worker, writes, send, restart, makeReachable } = await fixture('replace', 204, false, false, 2);
  try {
    await send(); makeReachable();
    const result = await (await restart()).json();
    assert.equal(result.state, 'unconfirmed'); assert.equal(result.recoveryAttempt, true);
    assert.equal((await (await restart()).json()).state, 'unconfirmed');
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 2);
  } finally { await worker.dispose(); }
});
