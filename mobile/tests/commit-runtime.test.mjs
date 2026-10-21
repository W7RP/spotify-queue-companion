import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Miniflare, Log, LogLevel } from 'miniflare';

const files = ['core.mjs', 'http.mjs', 'lease.mjs', 'review.mjs', 'playback.mjs', 'server.ts', 'devices.ts', 'playlist.ts', 'commit.ts'];
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
      await saveAccount('owner', { spotify: { access: 'FAKE_ACCESS', refresh: 'FAKE_REFRESH', expires: Date.now() + 3600000, subject: 'fake-owner', scopes: params.has('noScope') ? '' : 'playlist-modify-private' }, lastDevice: { id: 'paused-phone', name: 'iPhone', type: 'Smartphone', seen: Date.now(), subject: 'fake-owner' } }, -1);
      await db().prepare('INSERT INTO selections VALUES (?, ?, ?, ?)').bind(selectionId, 'owner', await seal({ tracks: fixtureTracks, prompt: 'Fixture request', count: 20, subject: 'fake-owner', deviceId: 'paused-phone' }, 'owner'), Date.now() + 600000).run();
      return response({ ready: true });
    }
    if (new URL(request.url).pathname === '/legacy') {
      await db().prepare('INSERT INTO queue_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('legacy-job', 'owner', selectionId, 'unconfirmed', 20, 20, Date.now(), await seal({ mode: 'replace', deviceId: 'paused-phone' }, 'owner')).run(); return response({ ready: true });
    }
    if (params.has('restart')) return response(await restartSelection(params.get('owner') || 'owner', selectionId, undefined, 'paused-phone'));
    return response(await addSelection(params.get('owner') || 'owner', selectionId, undefined, params.get('mode') || 'replace', 'paused-phone'));
  } catch (error) { return fail(error); }
} };
`;

async function fixture(mode, { status = 204, cold = false, refusesWake = false, failContext = false, noScope = false, mismatch = false, privatePlaylist = true } = {}) {
  const writes = []; let playing = false, active = !cold, queued = false, warmFirst = false, playlistTracks = [];
  const playlistId = 'P'.repeat(22);
  const raw = t => ({ type: 'track', id: t.id, uri: t.uri, name: t.title, artists: [{ name: t.artist }], album: { images: [] } });
  const worker = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script: source, d1Databases: ['DB'], bindings: { DATA_ENCRYPTION_KEY: '01'.repeat(32) }, log: new Log(LogLevel.NONE), outboundService: async request => {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') {
      const body = await request.text(); const value = body ? JSON.parse(body) : null;
      writes.push({ path, method: request.method, body: value });
      if (path === '/v1/me/playlists') return Response.json({ id: playlistId }, { status: 201 });
      if (path === '/v1/playlists/' + playlistId + '/items') { playlistTracks = mismatch ? tracks.slice(0, 1) : tracks.filter(t => value.uris.includes(t.uri)); return Response.json({ snapshot_id: 'snapshot' }); }
      if (refusesWake && !active) return new Response(null, { status: 404 });
      active = true; playing = true;
      if (path.endsWith('/play')) {
        // Reproduce the production regression for EVERY URI-list call, including warm recovery.
        if (value.uris || failContext) { playing = false; queued = false; }
        else { assert.equal(value.context_uri, 'spotify:playlist:' + playlistId); queued = true; }
      }
      return new Response(null, { status });
    }
    if (path === '/v1/playlists/' + playlistId) return Response.json({ id: playlistId, owner: { id: 'fake-owner' }, public: !privatePlaylist, collaborative: false });
    if (path === '/v1/playlists/' + playlistId + '/items') return Response.json({ items: playlistTracks.map(t => ({ item: raw(t) })), next: null });
    if (path.endsWith('/devices')) return Response.json({ devices: cold ? [] : [{ id: 'paused-phone', name: 'iPhone', type: 'Smartphone', is_active: playing }] });
    if (path.endsWith('/queue')) return Response.json({ currently_playing: playing ? raw(queued || warmFirst ? tracks[0] : tracks[19]) : null, queue: queued && mode === 'replace' ? tracks.slice(1).map(raw) : [] });
    if (!active) return new Response(null, { status: 204 });
    return Response.json({ context: queued ? { uri: 'spotify:playlist:' + playlistId } : null, device: { id: 'paused-phone' }, shuffle_state: false, repeat_state: 'off', is_playing: playing, item: playing ? raw(queued || warmFirst ? tracks[0] : tracks[19]) : null });
  } });
  const init = await worker.dispatchFetch('https://fixture.test/init' + (noScope ? '?noScope=1' : '')); assert.equal(init.status, 200, await init.text());
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

test('Play now saves and verifies all songs before starting a playlist context on a paused phone', async () => {
  const { worker, writes, send } = await fixture('replace', { status: 202 });
  try {
    const result = await send(); assert.equal(result.status, 200); const body = await result.json();
    assert.equal(body.accepted, 20); assert.equal(body.playbackConfirmed, true); assert.equal(body.sequenceConfirmed, true);
    assert.equal(body.playbackPlaylist, 'spotify:playlist:' + 'P'.repeat(22));
    assert.deepEqual(writes.map(w => w.path), ['/v1/me/playlists', '/v1/playlists/' + 'P'.repeat(22) + '/items', '/v1/me/player', '/v1/me/player/play']);
    assert.equal(writes[0].body.public, false); assert.equal(writes[0].body.collaborative, false);
    assert.deepEqual(writes[1].body.uris, tracks.map(t => t.uri));
    assert.deepEqual(writes[3].body, { context_uri: body.playbackPlaylist, offset: { position: 0 }, position_ms: 0 });
    await send(); assert.equal(writes.length, 4);
    assert.ok(writes.filter(w => w.path.endsWith('/play')).every(w => !w.body.uris));
  } finally { await worker.dispose(); }
});

test('missing playlist permission preserves the selection and sends no Spotify writes', async () => {
  const { worker, writes, send } = await fixture('replace', { noScope: true });
  try { const response = await send(); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'spotify_playlist_permission'); assert.equal(writes.length, 0); }
  finally { await worker.dispose(); }
});

test('a remembered disconnected phone resumes before the context start', async () => {
  const { worker, writes, send } = await fixture('replace', { cold: true });
  try { const result = await send(); assert.equal(result.status, 200); assert.equal((await result.json()).state, 'complete'); assert.equal(writes.find(w => w.path === '/v1/me/player').body.play, true); }
  finally { await worker.dispose(); }
});

test('a refused wake preserves and reuses the private playlist when the device reconnects', async () => {
  const { worker, writes, send, makeReachable } = await fixture('replace', { cold: true, refusesWake: true });
  try {
    assert.equal((await send()).status, 404); assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 0);
    makeReachable(); assert.equal((await (await send()).json()).state, 'complete'); await send();
    assert.equal(writes.filter(w => w.path === '/v1/me/playlists').length, 1);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
  } finally { await worker.dispose(); }
});

test('a reused playlist made public is never overwritten or started', async () => {
  const { worker, writes, send, makeReachable } = await fixture('replace', { cold: true, refusesWake: true, privatePlaylist: false });
  try {
    await send(); makeReachable(); const count = writes.length;
    const result = await send(); assert.equal(result.status, 409); assert.equal((await result.json()).code, 'spotify_playlist'); assert.equal(writes.length, count);
  } finally { await worker.dispose(); }
});

test('partial playlist propagation never starts a truncated selection', async () => {
  const { worker, writes, send } = await fixture('replace', { mismatch: true });
  try { assert.equal((await send()).status, 409); assert.equal(writes.filter(w => w.path.startsWith('/v1/me/player')).length, 0); }
  finally { await worker.dispose(); }
});

test('even a failed context start stays unconfirmed and cannot be replayed after warming the first song', async () => {
  const { worker, writes, send, restart, makeReachable } = await fixture('replace', { failContext: true });
  try {
    const result = await (await send()).json(); assert.equal(result.state, 'unconfirmed'); assert.equal(result.playbackConfirmed, false); assert.equal(result.canRestart, false);
    assert.equal(result.playbackPlaylist, 'spotify:playlist:' + 'P'.repeat(22));
    makeReachable(); assert.equal((await (await send()).json()).state, 'unconfirmed'); assert.equal((await restart()).status, 409);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
  } finally { await worker.dispose(); }
});

test('opening the saved playlist can confirm playback by reading status without another write', async () => {
  const { worker, writes, send, confirmPlaying } = await fixture('replace', { failContext: true });
  try {
    assert.equal((await (await send()).json()).state, 'unconfirmed'); confirmPlaying();
    const result = await (await send()).json(); assert.equal(result.state, 'complete'); assert.equal(result.sequenceConfirmed, true);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
  } finally { await worker.dispose(); }
});

test('legacy unconfirmed URI jobs migrate once to a playlist without requiring a first-song warmup', async () => {
  const { worker, writes, restart } = await fixture('replace');
  try {
    assert.equal((await worker.dispatchFetch('https://fixture.test/legacy')).status, 200);
    const result = await (await restart()).json(); assert.equal(result.state, 'complete'); assert.equal(result.recoveryAttempt, true);
    assert.equal((await (await restart()).json()).selectionId, result.selectionId);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1); assert.ok(writes.filter(w => w.path.endsWith('/play')).every(w => w.body.context_uri && !w.body.uris));
    assert.equal((await worker.dispatchFetch('https://fixture.test/send?restart=1&owner=other')).status, 409);
  } finally { await worker.dispose(); }
});
