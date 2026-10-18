// Durable single-owner mailbox. Claims are consumed once, including after a crash.
export async function bindComputer(database) {
  const existing = await database.prepare('SELECT user_id FROM pc_bridge WHERE id = 1').first();
  if (existing) return existing.user_id;
  const users = await database.prepare('SELECT user_id FROM accounts LIMIT 2').all();
  if (users.results.length !== 1) throw Error('A single existing site account is required to pair this computer.');
  await database.prepare('INSERT OR IGNORE INTO pc_bridge(id, user_id, seen_at, ready, models) VALUES (1, ?, 0, 0, ?)').bind(users.results[0].user_id, '[]').run();
  return (await database.prepare('SELECT user_id FROM pc_bridge WHERE id = 1').first()).user_id;
}
export async function claimMusicJob(database, owner, claim, now) {
  return database.prepare("UPDATE pc_requests SET state = 'running', claim = ? WHERE id = (SELECT id FROM pc_requests WHERE user_id = ? AND state = 'pending' AND expires_at > ? LIMIT 1) AND state = 'pending' RETURNING id, sealed, expires_at").bind(claim, owner, now).first();
}
export async function finishMusicJob(database, owner, id, claim, sealed, state, now) {
  return database.prepare("UPDATE pc_requests SET state = ?, result = ?, sealed = '' WHERE id = ? AND user_id = ? AND claim = ? AND state = 'running' AND expires_at > ?").bind(state, sealed, id, owner, claim, now).run();
}
export function musicProposals(value, limit) {
  if (!Array.isArray(value) || !value.length || value.length > limit || value.some(song => !song || typeof song.title !== 'string' || typeof song.artist !== 'string' || !song.title.trim() || !song.artist.trim() || song.title.length > 200 || song.artist.length > 200 || /[\u0000-\u001f]/.test(song.title + song.artist))) throw Error('The computer returned an invalid song list.');
  const seen = new Set();
  return value.map(song => ({ title: song.title.trim(), artist: song.artist.trim() })).filter(song => { const key = (song.title + '\n' + song.artist).toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}
