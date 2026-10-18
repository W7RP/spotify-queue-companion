import { spotify, song, account, saveAccount, db, open, type DeviceHint } from './server';
import { availableDevices, chooseDevice } from './playback.mjs';
export async function rememberedDevice(owner: string): Promise<DeviceHint | null> {
  const record = await account(owner);
  if (record.value.lastDevice?.subject === record.value.spotify?.subject && record.value.lastDevice && record.value.lastDevice.seen > Date.now() - 3_600_000) return record.value.lastDevice;
  // Upgrade path: retain only recent device metadata, never expose expired songs.
  const rows = await db().prepare('SELECT id, sealed, expires_at FROM selections WHERE user_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 5').bind(owner, Date.now() - 3_000_000).all();
  for (const row of rows.results as any[]) {
    const selected = await open<any>(row.sealed, owner);
    if (!selected.deviceId || selected.subject !== record.value.spotify?.subject) continue;
    const job = await db().prepare('SELECT sealed FROM queue_jobs WHERE user_id = ? AND selection_id = ?').bind(owner, row.id).first<{ sealed: string }>();
    const details = job ? await open<any>(job.sealed, owner) : {};
    const hint = { id: selected.deviceId, name: details.deviceName ?? 'Previous Spotify device', type: '', seen: row.expires_at - 600_000, subject: selected.subject };
    try { await saveAccount(owner, { ...record.value, lastDevice: hint }, record.revision); } catch (error: any) { if (error.code !== 'account_changed') throw error; }
    return hint;
  }
  return null;
}
export async function rememberDevice(owner: string, device: { id: string; name: string; type: string }) {
  const record = await account(owner), old = record.value.lastDevice;
  if (!record.value.spotify || old?.id === device.id && old.seen > Date.now() - 300_000) return;
  try { await saveAccount(owner, { ...record.value, lastDevice: { id: device.id, name: device.name, type: device.type, seen: Date.now(), subject: record.value.spotify.subject } }, record.revision); }
  catch (error: any) { if (error.code !== 'account_changed') throw error; }
}
export async function controllableDevices(token: string) {
  const [state, raw] = await Promise.all([spotify(token, '/me/player'), spotify(token, '/me/player/devices')]);
  const devices = availableDevices(raw);
  if (state?.device?.id && !state.device.is_restricted && !devices.some((d: any) => d.id === state.device.id)) devices.push(...availableDevices({ devices: [{ ...state.device, is_active: true }] }));
  return { state, devices };
}
export async function resolveDevice(owner: string, token: string, requested: string, selectionDevice = '') {
  const { devices } = await controllableDevices(token);
  const remembered = await rememberedDevice(owner), id = requested || selectionDevice || remembered?.id || '';
  const current = devices.find((d: any) => d.id === id);
  if (current) return current;
  if (remembered?.id === id && remembered.type) {
    const same = devices.filter((d: any) => d.name === remembered.name && d.type === remembered.type);
    if (same.length === 1) return same[0];
  }
  // A bounded activation attempt against the owner's previously selected device.
  // Never substitute an unrelated active computer/speaker for a missing phone.
  if (id && (remembered?.id === id || selectionDevice === id)) return { id, name: remembered?.name ?? 'Previous Spotify device', type: remembered?.type ?? '', active: false, restricted: false };
  return chooseDevice(devices, requested);
}
export async function playbackSnapshot(token: string, owner: string) {
  const [state, rawDevices, queue] = await Promise.all([
    spotify(token, '/me/player'), spotify(token, '/me/player/devices'),
    spotify(token, '/me/player/queue').catch((error: any) => { if (error.code === 'spotify_device') return null; throw error; }),
  ]);
  const devices = availableDevices(rawDevices);
  if (state?.device?.id && !state.device.is_restricted && !devices.some((d: any) => d.id === state.device.id)) devices.push(...availableDevices({ devices: [{ ...state.device, is_active: true }] }));
  let device = null;
  try { device = chooseDevice(devices); } catch { /* Multiple or sleeping devices: generation remains available. */ }
  if (device) await rememberDevice(owner, device);
  const remembered = !device && !devices.length ? await rememberedDevice(owner) : null;
  const lastDevice = remembered ? { id: remembered.id, name: remembered.name, type: remembered.type, active: false, restricted: false, available: false } : null;
  return { device: device ?? lastDevice, devices: devices.length ? devices : lastDevice ? [lastDevice] : [], playing: song(state?.item ?? queue?.currently_playing), queue: (queue?.queue ?? []).map((raw: any) => song(raw)).filter(Boolean), isPlaying: state?.is_playing === true };
}
