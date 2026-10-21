import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDevices, chooseDevice, startSelection, continueSelection, recoverEmptyQueue, emptyPlayback, observeSelection, preparePlaybackOrder, refreshedDeviceId } from '../lib/queue/playback.mjs';
import { spotifyResponse } from '../lib/queue/http.mjs';
import { AppError } from '../lib/queue/core.mjs';
const tracks = Array.from({ length: 50 }, (_, i) => ({ uri: 'spotify:track:' + String(i).padStart(22, '0') }));

test('a paused available device can start playback without any current song', () => {
  const devices = availableDevices({ devices: [{ id: 'paused-phone', name: 'iPhone', is_active: false }, { id: 'restricted', is_restricted: true }] });
  assert.equal(chooseDevice(devices).id, 'paused-phone');
  assert.equal(chooseDevice(devices, 'paused-phone').id, 'paused-phone');
  assert.throws(() => chooseDevice(devices, 'old-device'), e => e.code === 'spotify_device');
  assert.throws(() => chooseDevice([]), /Your songs are kept/);
  assert.throws(() => chooseDevice([...devices, { id: 'computer' }]), /Choose which/);
});

test('Play now starts all 50 songs from the first URI in one write and records the full accepted list', async () => {
  const writes = [], points = [];
  const result = await startSelection(tracks, async body => writes.push(body), async point => points.push(point));
  assert.equal(writes.length, 1); assert.deepEqual(writes[0], { uris: tracks.map(t => t.uri), position_ms: 0 });
  assert.deepEqual(result, { state: 'complete', accepted: 50, total: 50 });
  assert.deepEqual(points, [{ state: 'sending', accepted: 0 }, result]);
});

test('a failed or uncertain playback command is not retried', async () => {
  for (const error of [new AppError('Unavailable device', 404), Error('Network lost')]) {
    let calls = 0; const points = [];
    const result = await startSelection(tracks, async () => { calls++; throw error; }, async point => points.push(point));
    assert.equal(calls, 1); assert.equal(result.accepted, 0); assert.equal(result.state, error instanceof AppError ? 'failed' : 'uncertain');
  }
});

test('playback observation separates the playing first song from old manual queue entries', () => {
  assert.deepEqual(observeSelection(tracks, tracks[0], tracks.slice(1, 21), true), { playbackConfirmed: true, sequenceConfirmed: true });
  assert.deepEqual(observeSelection(tracks, tracks[0], [{ uri: 'old-manual-song' }], true), { playbackConfirmed: true, sequenceConfirmed: false });
  assert.equal(observeSelection(tracks, tracks[0], tracks.slice(1), false).playbackConfirmed, false);
  assert.equal(observeSelection(tracks, tracks[0], tracks.slice(1), true, 'another-device', 'phone').playbackConfirmed, false);
});

test('write acknowledgements do not parse empty or non-JSON bodies; read responses still parse JSON', async () => {
  for (const status of [200, 202, 204]) for (const method of ['POST', 'PUT']) assert.equal(await spotifyResponse(new Response(null, { status }), method), null);
  assert.equal(await spotifyResponse(new Response('not a JSON document', { status: 200 }), 'POST'), null);
  assert.equal(await spotifyResponse(new Response(null, { status: 200 })), null);
  assert.deepEqual(await spotifyResponse(Response.json({ devices: [] })), { devices: [] });
});


test('shuffle and repeat-one are confirmed off before ordered playback, including on an inactive paused device', async () => {
  let state = null; const writes = [];
  await preparePlaybackOrder('phone', async () => state, async (kind, body) => {
    writes.push(kind);
    if (kind === 'transfer') { assert.deepEqual(body, { device_ids: ['phone'], play: true }); state = { device: { id: 'phone' }, is_playing: true, shuffle_state: true, repeat_state: 'track' }; }
    if (kind === 'shuffle') state.shuffle_state = body.state;
    if (kind === 'repeat') state.repeat_state = body.state;
  }, async () => {});
  assert.deepEqual(writes, ['transfer', 'shuffle', 'repeat']);
});

