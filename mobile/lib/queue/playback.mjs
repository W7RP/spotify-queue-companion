import { AppError } from './core.mjs';

export function availableDevices(raw) {
  const seen = new Set();
  return (raw?.devices ?? []).filter(d => d && typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 200 && !d.is_restricted && !seen.has(d.id) && seen.add(d.id)).map(d => ({ id: d.id, name: String(d.name ?? 'Spotify device').slice(0, 100), type: String(d.type ?? ''), active: d.is_active === true, restricted: false }));
}
export function chooseDevice(devices, requested = '') {
  if (requested) {
    const match = devices.find(d => d.id === requested);
    if (!match) throw new AppError('That Spotify device is no longer available. Open Spotify and choose the device again.', 409, 'spotify_device');
    return match;
  }
  const active = devices.find(d => d.active);
  if (active) return active;
  if (devices.length === 1) return devices[0];
  throw new AppError(devices.length ? 'Choose which Spotify device should play this request.' : 'Open Spotify on your iPhone, then refresh devices. You do not need to start a song.', 409, 'spotify_device');
}
// The write response confirms acceptance of the entire list. Playback observation
// is separate: a slow/missing read must never replay a successful PUT.
export async function startSelection(tracks, send, checkpoint) {
  await checkpoint({ state: 'sending', accepted: 0 });
  try { await send({ uris: tracks.map(t => t.uri), position_ms: 0 }); }
  catch (error) {
    const known = error instanceof AppError && error.status < 500;
    const result = { state: known ? 'failed' : 'uncertain', accepted: 0, total: tracks.length, message: known ? error.message : 'Spotify may have started this selection, but the response was lost. Check playback before trying again.' };
    await checkpoint(result); return result;
  }
  const result = { state: 'complete', accepted: tracks.length, total: tracks.length };
  await checkpoint(result); return result;
}
export function observeSelection(tracks, playing, queue, isPlaying) {
  const playbackConfirmed = isPlaying === true && playing?.uri === tracks[0]?.uri;
  const expected = tracks.slice(1, 6), visible = queue.slice(0, expected.length);
  const sequenceConfirmed = playbackConfirmed && visible.length === expected.length && expected.every((track, i) => track.uri === visible[i]?.uri);
  return { playbackConfirmed, sequenceConfirmed };
}

export async function preparePlaybackOrder(deviceId, read, write, wait = () => new Promise(resolve => setTimeout(resolve, 500))) {
  let state = await read();
  if (state?.device?.id !== deviceId) {
    await write('transfer', { device_ids: [deviceId], play: false });
    for (let attempt = 0; attempt < 6; attempt++) {
      state = await read();
      if (state?.device?.id === deviceId) break;
      await wait();
    }
    if (state?.device?.id !== deviceId) throw new AppError('Spotify has not activated that device yet. Keep Spotify open, refresh devices and try again.', 409, 'spotify_device');
  }
  const shuffle = state.shuffle_state !== false, repeatTrack = state.repeat_state === 'track';
  if (shuffle) await write('shuffle', { state: false });
  if (repeatTrack) await write('repeat', { state: 'off' });
  if (shuffle || repeatTrack) {
    for (let attempt = 0; attempt < 6; attempt++) {
      state = await read();
      if (state?.device?.id !== deviceId) throw new AppError('Playback moved to another device. Choose your device again.', 409, 'spotify_device');
      if (state.shuffle_state === false && state.repeat_state !== 'track') return;
      await wait();
    }
    throw new AppError('Spotify has not confirmed ordered playback yet. Nothing was started. Try again in a moment.', 409, 'spotify_order');
  }
}
