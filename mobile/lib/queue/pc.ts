import { env } from 'cloudflare:workers';
import { db, seal, open, hash, random, body, response } from './server';
import { AppError } from './core.mjs';
import { bindComputer, claimMusicJob, finishMusicJob, musicProposals } from './pc-jobs.mjs';

type Bridge = { user_id: string; seen_at: number; ready: number; models: string };
type MusicRequest = { prompt: string; count: number; reserve: number; model?: string };
export async function computerStatus(owner: string) {
  const row = await db().prepare('SELECT user_id, seen_at, ready, models FROM pc_bridge WHERE id = 1 AND user_id = ?').bind(owner).first<Bridge>();
  const online = !!row && row.seen_at > Date.now() - 45_000;
  return { paired: !!row, online, connected: online && row!.ready === 1, models: online && row!.ready === 1 ? JSON.parse(row!.models) as { id: string; name: string }[] : [] };
}
// These endpoints have no browser identity. They require BOTH private Sites service
// access (consumed by Dispatch) and an independent computer credential. They never
// accept user IDs or proxy URLs from the computer. Pairing pins one existing owner.
export async function computerEndpoint(request: Request) {
  const supplied = request.headers.get('authorization') ?? '';
  if (!env.PC_BRIDGE_TOKEN_HASH || !/^Bearer [A-Za-z0-9_-]{43}$/.test(supplied) || await hash(supplied.slice(7)) !== env.PC_BRIDGE_TOKEN_HASH) throw new AppError('Computer access denied.', 401, 'pc_auth');
  if (request.headers.has('origin')) throw new AppError('Computer access only.', 403);
  const path = new URL(request.url).pathname;
  if (path === '/api/pc/register') return response({ paired: !!await bindComputer(db()) });
  const bridge = await db().prepare('SELECT user_id FROM pc_bridge WHERE id = 1').first<{ user_id: string }>();
  if (!bridge) throw new AppError('Pair this computer first.', 409);
  const owner = bridge.user_id, input = await body(request, 48_000), now = Date.now();
  // Operator diagnostic: one fixed music request, no Spotify reads or writes.
  if (path === '/api/pc/verify') {
    const songs = await proposeOnComputer(owner, 'Select one mellow song for work. Return a real released song.', 1);
    return response({ passed: songs.length > 0, suggestions: songs.length });
  }
  if (path === '/api/pc/poll' || path === '/api/pc/heartbeat') {
    if (typeof input.ready !== 'boolean' || !Array.isArray(input.models) || input.models.length > 100 || input.models.some((m: any) => typeof m.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(m.id) || typeof m.name !== 'string' || m.name.length > 120)) throw new AppError('Invalid computer status.');
    const models = input.ready ? input.models.map((m: any) => ({ id: m.id, name: m.name })) : [];
    await db().prepare('UPDATE pc_bridge SET seen_at = ?, ready = ?, models = ? WHERE id = 1 AND user_id = ?').bind(now, input.ready ? 1 : 0, JSON.stringify(models), owner).run();
    await db().prepare('DELETE FROM pc_requests WHERE expires_at < ?').bind(now).run();
    const claim = random(), job = input.ready && path === '/api/pc/poll' ? await claimMusicJob(db(), owner, claim, now) : null;
    return response({ job: job ? { id: job.id, claim, expires: job.expires_at, ...await open<MusicRequest>(job.sealed, owner) } : null });
  }
  if (path === '/api/pc/complete') {
    if (typeof input.id !== 'string' || input.id.length > 40 || typeof input.claim !== 'string' || input.claim.length !== 43 || typeof input.ok !== 'boolean') throw new AppError('Invalid computer result.');
    const job = await db().prepare("SELECT sealed FROM pc_requests WHERE id = ? AND user_id = ? AND claim = ? AND state = 'running' AND expires_at > ?").bind(input.id, owner, input.claim, now).first<{ sealed: string }>();
    if (!job) throw new AppError('This music request has expired or finished.', 409, 'pc_expired');
    const original = await open<MusicRequest>(job.sealed, owner);
    const value = input.ok ? { songs: musicProposals(input.songs, original.count + original.reserve) } : { error: 'The PC could not finish music selection. Check the ChatGPT connection and plan usage in desktop Queue Companion, then try a fresh request.' };
    const result = await finishMusicJob(db(), owner, input.id, input.claim, await seal(value, owner), input.ok ? 'complete' : 'failed', now);
    if (!result.meta.changes) throw new AppError('This music request has expired or finished.', 409);
    return response({ saved: true });
  }
  throw new AppError('Not found.', 404);
}
export async function proposeOnComputer(owner: string, prompt: string, count: number, model?: string) {
  const status = await computerStatus(owner);
  if (!status.connected) throw new AppError(status.online ? 'Reconnect ChatGPT in desktop Queue Companion, then refresh here.' : 'Your PC is offline. Keep it on, awake and connected to the internet, then refresh here.', 409, 'pc_offline');
  const id = crypto.randomUUID(), expires = Date.now() + 100_000;
  const chosen = status.models.find(m => m.id === model)?.id ?? status.models.find(m => m.id.includes('luna'))?.id ?? status.models[0]?.id;
  if (!chosen) throw new AppError('No ChatGPT models are available on your PC.', 409, 'chatgpt_connect');
  await db().prepare('DELETE FROM pc_requests WHERE user_id = ? AND expires_at < ?').bind(owner, Date.now()).run();
  const input = { prompt, count, reserve: Math.min(25, Math.ceil(count / 2)), model: chosen };
  const inserted = await db().prepare("INSERT OR IGNORE INTO pc_requests(id, user_id, state, sealed, expires_at) VALUES (?, ?, 'pending', ?, ?)").bind(id, owner, await seal(input, owner), expires).run();
  if (!inserted.meta.changes) throw new AppError('Your PC is already selecting songs. Wait for that request to finish.', 409, 'pc_busy');
  try {
    while (Date.now() < expires - 2000) {
      const row = await db().prepare('SELECT state, result FROM pc_requests WHERE id = ? AND user_id = ?').bind(id, owner).first<{ state: string; result: string }>();
      if (!row) throw new AppError('This music request was cancelled. Try a fresh request.', 409);
      if (row.state === 'failed') throw new AppError((await open<{ error: string }>(row.result, owner)).error, 503, 'chatgpt_failed');
      if (row.state === 'complete') return musicProposals((await open<{ songs: unknown }>(row.result, owner)).songs, count + input.reserve) as { title: string; artist: string }[];
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new AppError('The PC did not finish in time. Nothing was queued. Check the PC before trying a fresh request.', 504, 'pc_timeout');
  } finally { await db().prepare('DELETE FROM pc_requests WHERE id = ? AND user_id = ?').bind(id, owner).run(); }
}
