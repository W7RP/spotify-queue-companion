import { env } from 'cloudflare:workers';
import { db, seal, open, hash, random, body, response } from './server';
import { AppError } from './core.mjs';
import { fastModel, validateMusicBrief, type MusicBrief } from './curation';
import { bindComputer, claimMusicJob, finishMusicJob, musicProposals } from './pc-jobs.mjs';

type Bridge = { user_id: string; seen_at: number; ready: number; models: string };
type MusicRequest = { prompt: string; count: number; reserve: number; model?: string; structured?: boolean; avoid?: {title:string;artist:string}[]; refillCount?: number; brief?: MusicBrief };
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
  // Operator diagnostic: bounded music inference only, no Spotify reads or writes.
  if (path === '/api/pc/verify') {
    if(input.prompt!==undefined&&(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>1000))throw new AppError('Use a bounded music test request.');
    const songs = await proposeOnComputer(owner, input.prompt ?? 'Select one mellow song for work. Return a real released song.', 1);
    return response({ passed: songs.songs.length > 0, suggestions: songs.songs.length, kind: songs.brief.kind, referenceType: songs.brief.referenceType ?? (songs.brief.referenceArtists.length ? 'artist' : 'none'), memberCount: songs.brief.collectiveMembers?.length ?? 0 });
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
    let state:'complete'|'failed'=input.ok?'complete':'failed';
    let value:object={error:'The PC could not finish music selection. Check the ChatGPT connection and plan usage in desktop Queue Companion, then try a fresh request.'};
    if(input.ok) {
      try {value={songs:musicProposals(input.songs,(original.refillCount||original.count)+original.reserve),brief:validateMusicBrief(input.brief,original.prompt,original.count)};}
      catch (error) {
        const categories = new Map([
          ['The computer returned an invalid song list.', 'songs'],
          ['The music brief could not be read. Nothing was queued.', 'brief_missing'],
          ['The music brief exceeded selection limits. Nothing was queued.', 'brief_limits'],
          ['The music brief introduced an artist restriction that was not requested. Nothing was queued.', 'brief_artist'],
          ['The music brief changed an inspiration into an artist-only request. Nothing was queued.', 'brief_artist_only'],
          ['The music brief invented an artist exclusion. Nothing was queued.', 'brief_exclusion'],
        ]);
        console.warn(JSON.stringify({event:'pc_result_rejected',reason:categories.get(error instanceof Error ? error.message : '') ?? 'unexpected',hasBrief:!!input.brief,referenceArtistCount:Array.isArray(input.brief?.referenceArtists)?input.brief.referenceArtists.length:null,songCount:Array.isArray(input.songs)?input.songs.length:null}));
        state='failed';value={error:input.brief == null ? 'The PC returned no music brief. Update desktop Queue Companion, then try a fresh request. Nothing was queued.' : 'The PC returned an invalid music brief or song list. Try a fresh request. Nothing was queued.'};
      }
    }
    const result = await finishMusicJob(db(), owner, input.id, input.claim, await seal(value, owner), state, now);
    if (!result.meta.changes) throw new AppError('This music request has expired or finished.', 409);
    return response({ saved: true });
  }
  throw new AppError('Not found.', 404);
}
export async function proposeOnComputer(owner: string, prompt: string, count: number, model?: string, refill?: {avoid:{title:string;artist:string}[]; refillCount:number; brief:MusicBrief}) {
  const status = await computerStatus(owner);
  if (!status.connected) throw new AppError(status.online ? 'Reconnect ChatGPT in desktop Queue Companion, then refresh here.' : 'Your PC is offline. Keep it on, awake and connected to the internet, then refresh here.', 409, 'pc_offline');
  const id = crypto.randomUUID(), expires = Date.now() + (refill ? 25_000 : 100_000);
  const chosen = fastModel(status.models, 'chatgpt', model);
  if (!chosen) throw new AppError('No ChatGPT models are available on your PC.', 409, 'chatgpt_connect');
  await db().prepare('DELETE FROM pc_requests WHERE user_id = ? AND expires_at < ?').bind(owner, Date.now()).run();
  const input = { prompt, count, reserve: Math.min(25, Math.ceil((refill?.refillCount || count) / 2)), model: chosen, structured: true, ...(refill ?? {}) };
  const inserted = await db().prepare("INSERT OR IGNORE INTO pc_requests(id, user_id, state, sealed, expires_at) VALUES (?, ?, 'pending', ?, ?)").bind(id, owner, await seal(input, owner), expires).run();
  if (!inserted.meta.changes) throw new AppError('Your PC is already selecting songs. Wait for that request to finish.', 409, 'pc_busy');
  try {
    while (Date.now() < expires - 2000) {
      const row = await db().prepare('SELECT state, result FROM pc_requests WHERE id = ? AND user_id = ?').bind(id, owner).first<{ state: string; result: string }>();
      if (!row) throw new AppError('This music request was cancelled. Try a fresh request.', 409);
      if (row.state === 'failed') throw new AppError((await open<{ error: string }>(row.result, owner)).error, 503, 'chatgpt_failed');
      if (row.state === 'complete') { const result = await open<{songs:unknown;brief:unknown}>(row.result, owner); return {songs:musicProposals(result.songs,(refill?.refillCount || count)+input.reserve) as {title:string;artist:string}[],brief:validateMusicBrief(result.brief,prompt,count),model:chosen}; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new AppError('The PC did not finish in time. Nothing was queued. Check the PC before trying a fresh request.', 504, 'pc_timeout');
  } finally { await db().prepare('DELETE FROM pc_requests WHERE id = ? AND user_id = ?').bind(id, owner).run(); }
}
