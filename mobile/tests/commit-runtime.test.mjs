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
// Compress waits in the provider fixture, retaining every production read, guard and checkpoint.
source = source.replaceAll('setTimeout(resolve, 750)', 'setTimeout(resolve, 1)').replaceAll('setTimeout(resolve, 500)', 'setTimeout(resolve, 1)');
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

async function fixture(mode, status = 200, cold = false, refusesWake = false, failStarts = 0, failQueueAt = 0, options = {}) {
  const writes = []; let playing = false, active = !cold, queued = false, warmFirst = false, appended = [], failedStart = false, readsAfterStart = 0;
  const raw = t => ({ type: 'track', id: t.id, name: t.title, artists: [{ name: t.artist }], album: { images: [] } });
  const worker = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script: source, d1Databases: ['DB'], bindings: { DATA_ENCRYPTION_KEY: '01'.repeat(32) }, log: new Log(LogLevel.NONE), outboundService: async request => {
    const url = new URL(request.url), path = url.pathname;
    if (request.method !== 'GET') {
      const text = await request.text(); const body = text ? JSON.parse(text) : null;
      writes.push({ path, method: request.method, body, uri: url.searchParams.get('uri') });
      if (refusesWake && !active) return new Response(null, { status: 404 });
      active = true;
      if (path.endsWith('/queue')) {
        if (failQueueAt && appended.length === failQueueAt - 1) return new Response(null, { status: 503 });
        appended.push(tracks.find(t => t.uri === url.searchParams.get('uri')));
        if (!options.nativeQueue) playing = true;
      } else if (path.endsWith('/next')) {
        if (options.refuseNext) return new Response(null, { status: 404 });
        playing = true; warmFirst = true; appended.shift();
        if (options.lostNext) return new Response(null, { status: 503 });
      } else if (path.endsWith('/play')) {
        if (failStarts > 0) { failStarts--; failedStart = true; playing = false; queued = false; }
        else { playing = true; queued = true; }
      } else playing = true;
      return new Response(null, { status });
    }
    if (path.endsWith('/devices')) return Response.json({ devices: cold ? [] : [{ id: 'paused-phone', name: 'iPhone', type: 'Smartphone', is_active: playing }] });
    if (path.endsWith('/queue')) {
      if (failedStart && !playing && !options.nativeQueue) return new Response(null, { status: 204 }); // Missing queue data is not evidence of an empty queue.
      return Response.json({ currently_playing: playing ? raw(queued || warmFirst ? tracks[0] : tracks[19]) : null, queue: options.foreignQueue && failedStart ? [raw(tracks[19])] : mode === 'replace' ? (options.noQueueEcho ? [] : appended.length ? appended.map(raw) : queued ? tracks.slice(1).map(raw) : []) : [] });
    }
    if (!active) return new Response(null, { status: 204 });
    if (failedStart && options.delayedReads && ++readsAfterStart >= options.delayedReads) { playing = true; queued = true; }
    return Response.json({ device: { id: failedStart && options.rotateDevice ? 'other-device' : 'paused-phone' }, shuffle_state: false, repeat_state: 'off', is_playing: playing, item: playing ? raw(queued || warmFirst ? tracks[0] : tracks[19]) : null });
  } });
  const init = await worker.dispatchFetch('https://fixture.test/init'); assert.equal(init.status, 200, await init.text());
  return { worker, writes, confirmPlaying: () => { active = true; playing = true; queued = true; appended = []; }, makeReachable: () => { active = true; playing = true; warmFirst = true; }, restart: () => worker.dispatchFetch('https://fixture.test/send?restart=1'), send: () => worker.dispatchFetch('https://fixture.test/send?mode=' + mode) };
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

