import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDevices, chooseDevice, startSelection, observeSelection, preparePlaybackOrder } from '../lib/queue/playback.mjs';
import { spotifyResponse } from '../lib/queue/http.mjs';
import { AppError } from '../lib/queue/core.mjs';
const tracks = Array.from({ length: 50 }, (_, i) => ({ uri: 'spotify:track:' + String(i).padStart(22, '0') }));

test('a paused available device can start playback without any current song', () => {
  const devices = availableDevices({ devices: [{ id: 'paused-phone', name: 'iPhone', is_active: false }, { id: 'restricted', is_restricted: true }] });
  assert.equal(chooseDevice(devices).id, 'paused-phone');
  assert.equal(chooseDevice(devices, 'paused-phone').id, 'paused-phone');
  assert.throws(() => chooseDevice(devices, 'old-device'), e => e.code === 'spotify_device');
  assert.throws(() => chooseDevice([]), /do not need to start a song/);
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
    if (kind === 'transfer') { assert.deepEqual(body, { device_ids: ['phone'], play: false }); state = { device: { id: 'phone' }, shuffle_state: true, repeat_state: 'track' }; }
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
