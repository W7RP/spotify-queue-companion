import { env } from 'cloudflare:workers';
import { getChatGPTUser, chatGPTSignInPath } from '@/app/chatgpt-auth';
import { AppError, guardOrigin } from './core.mjs';

export type Account = { spotify?: { access: string; refresh: string; expires: number; subject: string }; claudeKey?: string; model?: string; count?: number };
export type Song = { id: string; uri: string; title: string; artist: string; artistNames: string[]; artistIds: string[]; image: string; url: string; source: string };
export function db() { if (!env.DB) throw new AppError('The service is being prepared. Please try again shortly.', 503); return env.DB; }
export function origin() { if (!env.APP_ORIGIN) throw new AppError('The service is being prepared.', 503); return env.APP_ORIGIN; }
export function response(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export async function user() { const person = await getChatGPTUser(); if (!person) throw new AppError('Sign in to keep your Spotify connection private.', 401, 'sign_in'); return person; }
export function mutation(request: Request) {
  const expected = process.env.NODE_ENV === 'development' ? new URL(request.url).origin : origin(); guardOrigin(request, expected);
}
export async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('Send a JSON request.', 415);
  const reader = request.body?.getReader(); if (!reader) throw new AppError('Send a JSON request.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 12_000) { await reader.cancel(); throw new AppError('The request is too large.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw new AppError('Send a valid JSON object.'); }
}
function bytesToBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function key() {
  const value = env.DATA_ENCRYPTION_KEY; if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new AppError('Secure storage is being prepared.', 503);
  return crypto.subtle.importKey('raw', Uint8Array.from(value.match(/../g)!, hex => parseInt(hex, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(value: unknown, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); const plain = new TextEncoder().encode(JSON.stringify(value));
  try { const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner) }, await key(), plain); return bytesToBase64(iv) + '.' + bytesToBase64(new Uint8Array(result)); }
  finally { plain.fill(0); }
}
export async function open<T>(value: string, owner: string): Promise<T> {
  const [nonce, cipher] = value.split('.');
  const result = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(nonce), additionalData: new TextEncoder().encode(owner) }, await key(), base64ToBytes(cipher)));
  try { return JSON.parse(new TextDecoder().decode(result)); } finally { result.fill(0); }
}
export async function account(id: string): Promise<{ value: Account; revision: number }> {
  const row = await db().prepare('SELECT sealed, revision FROM accounts WHERE user_id = ?').bind(id).first<{ sealed: string; revision: number }>();
  return row ? { value: await open<Account>(row.sealed, id), revision: row.revision } : { value: {}, revision: -1 };
}
export async function saveAccount(id: string, value: Account, revision: number) {
  const sealed = await seal(value, id);
  const result = revision < 0
    ? await db().prepare('INSERT OR IGNORE INTO accounts(user_id, sealed, revision) VALUES (?, ?, 0)').bind(id, sealed).run()
    : await db().prepare('UPDATE accounts SET sealed = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?').bind(sealed, id, revision).run();
  if (!result.meta.changes) throw new AppError('Your connection changed. Refresh and try again.', 409, 'account_changed');
}
export function random() { return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export async function hash(value: string) { return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export async function boundedFetch(url: string, init: RequestInit = {}, timeout = 15_000) {
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout) });
}
export async function spotifyAccess(id: string) {
  const record = await account(id); const credentials = record.value.spotify;
  if (!credentials) throw new AppError('Connect Spotify in Settings.', 401, 'spotify_connect');
  if (credentials.expires > Date.now() + 60_000) return credentials;
  const refreshUntil = Date.now() + 20_000;
  const lock = await db().prepare('UPDATE accounts SET refresh_until = ? WHERE user_id = ? AND revision = ? AND refresh_until < ?').bind(refreshUntil, id, record.revision, Date.now()).run();
  if (!lock.meta.changes) throw new AppError('Spotify is reconnecting. Try again in a moment.', 409, 'refresh_busy');
  try {
    const result = await boundedFetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.SPOTIFY_CLIENT_ID!, grant_type: 'refresh_token', refresh_token: credentials.refresh }) });
    if (!result.ok) throw new AppError('Spotify sign-in expired. Reconnect in Settings.', 401, 'spotify_connect');
    const token = await result.json() as any;
    if (typeof token.access_token !== 'string' || !Number.isFinite(token.expires_in)) throw new AppError('Spotify could not refresh your connection.', 502);
    const updated = { ...credentials, access: token.access_token, refresh: token.refresh_token ?? credentials.refresh, expires: Date.now() + token.expires_in * 1000 };
    await saveAccount(id, { ...record.value, spotify: updated }, record.revision); return updated;
  } finally { await db().prepare('UPDATE accounts SET refresh_until = 0 WHERE user_id = ? AND refresh_until = ?').bind(id, refreshUntil).run(); }
}
export async function spotify(token: string, path: string, method = 'GET') {
  // Paths are constructed on the server. No visitor-controlled proxy URLs.
  if (!path.startsWith('/') || path.startsWith('//')) throw new AppError('Invalid music request.');
  const result = await boundedFetch('https://api.spotify.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + token } });
  if (!result.ok) {
    const wait = Math.min(3600, Math.max(1, Number(result.headers.get('Retry-After')) || 30));
    if (result.status === 429) throw new AppError(`Spotify is busy. Wait ${wait} seconds before trying again.`, 429, 'spotify_rate_limit', wait);
    if (result.status === 401) throw new AppError('Reconnect Spotify in Settings.', 401, 'spotify_connect');
    if (result.status === 403) throw new AppError('Spotify denied access. Check Premium and the developer app’s allowed users.', 403, 'spotify_access');
    if (result.status === 404) throw new AppError('No active Spotify device. Start a song on your iPhone, then refresh.', 404, 'spotify_device');
    throw new AppError('Spotify could not complete the request. Try again after checking Spotify.', 502, 'spotify_failed');
  }
  return result.status === 204 ? null : result.json() as Promise<any>;
}
export function song(raw: any, source = 'catalogue'): Song | null {
  raw = raw?.item ?? raw?.track ?? raw;
  if (!raw || raw.type !== 'track' || raw.is_local || raw.is_playable === false || !/^[a-zA-Z0-9]{22}$/.test(raw.id ?? '') || typeof raw.name !== 'string' || !raw.artists?.length) return null;
  return { id: raw.id, uri: 'spotify:track:' + raw.id, title: raw.name, artist: raw.artists.map((a: any) => a.name).join(', '), artistNames: raw.artists.map((a: any) => a.name), artistIds: raw.artists.map((a: any) => a.id).filter((id: string) => /^[a-zA-Z0-9]{22}$/.test(id)), image: /^https:\/\/i\.scdn\.co\//.test(raw.album?.images?.at(-1)?.url ?? '') ? raw.album.images.at(-1).url : '', url: 'https://open.spotify.com/track/' + raw.id, source };
}
export async function fail(error: unknown) {
  if (error instanceof AppError) return response({ error: error.message, code: error.code, retryAfter: error.retryAfter, ...(error.code === 'sign_in' ? { signInUrl: chatGPTSignInPath('/') } : {}) }, error.status);
  return response({ error: 'The request could not finish. Refresh and check your connections.', code: 'unavailable' }, 503);
}