test('recovery leaves the saved first song playing and queues only the remaining songs even when every play command fails', async () => {
  const { worker, writes, send, restart, makeReachable } = await fixture('replace', 204, false, false, Infinity);
  try {
    await send(); assert.equal((await restart()).status, 409);
    makeReachable();
    const result = await (await restart()).json();
    assert.equal(result.state, 'complete'); assert.equal(result.recoveryAttempt, true);
    assert.equal(result.playbackConfirmed, true); assert.equal(result.sequenceConfirmed, true);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
    assert.deepEqual(writes.filter(w => w.path.endsWith('/queue')).map(w => w.uri), tracks.slice(1).map(t => t.uri));
    const repeated = await (await restart()).json();
    assert.equal(repeated.selectionId, result.selectionId);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
    assert.equal(writes.filter(w => w.path.endsWith('/queue')).length, 19);
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

test('partial queue recovery retains its receipt and cannot resend songs or restart playback', async () => {
  const { worker, writes, send, restart, makeReachable } = await fixture('replace', 204, false, false, Infinity, 6);
  try {
    await send(); makeReachable();
    const result = await (await restart()).json();
    assert.equal(result.state, 'uncertain'); assert.equal(result.recoveryAttempt, true); assert.equal(result.accepted, 6);
    const count = writes.length;
    assert.equal((await (await restart()).json()).state, 'uncertain'); assert.equal(writes.length, count);
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1);
    assert.equal(writes.filter(w => w.path.endsWith('/queue')).length, 6);
  } finally { await worker.dispose(); }
});


test('an accepted start that empties Spotify automatically rebuilds the real queue and starts it once', async () => {
  const { worker, writes, send } = await fixture('replace', 204, false, false, Infinity, 0, { nativeQueue: true });
  try {
    const response = await send(); assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.state, 'complete'); assert.equal(result.queueFallback, true); assert.equal(result.accepted, 20); assert.equal(result.playbackConfirmed, true); assert.equal(result.sequenceConfirmed, true);
    assert.deepEqual(writes.filter(w => w.path.endsWith('/queue')).map(w => w.uri), tracks.map(t => t.uri));
    assert.equal(writes.filter(w => w.path.endsWith('/play')).length, 1); assert.equal(writes.filter(w => w.path.endsWith('/next')).length, 1);
    const count = writes.length; const repeated = await (await send()).json(); assert.equal(repeated.state, 'complete'); assert.equal(writes.length, count);
    assert.ok(writes.every(w => !w.path.includes('/playlists')));
  } finally { await worker.dispose(); }
});

test('delayed original playback and a changed device or existing queue never trigger a rebuild', async () => {
  for (const options of [{ nativeQueue: true, delayedReads: 7 }, { nativeQueue: true, rotateDevice: true }, { nativeQueue: true, foreignQueue: true }]) {
    const { worker, writes, send } = await fixture('replace', 204, false, false, Infinity, 0, options);
    try {
      const result = await (await send()).json(); assert.equal(result.state, options.delayedReads ? 'complete' : 'unconfirmed'); assert.equal(result.queueFallback, false);
      assert.equal(writes.filter(w => w.path.endsWith('/queue') || w.path.endsWith('/next')).length, 0);
    } finally { await worker.dispose(); }
  }
});

test('a refused advance retains the queued songs and reload never enqueues or advances them again', async () => {
  const { worker, writes, send, restart } = await fixture('replace', 204, false, false, Infinity, 0, { nativeQueue: true, refuseNext: true });
  try {
    const result = await (await send()).json(); assert.equal(result.state, 'unconfirmed'); assert.equal(result.queueFallback, true); assert.equal(result.accepted, 20); assert.equal(result.recoveryAttempt, true);
    const count = writes.length; assert.equal((await (await send()).json()).state, 'unconfirmed'); assert.equal(writes.length, count); assert.equal((await restart()).status, 409);
    assert.equal(writes.filter(w => w.path.endsWith('/next')).length, 1);
  } finally { await worker.dispose(); }
});

test('a lost advance response can be confirmed later by reads without a second next command', async () => {
  const { worker, writes, send } = await fixture('replace', 204, false, false, Infinity, 0, { nativeQueue: true, lostNext: true });
  try {
    const first = await (await send()).json(); assert.equal(first.state, 'uncertain'); assert.equal(first.accepted, 20);
    const count = writes.length; const after = await (await send()).json(); assert.equal(after.state, 'complete'); assert.equal(after.sequenceConfirmed, true); assert.equal(writes.length, count);
    assert.equal(writes.filter(w => w.path.endsWith('/next')).length, 1);
  } finally { await worker.dispose(); }
});

test('partial automatic recovery and unobserved queue propagation never skip or resend', async () => {
  for (const options of [{ nativeQueue: true, failAt: 6 }, { nativeQueue: true, noQueueEcho: true }]) {
    const { worker, writes, send, confirmPlaying } = await fixture('replace', 204, false, false, Infinity, options.failAt ?? 0, options);
    try {
      const result = await (await send()).json(); assert.equal(result.queueFallback, true); assert.equal(result.accepted, options.failAt ? 5 : 20); assert.notEqual(result.state, 'complete');
      const count = writes.length; if (options.failAt) confirmPlaying(); const repeated = await (await send()).json(); assert.equal(repeated.accepted, result.accepted); assert.notEqual(repeated.state, 'complete'); assert.equal(writes.length, count); assert.equal(writes.filter(w => w.path.endsWith('/next')).length, 0);
    } finally { await worker.dispose(); }
  }
});
