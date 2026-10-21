import { env } from 'cloudflare:workers';
import { response, user, account, saveAccount, fail, mutation, body, spotifyAccess, spotify, song, db, open } from '@/lib/queue/server';
import { AppError } from '@/lib/queue/core.mjs';
import { makeSelection, claudeModels } from '@/lib/queue/select';
import { addSelection, restartSelection, receipt, reviewQueue } from '@/lib/queue/commit';
import { playbackSnapshot } from '@/lib/queue/devices';
import { computerEndpoint, computerStatus } from '@/lib/queue/pc';
export async function GET(request: Request) {
  try {
    const person = await user(), path = new URL(request.url).pathname;
    if (path === '/api/status') {
      const record = await account(person.userId), lock = await db().prepare('SELECT job_id, expires_at FROM queue_locks WHERE user_id = ?').bind(person.userId).first();
      const pc = await computerStatus(person.userId);
      return response({ signedIn: true, spotify: !!record.value.spotify, claude: !!record.value.claudeKey, provider: record.value.provider ?? (record.value.claudeKey ? 'claude' : 'chatgpt'), chatgpt: pc.connected, pc, model: record.value.model ?? '', count: record.value.count ?? 15, mode: record.value.mode ?? 'replace', review: record.value.review ?? false, spotifyConfigured: !!env.SPOTIFY_CLIENT_ID, queueReview: !!lock, queueBusy: lock ? Number(lock.expires_at) > Date.now() : false });
    }
    if (path === '/api/playback') {
      const credentials = await spotifyAccess(person.userId);
      return response(await playbackSnapshot(credentials.access, person.userId));
    }
    if (path === '/api/models') { const record = await account(person.userId); return response({ models: record.value.provider === 'chatgpt' || !record.value.provider && !record.value.claudeKey ? (await computerStatus(person.userId)).models : record.value.provider !== 'spotify' && record.value.claudeKey ? await claudeModels(record.value.claudeKey) : [] }); }
    if (path === '/api/requests') {
      const result = await db().prepare('SELECT id, state, count, total, updated_at, sealed FROM queue_jobs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20').bind(person.userId).all();
      return response({ requests: await Promise.all(result.results.map(async (r: any) => ({ id: r.id, state: r.state, accepted: r.count, total: r.total, at: r.updated_at, ...await open<object>(r.sealed, person.userId) }))) });
    }
    if (path === '/api/selection') {
      const id = new URL(request.url).searchParams.get('id') ?? '';
      const row = await db().prepare('SELECT sealed FROM selections WHERE id = ? AND user_id = ? AND expires_at > ?').bind(id, person.userId, Date.now()).first<{ sealed: string }>();
      if (!row) throw new AppError('This selection expired. Make a new request.', 410);
      const selected = await open<any>(row.sealed, person.userId);
      return response({ id, tracks: selected.tracks, requested: selected.count, mode: selected.mode, note: selected.note, recoveryAttempt: !!selected.queueRecovery });
    }
    if (path === '/api/receipt') {
      const id = new URL(request.url).searchParams.get('selection') ?? '';
      return response({ receipt: await receipt(person.userId, id) });
    }
    return response({ error: 'Not found.' }, 404);
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    if (new URL(request.url).pathname.startsWith('/api/pc/')) return await computerEndpoint(request);
    mutation(request); const person = await user(), input = await body(request), path = new URL(request.url).pathname;
    if (path === '/api/settings') {
      const record = await account(person.userId);
      if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50 || typeof input.model !== 'string' || input.model.length > 120) throw new AppError('Choose a valid count and model.');
      if (input.provider !== undefined && !['chatgpt', 'claude', 'spotify'].includes(input.provider)) throw new AppError('Choose a valid music source.');
      if (input.mode !== undefined && !['append', 'replace'].includes(input.mode) || input.review !== undefined && typeof input.review !== 'boolean') throw new AppError('Choose valid playback settings.');
      await saveAccount(person.userId, { ...record.value, ...(input.mode !== undefined ? { mode: input.mode } : {}), ...(input.review !== undefined ? { review: input.review } : {}), count: input.count, model: input.model, ...(input.provider !== undefined ? { provider: input.provider } : {}) }, record.revision); return response({ saved: true });
    }
    if (path === '/api/claude/connect') {
      if (typeof input.key !== 'string' || input.key.length < 20 || input.key.length > 500 || /\s/.test(input.key)) throw new AppError('Enter a valid Claude API key.');
      const record = await account(person.userId), models = await claudeModels(input.key);
      if (!models.length) throw new AppError('No available models were found for that key.');
      await saveAccount(person.userId, { ...record.value, claudeKey: input.key, model: '', provider: 'claude' }, record.revision);
      return response({ connected: true, models });
    }
    if (path === '/api/disconnect') {
      const record = await account(person.userId);
      if (input.provider === 'spotify') { delete record.value.spotify; delete record.value.lastDevice; }
      else if (input.provider === 'claude') { delete record.value.claudeKey; delete record.value.model; }
      else throw new AppError('Choose a connection to disconnect.');
      await saveAccount(person.userId, record.value, record.revision);
      await db().prepare('DELETE FROM selections WHERE user_id = ?').bind(person.userId).run();
      await db().prepare('DELETE FROM oauth_attempts WHERE user_id = ?').bind(person.userId).run();
      return response({ disconnected: true });
    }
    if (path === '/api/select') {
      if (input.device !== undefined && (typeof input.device !== 'string' || input.device.length > 200)) throw new AppError('Choose the active Spotify device.');
      if (input.mode !== undefined && !['append', 'replace'].includes(input.mode)) throw new AppError('Choose a valid playback mode.');
      try { return response(await makeSelection(person.userId, input.prompt, input.count, input.device, input.choices, input.mode)); }
      catch (error: any) { if (error instanceof AppError && error.code === 'playlist_choice') return response({ error: error.message, code: error.code, choice: (error as any).choice }, 409); throw error; }
    }
    if (path === '/api/queue') {
      if (input.mode !== undefined && !['append', 'replace'].includes(input.mode)) throw new AppError('Choose a valid playback mode.');
      if (input.device !== undefined && (typeof input.device !== 'string' || input.device.length > 200)) throw new AppError('Choose a valid Spotify device.');
      return response(await addSelection(person.userId, input.selection, input.keepUris, input.mode, input.device));
    }
    if (path === '/api/queue/restart') return response(await restartSelection(person.userId, input.selection, input.keepUris, input.device));
    if (path === '/api/review') { await reviewQueue(person.userId); return response({ reviewed: true }); }
    if (path === '/api/erase') {
      // No operation can be resurrected by a pending token/model response after deletion.
      const lock = await db().prepare('SELECT expires_at FROM queue_locks WHERE user_id = ?').bind(person.userId).first<{ expires_at: number }>();
      if (lock && lock.expires_at > Date.now()) throw new AppError('Wait for the current queue change before removing saved data.', 409);
      await db().batch(['accounts', 'oauth_attempts', 'selections', 'queue_jobs', 'queue_locks', 'pc_requests'].map(table => db().prepare('DELETE FROM ' + table + ' WHERE user_id = ?').bind(person.userId)));
      return response({ erased: true });
    }
    return response({ error: 'Not found.' }, 404);
  } catch (error) { return fail(error); }
}
