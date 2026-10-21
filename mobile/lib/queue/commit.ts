import { AppError, enqueueSequential, uniqueTracks } from './core.mjs';
import { renewQueueLease, releaseReviewedLease } from './lease.mjs';
import { chooseDevice, availableDevices, startSelection, observeSelection, preparePlaybackOrder } from './playback.mjs';
import { reviewedSelection } from './review.mjs';
import { db, open, seal, spotifyAccess, spotify, account, song, type Song } from './server';
import { resolveDevice, rememberDevice } from './devices';

async function getJob(userId: string, selectionId: string) {
  return db().prepare('SELECT id, state, count, total, updated_at, sealed FROM queue_jobs WHERE user_id = ? AND selection_id = ?').bind(userId, selectionId).first<{ id: string; state: string; count: number; total: number; updated_at: number; sealed: string }>();
}
export async function receipt(userId: string, selectionId: string) {
  const job = await getJob(userId, selectionId);
  if (!job) return null;
  const details = await open<any>(job.sealed, userId);
  const row = await db().prepare('SELECT sealed FROM selections WHERE id = ? AND user_id = ? AND expires_at > ?').bind(selectionId, userId, Date.now()).first<{ sealed: string }>();
  const selection = row ? await open<any>(row.sealed, userId) : null;
  const tracks = selection ? (details.selectedIndexes ?? selection.tracks.map((_: any, i: number) => i)).map((i: number) => selection.tracks[i]) : [];
  if (job.state === 'unconfirmed' && tracks.length) {
    try {
      const credentials = await spotifyAccess(userId);
      if (credentials.subject === selection.subject) {
        const [state, queue] = await Promise.all([spotify(credentials.access, '/me/player'), spotify(credentials.access, '/me/player/queue')]);
        const observed = observeSelection(tracks, song(state?.item ?? queue?.currently_playing), (queue?.queue ?? []).map((t: any) => song(t)).filter(Boolean), state?.is_playing, state?.device?.id, details.deviceId);
        if (observed.sequenceConfirmed) {
          Object.assign(details, observed, { message: undefined });
          await db().prepare("UPDATE queue_jobs SET state = 'complete', sealed = ?, updated_at = ? WHERE id = ? AND user_id = ? AND state = 'unconfirmed'").bind(await seal(details, userId), Date.now(), job.id, userId).run();
          await db().prepare('DELETE FROM queue_locks WHERE user_id = ? AND job_id = ?').bind(userId, job.id).run();
          job.state = 'complete';
        }
      }
    } catch { /* A status check never resends playback or hides an unconfirmed write. */ }
  }
  const stale = ['sending', 'writing', 'preparing', 'observing'].includes(job.state) && Date.now() - job.updated_at > 90_000;
  return { id: job.id, state: stale ? 'uncertain' : job.state, accepted: job.count, total: job.total, tracks, requested: details.requested ?? job.total, deviceName: details.deviceName, mode: details.mode ?? 'append',
    playbackConfirmed: details.playbackConfirmed, sequenceConfirmed: details.sequenceConfirmed,
    recoveryAttempt: !!selection?.recoveryOf,
    message: job.state === 'unconfirmed' ? details.message : stale || job.state === 'uncertain' ? 'A previous queue change could not be confirmed. Check Spotify’s Queue before adding more songs.' : undefined };
}

