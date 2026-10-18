import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { bindComputer, claimMusicJob, finishMusicJob, musicProposals } from '../lib/queue/pc-jobs.mjs';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE accounts(user_id TEXT PRIMARY KEY)');
  sql.exec(readFileSync(new URL('../drizzle/0001_optimal_drax.sql', import.meta.url), 'utf8'));
  const database = { prepare(query) { const statement = sql.prepare(query); return {
    bind(...args) { return {
      async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
      async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args) }; },
    }; }, async first() { return statement.get() ?? null; }, async all() { return { results: statement.all() }; },
  }; } };
  const job = (id, owner, expires = 1000) => sql.prepare("INSERT INTO pc_requests(id, user_id, state, sealed, expires_at) VALUES (?, ?, 'pending', 'encrypted-prompt', ?)").run(id, owner, expires);
  return { sql, database, job };
}

test('computer pairing requires a single existing owner and never rebinds after erasure or sharing', async () => {
  const { sql, database } = fixture();
  try {
    await assert.rejects(bindComputer(database), /single existing/);
    sql.exec("INSERT INTO accounts VALUES ('owner'), ('other')");
    await assert.rejects(bindComputer(database), /single existing/);
    sql.exec("DELETE FROM accounts WHERE user_id = 'other'");
    assert.equal(await bindComputer(database), 'owner');
    sql.exec("DELETE FROM accounts; INSERT INTO accounts VALUES ('other')");
    assert.equal(await bindComputer(database), 'owner');
  } finally { sql.close(); }
});

test('an atomic claim is single-use, scoped to the pinned owner and never retried after a crash', async () => {
  const { sql, database, job } = fixture();
  try {
    job('one', 'owner'); job('two', 'other');
    assert.equal(await claimMusicJob(database, 'nobody', 'x', 10), null);
    const claims = await Promise.all([claimMusicJob(database, 'owner', 'a', 10), claimMusicJob(database, 'owner', 'b', 10)]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(await claimMusicJob(database, 'owner', 'restart', 20), null);
    assert.throws(() => job('three', 'owner'), /UNIQUE/);
    assert.equal((await claimMusicJob(database, 'other', 'c', 20)).id, 'two');
  } finally { sql.close(); }
});

test('only the original claim can finish; late results and replays cannot overwrite or resurrect requests', async () => {
  const { sql, database, job } = fixture();
  try {
    job('one', 'owner'); await claimMusicJob(database, 'owner', 'claim', 10);
    for (const [owner, claim, now] of [['other', 'claim', 20], ['owner', 'wrong', 20], ['owner', 'claim', 1001]]) {
      assert.equal((await finishMusicJob(database, owner, 'one', claim, 'encrypted-result', 'complete', now)).meta.changes, 0);
    }
    assert.equal((await finishMusicJob(database, 'owner', 'one', 'claim', 'encrypted-result', 'complete', 20)).meta.changes, 1);
    assert.equal(sql.prepare('SELECT sealed FROM pc_requests').get().sealed, '');
    assert.equal((await finishMusicJob(database, 'owner', 'one', 'claim', 'overwrite', 'complete', 21)).meta.changes, 0);
    sql.exec('DELETE FROM pc_requests');
    assert.equal((await finishMusicJob(database, 'owner', 'one', 'claim', 'resurrect', 'complete', 22)).meta.changes, 0);
    job('expired', 'owner', 1); assert.equal(await claimMusicJob(database, 'owner', 'c', 20), null);
  } finally { sql.close(); }
});

test('only bounded title and artist pairs leave the computer; extra properties and duplicates are removed', () => {
  assert.deepEqual(musicProposals([{ title: 'Song', artist: 'Artist', token: 'DO_NOT_FORWARD' }, { title: ' song ', artist: 'artist' }], 3), [{ title: 'Song', artist: 'Artist' }]);
  for (const invalid of [[], null, [{ title: '', artist: 'A' }], [{ title: 'X'.repeat(201), artist: 'A' }], [{ title: 'X\nY', artist: 'A' }], [null]]) assert.throws(() => musicProposals(invalid, 3));
  assert.throws(() => musicProposals([{ title: 'A', artist: 'B' }, { title: 'B', artist: 'C' }], 1));
});
