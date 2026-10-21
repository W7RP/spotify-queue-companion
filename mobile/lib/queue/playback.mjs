import { AppError, enqueueSequential } from './core.mjs';

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
  throw new AppError(devices.length ? 'Choose which Spotify device should play this request.' : 'Spotify is not advertising a device. Your songs are kept; open the first one in Spotify, tap Play, then return to finish.', 409, 'spotify_device');
}
export function refreshedDeviceId(id, previous, current) {
  if (!id || current.some(d => d.id === id)) return id;
  const old = previous.find(d => d.id === id);
  if (!old?.name || !old.type) return id;
  const matches = current.filter(d => d.name === old.name && d.type === old.type);
  return matches.length === 1 ? matches[0].id : id;
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
// Once the user has started the first saved song, complete the actual queue.
// Never resend the URI-list play command that stopped playback on that client.
export async function continueSelection(tracks, send, checkpoint) {
  await checkpoint({ state: 'sending', accepted: 1 });
  const sent = await enqueueSequential(tracks.slice(1), send, async point => checkpoint({ ...point, accepted: point.accepted + 1 }));
  const result = { ...sent, accepted: sent.accepted + 1, total: tracks.length };
  await checkpoint(result);
  return result;
}
export function observeSelection(tracks, playing, queue, isPlaying, actualDevice, expectedDevice) {
  const playbackConfirmed = isPlaying === true && playing?.uri === tracks[0]?.uri && (!expectedDevice || actualDevice === expectedDevice);
  const expected = tracks.slice(1, 21), visible = queue.slice(0, expected.length);
  const sequenceConfirmed = playbackConfirmed && visible.length === expected.length && expected.every((track, i) => track.uri === visible[i]?.uri);
  return { playbackConfirmed, sequenceConfirmed };
}

// A queue rebuild is permitted only after an acknowledged start has left a
// known, empty player AND queue on the same device. Unknown reads are not empty.
export function knownPlayback(view, deviceId) {
  return view?.playerKnown === true && view.deviceId === deviceId && view.queueKnown === true && view.queueCount === view.queue.length;
}
export function emptyPlayback(view, deviceId) {
  return knownPlayback(view, deviceId) && view.isPlaying === false && !view.hasItem && view.queue.length === 0;
}
export async function recoverEmptyQueue(tracks, deviceId, read, enqueue, advance, checkpoint, wait = () => new Promise(resolve => setTimeout(resolve, 500))) {
  // Give delayed playback another chance. Never append into a still-loading,
  // existing or foreign queue, and never replay a timed-out original command.
  try {
    for (let i = 0; i < 3; i++) {
      if (!emptyPlayback(await read(), deviceId)) return null;
      if (i < 2) await wait();
    }
  } catch { return null; }
  let accepted = 0;
  const finish = async (state, message) => {
    const result = { state, accepted, total: tracks.length, queueFallback: true, ...(message ? { message } : {}) };
    await checkpoint(result); return result;
  };
  await checkpoint({ state: 'rebuilding', accepted: 0, queueFallback: true });
  try {
    for (const track of tracks) {
      const view = await read();
      const firstPlaying = view.hasItem && view.playing?.uri === tracks[0].uri && view.isPlaying === true;
      const expected = tracks.slice(firstPlaying ? 1 : 0, accepted);
      if (!knownPlayback(view, deviceId) || view.hasItem && !firstPlaying || !view.hasItem && view.isPlaying !== false || view.queue.length > expected.length || view.queue.some((t, i) => t.uri !== expected[i]?.uri)) {
        return await finish('unconfirmed', 'Spotify playback changed during queue recovery. Open Spotify to review it; nothing will be resent.');
      }
      await enqueue(track); accepted++;
      await checkpoint({ state: 'rebuilding', accepted, queueFallback: true });
    }
    for (let i = 0; i < 8; i++) {
      const view = await read();
      if (!knownPlayback(view, deviceId)) break;
      const observed = observeSelection(tracks, view.playing, view.queue, view.isPlaying, view.deviceId, deviceId);
      if (observed.sequenceConfirmed) return await finish('complete'); // Spotify may start the first queued item itself.
      if (view.hasItem) { if (view.playing?.uri !== tracks[0].uri || view.isPlaying !== true) break; }
      else {
        const visibleEnough = view.queue.length >= Math.min(20, tracks.length) && view.queue.length <= tracks.length && view.queue.every((t, n) => t.uri === tracks[n]?.uri);
        if (view.isPlaying === false && visibleEnough) {
          await checkpoint({ state: 'advancing', accepted, queueFallback: true });
          await advance(); // Exactly once, after the queued first song is visible. Never retry a lost response.
          for (let n = 0; n < 8; n++) {
            const after = await read();
            if (knownPlayback(after, deviceId) && observeSelection(tracks, after.playing, after.queue, after.isPlaying, after.deviceId, deviceId).sequenceConfirmed) return await finish('complete');
            if (n < 7) await wait();
          }
          break;
        }
      }
      if (i < 7) await wait();
    }
    return await finish('unconfirmed', 'Your songs were sent to Spotify’s queue, but playback is not confirmed. Open Spotify and check its queue. Refresh here afterward; no songs or playback commands will be resent.');
  } catch (error) {
    const known = error instanceof AppError && error.status < 500;
    return await finish(known ? 'unconfirmed' : 'uncertain', 'Spotify queue recovery could not be confirmed. Open Spotify to review the queued songs before making another request. Nothing will be resent automatically.');
  }
}

export async function preparePlaybackOrder(deviceId, read, write, wait = () => new Promise(resolve => setTimeout(resolve, 500))) {
  let state = await read();
  if (state?.device?.id !== deviceId || state?.is_playing === false) {
    // A no-play transfer can leave iOS suspended. Explicitly resume this known
    // device, then replace its context once it acknowledges the connection.
    await write('transfer', { device_ids: [deviceId], play: true });
    for (let attempt = 0; attempt < 6; attempt++) {
      state = await read();
      if (state?.device?.id === deviceId && state?.is_playing === true) break;
      await wait();
    }
    if (state?.device?.id !== deviceId || state?.is_playing !== true) throw new AppError('Spotify did not finish reconnecting. Your songs are kept; open the first one in Spotify, tap Play, then return to finish.', 409, 'spotify_device');
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