test('a lagging shuffle response is observed instead of racing the play command', async () => {
  let reads = 0, written = false;
  await preparePlaybackOrder('phone', async () => ({ device: { id: 'phone' }, shuffle_state: !written || ++reads < 3, repeat_state: 'off' }), async () => { written = true; }, async () => {});
  assert.equal(reads, 3);
  await assert.rejects(preparePlaybackOrder('phone', async () => ({ device: { id: 'phone' }, shuffle_state: true }), async () => {}, async () => {}), /not confirmed/);
});


test('a paused device is explicitly resumed before the full selection is sent', async () => {
  let playing = false; const calls = [];
  await preparePlaybackOrder('phone', async () => ({ device: { id: 'phone' }, is_playing: playing, shuffle_state: false, repeat_state: 'off' }), async (kind, value) => { calls.push({ kind, value }); playing = true; }, async () => {});
  assert.deepEqual(calls, [{ kind: 'transfer', value: { device_ids: ['phone'], play: true } }]);
});

test('a transfer acknowledgement cannot race a still-paused device into a replacement', async () => {
  let reads = 0;
  await preparePlaybackOrder('phone', async () => ({ device: { id: 'phone' }, is_playing: ++reads > 3, shuffle_state: false, repeat_state: 'off' }), async () => {}, async () => {});
  assert.equal(reads, 4);
  await assert.rejects(preparePlaybackOrder('phone', async () => ({ device: { id: 'phone' }, is_playing: false }), async () => {}, async () => {}), /did not finish reconnecting/);
});


test('a rotated device ID only follows a unique matching name and device type', () => {
  const old = [{ id: 'old', name: 'iPhone', type: 'Smartphone' }], current = [{ id: 'new', name: 'iPhone', type: 'Smartphone' }];
  assert.equal(refreshedDeviceId('old', old, current), 'new');
  assert.equal(refreshedDeviceId('old', old, [...current, { ...current[0], id: 'another' }]), 'old');
  assert.equal(refreshedDeviceId('old', old, [{ id: 'computer', name: 'iPhone', type: 'Computer' }]), 'old');
});


test('continue uses the queue endpoint callback for the remainder and counts the playing first song', async () => {
  const sent = [], points = [];
  const result = await continueSelection(tracks.slice(0, 5), async track => sent.push(track.uri), async point => points.push(point));
  assert.deepEqual(sent, tracks.slice(1, 5).map(t => t.uri)); assert.equal(result.accepted, 5); assert.equal(result.total, 5); assert.equal(result.state, 'complete'); assert.equal(points[0].accepted, 1);
  let calls = 0; const single = await continueSelection(tracks.slice(0, 1), async () => { calls++; }, async () => {}); assert.equal(calls, 0); assert.equal(single.accepted, 1);
});

test('five visible successors cannot confirm a longer selection missing the rest', () => {
  assert.equal(observeSelection(tracks, tracks[0], tracks.slice(1, 6), true).sequenceConfirmed, false);
});


function emptyQueueFixture(options = {}) {
  const list = tracks.slice(0, options.count ?? 5), sent = [], points = [];
  let view = { playerKnown: true, queueKnown: true, queueCount: 0, deviceId: 'phone', hasItem: false, isPlaying: false, playing: null, queue: [] }, advances = 0, reads = 0;
  const update = value => { view = { ...view, ...value }; view.queueCount = view.queue.length; };
  return { list, sent, points, update, get advances() { return advances; }, run: () => recoverEmptyQueue(list, 'phone', async () => {
    reads++; options.onRead?.(reads, view, update, sent); return { ...view };
  }, async track => {
    if (options.failAt === sent.length + 1) throw new AppError('Busy', 429);
    sent.push(track.uri); update({ queue: [...view.queue, track] });
    if (options.lostEnqueueAt === sent.length) throw new AppError('Bad gateway', 502);
    if (options.autoStart && sent.length === 1) update({ hasItem: true, isPlaying: true, playing: list[0], queue: [] });
  }, async () => {
    advances++; update({ hasItem: true, isPlaying: true, playing: list[0], queue: view.queue.slice(1) });
    if (options.lostAdvance) throw Error('Response lost');
  }, async point => points.push(point), async () => {}) };
}

