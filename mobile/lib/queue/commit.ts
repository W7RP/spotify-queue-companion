import { AppError, enqueueSequential } from './core.mjs';
import { renewQueueLease, releaseReviewedLease } from './lease.mjs';
import { db, open, seal, spotifyAccess, spotify, account, type Song } from './server';

async function getJob(userId: string, selectionId: string) {
  return db().prepare('SELECT id, state, count, total, updated_at FROM queue_jobs WHERE user_id = ? AND selection_id = ?').bind(userId, selectionId).first<{ id: string; state: string; count: number; total: number; updated_at: number }>();
}
export async function receipt(userId: string, selectionId: string) {
  const job = await getJob(userId, selectionId);
  if (!job) return null;
  const stale = ['sending', 'writing', 'preparing'].includes(job.state) && Date.now() - job.updated_at > 90_000;
  return { id: job.id, state: stale ? 'uncertain' : job.state, accepted: job.count, total: job.total,
    message: stale || job.state === 'uncertain' ? 'A previous queue change could not be confirmed. Check Spotify’s Queue before adding more songs.' : undefined };
}
export async function addSelection(userId: string, selectionId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(selectionId)) throw new AppError('That selection is no longer available.');
  const existing = await receipt(userId, selectionId); if (existing) return existing;
  const row = await db().prepare('SELECT sealed FROM selections WHERE id = ? AND user_id = ? AND expires_at > ?').bind(selectionId, userId, Date.now()).first<{ sealed: string }>();
  if (!row) throw new AppError('This selection expired. Make a new request.', 410);
  const selection = await open<any>(row.sealed, userId); const tracks = selection.tracks as Song[];
  if (!Array.isArray(tracks) || tracks.length < 1 || tracks.length > 50 || tracks.some(t => !/^spotify:track:[a-zA-Z0-9]{22}$/.test(t.uri))) throw new AppError('The selection is invalid. Nothing was queued.');
  const id = crypto.randomUUID();
  // A lock never expires by itself: a disconnected request may have reached Spotify.
  // Only a completed/known-failed run or an explicit queue review can release it.
  const locked = await db().prepare('INSERT OR IGNORE INTO queue_locks(user_id, job_id, expires_at) VALUES (?, ?, ?)').bind(userId, id, Date.now() + 90_000).run();
  if (!locked.meta.changes) throw new AppError('Review the previous queue change in Spotify before adding more songs.', 409, 'queue_review');
  let created = false, writing = false;
  try {
    const duplicate = await receipt(userId, selectionId); if (duplicate) return duplicate;
    const credentials = await spotifyAccess(userId);
    if (credentials.subject !== selection.subject) throw new AppError('Spotify account changed. Make a new request.', 409);
    const state = await spotify(credentials.access, '/me/player');
    if (state?.device?.id !== selection.deviceId || state.device.is_restricted) throw new AppError('Playback moved to another device. Refresh and submit a new request.', 409, 'spotify_device');
    // Recheck source membership immediately before the first write.
    if (selection.sourceUris?.length || selection.liked || selection.includedUris?.length) {
      const members = async (path: string) => {
        const ids = new Set<string>();
        for (let offset = 0; offset < 200; offset += 50) {
          const page = await spotify(credentials.access, path + '?limit=50&offset=' + offset);
          for (const item of page.items ?? []) { const track = item.item ?? item.track; if (track?.uri) ids.add(track.uri); }
          if (!page.next) break;
        }
        return ids;
      };
      const union = new Set<string>();
      for (const uri of selection.sourceUris ?? []) for (const item of await members('/playlists/' + uri.split(':')[2] + '/items')) union.add(item);
      const liked = selection.liked ? await members('/me/tracks') : null;
      if (tracks.some(track => selection.sourceUris?.length && !union.has(track.uri) || liked && !liked.has(track.uri))) throw new AppError('A selected song left the requested source. Nothing was queued.', 409);
      if (selection.familiar) {
        const included = new Set<string>();
        for (const uri of selection.includedUris ?? []) for (const item of await members('/playlists/' + uri.split(':')[2] + '/items')) included.add(item);
        if (tracks.slice(0, selection.familiar).some(track => !included.has(track.uri))) throw new AppError('An included original left its playlist. Nothing was queued.', 409);
      }
    }
    if ((await account(userId)).value.spotify?.subject !== credentials.subject) throw new AppError('Spotify disconnected. Nothing was queued.', 409);
    await db().prepare('INSERT INTO queue_jobs(id, user_id, selection_id, state, count, total, updated_at, sealed) VALUES (?, ?, ?, ?, 0, ?, ?, ?)')
      .bind(id, userId, selectionId, 'preparing', tracks.length, Date.now(), await seal({ prompt: selection.prompt, requested: selection.count, deviceName: selection.deviceName }, userId)).run();
    created = true;
    const result = await enqueueSequential(tracks,
      async (track: Song) => {
        const current = (await account(userId)).value.spotify;
        if (!current || current.access !== credentials.access || current.subject !== credentials.subject) throw new AppError('Spotify connection changed. Queueing stopped.', 409);
        await renewQueueLease(db(), userId, id);
        writing = true; await spotify(credentials.access, '/me/player/queue?' + new URLSearchParams({ uri: track.uri, device_id: selection.deviceId }), 'POST');
      },
      async (checkpoint: { state: string; accepted: number }) => {
        await renewQueueLease(db(), userId, id);
        await db().prepare('UPDATE queue_jobs SET state = ?, count = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(checkpoint.state, checkpoint.accepted, Date.now(), id, userId).run();
      });
    if (result.state !== 'uncertain') await db().prepare('DELETE FROM queue_locks WHERE user_id = ? AND job_id = ?').bind(userId, id).run();
    return { id, ...result };
  } catch (error) {
    if (created && writing) {
      await db().prepare('UPDATE queue_jobs SET state = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind('uncertain', Date.now(), id, userId).run();
      throw new AppError('A queue change could not be confirmed. Check Spotify’s Queue before adding more songs.', 409, 'queue_review');
    }
    throw error;
  } finally {
    if (!created || !writing) await db().prepare('DELETE FROM queue_locks WHERE user_id = ? AND job_id = ?').bind(userId, id).run();
  }
}
export async function reviewQueue(userId: string) {
  const lock = await releaseReviewedLease(db(), userId);
  if (!lock) return;
  await db().prepare('UPDATE queue_jobs SET state = ? WHERE id = ? AND user_id = ? AND state != ?').bind('reviewed', lock.job_id, userId, 'complete').run();
}
