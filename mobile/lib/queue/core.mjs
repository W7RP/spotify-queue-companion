export class AppError extends Error {
  constructor(message, status = 400, code = 'request_failed', retryAfter = 0) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
export function normalize(value) { return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
export function songIdentity(track) {
  const title = String(track.title).replace(/\s*[-–—(\[]\s*(?:(?:19|20)\d{2}\s*)?(?:remaster(?:ed)?(?:\s*(?:19|20)\d{2})?|mono|stereo)(?:\s*version)?[)\]]?\s*$/i, '');
  return (track.artistNames?.length ? track.artistNames : [track.artist]).map(artist => normalize(title) + '|' + normalize(artist));
}
export function uniqueTracks(tracks, excluded = []) {
  const uris = new Set(excluded.map(t => t.uri)); const songs = new Set(excluded.flatMap(songIdentity));
  return tracks.filter(t => { const keys = songIdentity(t); if (uris.has(t.uri) || keys.some(k => songs.has(k))) return false; uris.add(t.uri); keys.forEach(k => songs.add(k)); return true; });
}
export function spreadArtists(tracks, count) {
  const chosen = [], remaining = [...tracks], artists = new Map();
  while (chosen.length < count && remaining.length) {
    let index = remaining.findIndex(t => (artists.get(t.artistNames?.[0] ?? t.artist) ?? 0) === 0);
    if (index < 0) index = remaining.findIndex(t => (artists.get(t.artistNames?.[0] ?? t.artist) ?? 0) < Math.max(3, Math.ceil(count / 5)));
    if (index < 0) index = 0;
    const [track] = remaining.splice(index, 1), artist = track.artistNames?.[0] ?? track.artist;
    chosen.push(track); artists.set(artist, (artists.get(artist) ?? 0) + 1);
  }
  return chosen;
}
export function parseSuggestions(text, limit) {
  if (typeof text !== 'string' || text.length > 32_000) throw new AppError('The music response was too large. Nothing was queued.');
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!Array.isArray(value.songs) || value.songs.length > 100) throw new AppError('The music response could not be read. Nothing was queued.');
  const seen = new Set();
  return value.songs.filter(song => {
    if (!song || typeof song.title !== 'string' || typeof song.artist !== 'string' || !song.title.trim() || !song.artist.trim() || song.title.length > 200 || song.artist.length > 200) return false;
    const key = normalize(song.title) + '|' + normalize(song.artist); if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, limit).map(song => ({ title: song.title.trim(), artist: song.artist.trim() }));
}
export function exactMatch(track, suggestion) {
  return normalize(track.title) === normalize(suggestion.title) && (track.artistNames ?? [track.artist]).some(a => normalize(a) === normalize(suggestion.artist));
}
export function guardOrigin(request, expected) {
  if (request.headers.get('origin') !== expected) throw new AppError('This request must come from Queue Companion.', 403, 'origin');
}
export async function enqueueSequential(tracks, send, checkpoint) {
  let accepted = 0;
  for (const track of tracks) {
    await checkpoint({ state: 'sending', accepted });
    try { await send(track); }
    catch (error) {
      const known = error instanceof AppError && error.status < 500;
      await checkpoint({ state: known ? 'failed' : 'uncertain', accepted });
      return { state: known ? 'failed' : 'uncertain', accepted, total: tracks.length, message: known ? error.message : 'A queue request could not be confirmed. Check Spotify’s Queue before adding more songs.' };
    }
    accepted++;
    await checkpoint({ state: accepted === tracks.length ? 'complete' : 'writing', accepted });
  }
  return { state: 'complete', accepted, total: tracks.length };
}
