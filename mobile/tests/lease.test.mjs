import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { renewQueueLease, releaseReviewedLease } from '../lib/queue/lease.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE queue_locks (user_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  const database = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...args) { return {
    async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
    async first() { return statement.get(...args) ?? null; },
  }; } }; } };
  const insert = (user, job, expires) => sqlite.prepare('INSERT INTO queue_locks VALUES (?, ?, ?)').run(user, job, expires);
  return { sqlite, database, insert };
}
test('an active slow batch renews beyond its initial deadline and cannot be reviewed', async () => {
  const { sqlite, database, insert } = fixture();
  try {
    insert('owner', 'batch', 90_000);
    await renewQueueLease(database, 'owner', 'batch', 80_000);
    await assert.rejects(releaseReviewedLease(database, 'owner', 100_000), /still be running/);
    assert.equal(sqlite.prepare('SELECT expires_at FROM queue_locks').get().expires_at, 170_000);
  } finally { sqlite.close(); }
});
test('a reviewed old batch cannot resume or release a new batch', async () => {
  const { sqlite, database, insert } = fixture();
  try {
    insert('owner', 'old', 90_000);
    assert.equal((await releaseReviewedLease(database, 'owner', 100_000)).job_id, 'old');
    insert('owner', 'new', 190_000);
    await assert.rejects(renewQueueLease(database, 'owner', 'old', 100_001), /reviewed or cancelled/);
    await assert.rejects(releaseReviewedLease(database, 'owner', 100_001), /still be running/);
    assert.equal(sqlite.prepare('SELECT job_id FROM queue_locks').get().job_id, 'new');
  } finally { sqlite.close(); }
});
test('queue review and heartbeat are scoped to the current visitor', async () => {
  const { sqlite, database, insert } = fixture();
  try {
    insert('other', 'batch', 1);
    assert.equal(await releaseReviewedLease(database, 'owner', 100_000), null);
    await assert.rejects(renewQueueLease(database, 'owner', 'batch', 100_000));
    assert.equal(sqlite.prepare('SELECT user_id FROM queue_locks').get().user_id, 'other');
  } finally { sqlite.close(); }
});