test('a confirmed empty player rebuilds its actual queue and advances exactly once after the songs are visible', async () => {
  const f = emptyQueueFixture({ count: 50 }); const result = await f.run();
  assert.equal(result.state, 'complete'); assert.equal(result.accepted, 50); assert.equal(result.queueFallback, true);
  assert.deepEqual(f.sent, tracks.map(t => t.uri)); assert.equal(f.advances, 1);
  assert.equal(f.points[0].state, 'rebuilding'); assert.equal(f.points.at(-1).state, 'complete');
  assert.equal(await f.run(), null); assert.equal(f.advances, 1); assert.equal(f.sent.length, 50);
});

test('delayed original playback prevents recovery writes and never skips its first song', async () => {
  const f = emptyQueueFixture({ onRead: (n, view, update) => { if (n === 2) update({ hasItem: true, isPlaying: true, playing: tracks[0], queue: tracks.slice(1, 5) }); } });
  assert.equal(await f.run(), null); assert.equal(f.sent.length, 0); assert.equal(f.advances, 0);
});

test('unknown reads, a missing device, paused songs and existing queues cannot be treated as empty', async () => {
  for (const changes of [{ playerKnown: false }, { queueKnown: false }, { deviceId: 'other' }, { hasItem: true, playing: tracks[0] }, { queue: [tracks[10]] }]) {
    const f = emptyQueueFixture(); f.update(changes); assert.equal(await f.run(), null); assert.equal(f.sent.length, 0); assert.equal(f.advances, 0);
  }
  assert.equal(emptyPlayback({ playerKnown: true, queueKnown: true, deviceId: 'phone', queue: [], queueCount: 1, isPlaying: false, hasItem: false }, 'phone'), false);
});

test('a device or song change during a rebuild halts before another enqueue or next command', async () => {
  for (const changes of [{ deviceId: 'other' }, { hasItem: true, isPlaying: true, playing: tracks[10] }, { queue: [tracks[10]] }]) {
    const f = emptyQueueFixture({ onRead: (n, view, update, sent) => { if (sent.length === 2) update(changes); } });
    const result = await f.run(); assert.equal(result.state, 'unconfirmed'); assert.equal(result.accepted, 2); assert.equal(f.sent.length, 2); assert.equal(f.advances, 0);
  }
});

test('the first queued song starting itself does not receive a next command', async () => {
  const f = emptyQueueFixture({ autoStart: true }); const result = await f.run();
  assert.equal(result.state, 'complete'); assert.equal(f.advances, 0); assert.equal(f.sent.length, 5);
});

test('a partial enqueue failure or lost advance response never retries either command', async () => {
  const partial = emptyQueueFixture({ failAt: 3 }); const one = await partial.run();
  assert.equal(one.state, 'unconfirmed'); assert.equal(one.accepted, 2); assert.equal(partial.sent.length, 2); assert.equal(partial.advances, 1);
  const lost = emptyQueueFixture({ lostAdvance: true }); const two = await lost.run();
  assert.equal(two.state, 'uncertain'); assert.equal(two.accepted, 5); assert.equal(lost.advances, 1);
});


test('an ambiguous enqueue is counted only after its exact queue position is observed', async () => {
  let delayed = 0;
  const f = emptyQueueFixture({ lostEnqueueAt: 3, onRead: (n, view, update, sent) => {
    if (sent.length === 3) { delayed++; update({ queue: tracks.slice(0, delayed < 3 ? 2 : 3) }); }
  } });
  const result = await f.run(); assert.equal(result.state, 'complete'); assert.equal(result.accepted, 5);
  assert.deepEqual(f.sent, tracks.slice(0, 5).map(t => t.uri)); assert.equal(f.advances, 1);
});

test('brief missing playback reads during delivery recover without forgetting the selected device', async () => {
  let missing = 0;
  const f = emptyQueueFixture({ onRead: (n, view, update, sent) => {
    if (sent.length === 2) { missing++; update({ playerKnown: missing >= 3, deviceId: missing >= 3 ? 'phone' : '' }); }
  } });
  const result = await f.run(); assert.equal(result.state, 'complete'); assert.equal(f.sent.length, 5); assert.equal(f.advances, 1);
});