// An explicit recovery is separate from delivery replay. Reuse a deterministic
// child selection so double taps, reloads and lost responses cannot start twice.
export async function restartSelection(userId: string, selectionId: string, keepUris?: string[], requestedDevice?: string) {
  const original = await receipt(userId, selectionId);
  if (!original || original.mode !== 'replace' || original.recoveryAttempt) throw new AppError('This selection cannot be restarted. Refresh its playback status first.', 409);
  const row = await db().prepare('SELECT sealed, expires_at FROM selections WHERE id = ? AND user_id = ? AND expires_at > ?').bind(selectionId, userId, Date.now()).first<{ sealed: string; expires_at: number }>();
  if (!row) throw new AppError('This selection expired. Make a new request.', 410);
  const selection = await open<any>(row.sealed, userId), reviewed = reviewedSelection(selection, keepUris);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId + ':' + selectionId + ':restart')))).map(x => x.toString(16).padStart(2, '0')).join('');
  const childId = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
  const previous = await receipt(userId, childId);
  if (previous) return { ...previous, selectionId: childId };
  if (original.state !== 'unconfirmed') throw new AppError('This selection no longer needs recovery. Refresh its playback status.', 409);
  const credentials = await spotifyAccess(userId);
  if (credentials.subject !== selection.subject) throw new AppError('Spotify account changed. Make a new request.', 409);
  const device = await resolveDevice(userId, credentials.access, requestedDevice ?? '', selection.deviceId ?? '');
  const state = await spotify(credentials.access, '/me/player');
  if (state?.device?.id !== device.id || state?.is_playing !== true || song(state.item)?.uri !== reviewed.tracks[0].uri) throw new AppError('Open the first saved song below and tap Play in Spotify, then return and continue. No songs were regenerated or resent.', 409, 'spotify_device');
  await db().prepare('INSERT OR IGNORE INTO selections(id, user_id, sealed, expires_at) VALUES (?, ?, ?, ?)').bind(childId, userId, await seal({ ...selection, recoveryOf: selectionId }, userId), row.expires_at).run();
  return { ...await addSelection(userId, childId, keepUris, 'replace', device.id), selectionId: childId };
}
export async function addSelection(userId: string, selectionId: string, keepUris?: string[], requestedMode?: 'append' | 'replace', requestedDevice?: string) {
  if (!/^[a-f0-9-]{36}$/i.test(selectionId)) throw new AppError('That selection is no longer available.');
  const existing = await receipt(userId, selectionId); if (existing) return existing;
  const row = await db().prepare('SELECT sealed FROM selections WHERE id = ? AND user_id = ? AND expires_at > ?').bind(selectionId, userId, Date.now()).first<{ sealed: string }>();
  if (!row) throw new AppError('This selection expired. Make a new request.', 410);
  const selection = await open<any>(row.sealed, userId);
  const reviewed = reviewedSelection(selection, keepUris), tracks = reviewed.tracks as Song[];
  if (!Array.isArray(tracks) || tracks.length < 1 || tracks.length > 50 || tracks.some(t => !/^spotify:track:[a-zA-Z0-9]{22}$/.test(t.uri))) throw new AppError('The selection is invalid. Nothing was queued.');
  const mode = requestedMode ?? selection.mode ?? 'replace';
  if (mode === 'replace') await reviewQueue(userId);
  const id = crypto.randomUUID();
  // A lock never expires by itself: a disconnected request may have reached Spotify.
  // Only a completed/known-failed run or an explicit queue review can release it.
  const locked = await db().prepare('INSERT OR IGNORE INTO queue_locks(user_id, job_id, expires_at) VALUES (?, ?, ?)').bind(userId, id, Date.now() + 90_000).run();
  if (!locked.meta.changes) throw new AppError('Review the previous queue change in Spotify before adding more songs.', 409, 'queue_review');
  let created = false, writing = false, accepted = 0;
  try {
    const duplicate = await receipt(userId, selectionId); if (duplicate) return duplicate;
    const credentials = await spotifyAccess(userId);
    if (credentials.subject !== selection.subject) throw new AppError('Spotify account changed. Make a new request.', 409);
    const device = await resolveDevice(userId, credentials.access, requestedDevice ?? '', selection.deviceId ?? '');
    selection.deviceId = device.id; selection.deviceName = device.name;
    if (mode === 'append') {
      const queue = await spotify(credentials.access, '/me/player/queue');
      const alreadyQueued = [queue?.currently_playing, ...(queue?.queue ?? [])].map(item => song(item)).filter(Boolean) as Song[];
      if (!selection.repeat && uniqueTracks(tracks, alreadyQueued).length !== tracks.length) throw new AppError('Some reviewed songs are now in Spotify’s queue. Remove those songs from your selection or find a fresh set. Nothing was sent.', 409, 'queue_changed');
    }
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
      if (reviewed.familiar) {
        const included = new Set<string>();
        for (const uri of selection.includedUris ?? []) for (const item of await members('/playlists/' + uri.split(':')[2] + '/items')) included.add(item);
        if (tracks.slice(0, reviewed.familiar).some(track => !included.has(track.uri))) throw new AppError('An included original left its playlist. Nothing was queued.', 409);
      }
    }
    if ((await account(userId)).value.spotify?.subject !== credentials.subject) throw new AppError('Spotify disconnected. Nothing was queued.', 409);
    if (mode === 'replace') await preparePlaybackOrder(device.id,
      () => spotify(credentials.access, '/me/player'),
      async (setting: string, value: any) => {
        await renewQueueLease(db(), userId, id);
        if (setting === 'transfer') await spotify(credentials.access, '/me/player', 'PUT', value);
        else await spotify(credentials.access, '/me/player/' + setting + '?' + new URLSearchParams({ device_id: device.id, state: String(value.state) }), 'PUT');
      });
    await db().prepare('INSERT INTO queue_jobs(id, user_id, selection_id, state, count, total, updated_at, sealed) VALUES (?, ?, ?, ?, 0, ?, ?, ?)')
      .bind(id, userId, selectionId, 'preparing', tracks.length, Date.now(), await seal({ prompt: selection.prompt, requested: selection.count, deviceName: selection.deviceName, deviceId: device.id, mode, selectedIndexes: reviewed.indexes }, userId)).run();
    created = true;
    const checkpoint = async (point: { state: string; accepted: number }) => {
      await renewQueueLease(db(), userId, id);
      await db().prepare('UPDATE queue_jobs SET state = ?, count = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(mode === 'replace' && point.state === 'complete' ? 'observing' : point.state, point.accepted, Date.now(), id, userId).run();
    };
    const beforeWrite = async () => {
      const current = (await account(userId)).value.spotify;
      if (!current || current.access !== credentials.access || current.subject !== credentials.subject) throw new AppError('Spotify connection changed. Playback stopped.', 409);
      await renewQueueLease(db(), userId, id); writing = true;
    };
    const result = mode === 'replace'
      ? await startSelection(tracks, async (value: object) => {
        await beforeWrite();
        await spotify(credentials.access, '/me/player/play?' + new URLSearchParams({ device_id: device.id }), 'PUT', value);
        accepted = tracks.length;
      }, checkpoint)
      : await enqueueSequential(tracks, async (track: Song) => {
        await beforeWrite();
        await spotify(credentials.access, '/me/player/queue?' + new URLSearchParams({ uri: track.uri, device_id: device.id }), 'POST');
        accepted++;
      }, checkpoint);
    let observed: { playbackConfirmed?: boolean; sequenceConfirmed?: boolean } = {};
    if (mode === 'replace' && result.state === 'complete') {
      await rememberDevice(userId, device).catch(() => {});
      // Playback reads may lag an accepted command. Never resend to fix a lagging read.
      try {
        for (let attempt = 0; attempt < 6; attempt++) {
          const [state, queue] = await Promise.all([spotify(credentials.access, '/me/player'), spotify(credentials.access, '/me/player/queue')]);
          observed = observeSelection(tracks, song(state?.item ?? queue?.currently_playing), (queue?.queue ?? []).map((t: any) => song(t)).filter(Boolean), state?.is_playing, state?.device?.id, device.id);
          if (observed.sequenceConfirmed) break;
          if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 700));
        }
      } catch { /* Acknowledgement alone cannot prove playback. Never replay here. */ }
      if (!observed.sequenceConfirmed) {
        result.state = 'unconfirmed';
        (result as any).message = observed.playbackConfirmed ? 'The first song is playing, but Spotify has not confirmed the rest of this selection. Check its queue before continuing.' : 'Spotify accepted the command but did not confirm playback. Your songs are saved. Open the first saved song in Spotify, tap Play, then return and continue.';
      }
      const job = await getJob(userId, selectionId);
      const details = await open<any>(job!.sealed, userId);
      await db().prepare('UPDATE queue_jobs SET state = ?, sealed = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(result.state, await seal({ ...details, ...observed, message: (result as any).message }, userId), Date.now(), id, userId).run();
      console.info(JSON.stringify({ event: 'spotify_start_observed', state: result.state, count: tracks.length, playing: observed.playbackConfirmed === true, ordered: observed.sequenceConfirmed === true, recovery: !!selection.recoveryOf }));
    }
    if (result.state === 'unconfirmed') await db().prepare('UPDATE queue_locks SET expires_at = ? WHERE user_id = ? AND job_id = ?').bind(Date.now(), userId, id).run();
    else if (result.state !== 'uncertain') await db().prepare('DELETE FROM queue_locks WHERE user_id = ? AND job_id = ?').bind(userId, id).run();
    return { id, ...result, ...observed, tracks, requested: selection.count, mode, deviceName: selection.deviceName, recoveryAttempt: !!selection.recoveryOf };
  } catch (error) {
    if (created && writing) {
      await db().prepare('UPDATE queue_jobs SET state = ?, count = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind('uncertain', accepted, Date.now(), id, userId).run();
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
