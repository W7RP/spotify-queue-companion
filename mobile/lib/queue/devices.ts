import { spotify, song } from './server';
import { availableDevices, chooseDevice } from './playback.mjs';
export async function playbackSnapshot(token: string) {
  const [state, rawDevices, queue] = await Promise.all([
    spotify(token, '/me/player'), spotify(token, '/me/player/devices'),
    spotify(token, '/me/player/queue').catch((error: any) => { if (error.code === 'spotify_device') return null; throw error; }),
  ]);
  const devices = availableDevices(rawDevices);
  if (state?.device?.id && !state.device.is_restricted && !devices.some((d: any) => d.id === state.device.id)) devices.push(...availableDevices({ devices: [{ ...state.device, is_active: true }] }));
  let device = null;
  try { device = chooseDevice(devices); } catch { /* Multiple or sleeping devices: generation remains available. */ }
  return { device, devices, playing: song(state?.item ?? queue?.currently_playing), queue: (queue?.queue ?? []).map((raw: any) => song(raw)).filter(Boolean), isPlaying: state?.is_playing === true };
}
