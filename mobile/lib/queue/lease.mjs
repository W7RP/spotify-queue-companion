import { AppError } from './core.mjs';

export async function renewQueueLease(database, userId, jobId, now = Date.now()) {
  const result = await database.prepare('UPDATE queue_locks SET expires_at = ? WHERE user_id = ? AND job_id = ?')
    .bind(now + 90_000, userId, jobId).run();
  if (!result.meta.changes) throw new AppError('This queue request was reviewed or cancelled. Queueing stopped.', 409, 'queue_review');
}

export async function releaseReviewedLease(database, userId, now = Date.now()) {
  // The expiry condition is checked atomically with deletion. A renewal that
  // won the race must prevent review from releasing a currently active batch.
  const released = await database.prepare('DELETE FROM queue_locks WHERE user_id = ? AND expires_at <= ? RETURNING job_id')
    .bind(userId, now).first();
  if (released) return released;
  const current = await database.prepare('SELECT job_id FROM queue_locks WHERE user_id = ?').bind(userId).first();
  if (current) throw new AppError('The current queue change may still be running. Wait before reviewing it.', 409);
  return null;
}
