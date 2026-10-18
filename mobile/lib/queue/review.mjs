import { AppError } from './core.mjs';

export function reviewedSelection(selection, keepUris) {
  const original = selection.tracks;
  if (!Array.isArray(original) || original.length < 1 || original.length > 50) throw new AppError('The selection is invalid. Nothing was queued.');
  const keep = keepUris === undefined ? original.map(track => track.uri) : keepUris;
  if (!Array.isArray(keep) || !keep.length || keep.length > original.length || keep.some(uri => typeof uri !== 'string')) throw new AppError('Keep at least one song before adding to Spotify.');
  const allowed = new Set(original.map(track => track.uri)), chosen = new Set(keep);
  if (chosen.size !== keep.length || keep.some(uri => !allowed.has(uri))) throw new AppError('The reviewed songs must come from this selection. Nothing was queued.');
  const indexes = original.flatMap((track, index) => chosen.has(track.uri) ? [index] : []);
  return { tracks: indexes.map(index => original[index]), indexes, familiar: indexes.filter(index => index < (selection.familiar ?? 0)).length };
}

export function requireMusicSource(account, needsModel = true) {
  const provider = account.provider ?? (account.claudeKey ? 'claude' : 'chatgpt');
  if (!needsModel) return provider;
  if (provider === 'chatgpt') throw new AppError('ChatGPT is not connected for music selection. Site sign-in does not grant ChatGPT plan usage. Choose another music source in Settings. Nothing was sent to Spotify.', 400, 'chatgpt_connect');
  if (provider === 'spotify') throw new AppError('Spotify library mode supports playlists, liked songs and recent plays. Quote a playlist name or request a recent-play mix. Nothing was sent to Spotify.', 400, 'library_request');
  if (provider !== 'claude' || !account.claudeKey) throw new AppError('Connect the selected Claude API source in Settings. Nothing was sent to Spotify.', 400, 'claude_connect');
  return provider;
}

export function deliveryVisibility(tracks, accepted, playback, state = 'complete') {
  const queue = new Set((playback?.queue ?? []).map(track => track.uri));
  const uncertain = !['complete', 'failed'].includes(state);
  return tracks.map((track, index) => ({ uri: track.uri, state: playback?.playing?.uri === track.uri ? 'playing' : queue.has(track.uri) ? 'visible' : index < accepted ? 'accepted' : uncertain && index === accepted ? 'unconfirmed' : 'not_sent' }));
}
