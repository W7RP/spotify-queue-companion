import { AppError } from './core.mjs';
import { account, saveAccount, spotify, type Song } from './server';

export function requirePlaylistPermission(credentials: { scopes?: string }) {
  if (!credentials.scopes?.split(' ').includes('playlist-modify-private')) throw new AppError('Reconnect Spotify to allow Queue Companion to maintain one private playback playlist. Your saved selection is kept; return after connecting to play it.', 409, 'spotify_playlist_permission');
}

// Only reuse the ID we created for this Spotify account. Never find a playlist
// by its display name: an unrelated user playlist may have the same name.
export async function prepareSelectionPlaylist(userId: string, credentials: { access: string; subject: string; scopes?: string }, tracks: Song[], checkpoint: () => Promise<void>) {
  requirePlaylistPermission(credentials);
  let record = await account(userId);
  const saved = record.value.playbackPlaylist;
  let id = saved?.subject === credentials.subject && /^[a-zA-Z0-9]{22}$/.test(saved.id) ? saved.id : '';
  if (id) {
    const playlist = await spotify(credentials.access, '/playlists/' + id + '?fields=id,owner(id),public,collaborative');
    if (playlist?.owner?.id !== credentials.subject || playlist.public !== false || playlist.collaborative !== false) throw new AppError('The Queue Companion playback playlist changed ownership or privacy. Restore it to a private, non-collaborative playlist before trying again.', 409, 'spotify_playlist');
  } else {
    await checkpoint();
    const playlist = await spotify(credentials.access, '/me/playlists', 'POST', { name: 'Queue Companion', public: false, collaborative: false, description: 'Your current Queue Companion selection. Play now replaces the songs in this private playlist.' }, true);
    if (!/^[a-zA-Z0-9]{22}$/.test(playlist?.id ?? '')) throw new AppError('Spotify did not return the playback playlist. No playback command was sent.', 502, 'spotify_playlist');
    id = playlist.id;
    record = await account(userId);
    if (record.value.spotify?.subject !== credentials.subject || record.value.spotify.access !== credentials.access) throw new AppError('Spotify connection changed. No playback command was sent.', 409);
    await saveAccount(userId, { ...record.value, playbackPlaylist: { id, subject: credentials.subject } }, record.revision);
  }
  await checkpoint();
  await spotify(credentials.access, '/playlists/' + id + '/items', 'PUT', { uris: tracks.map(t => t.uri) });
  // Do not start a cached/partial playlist while Spotify propagates the update.
  for (let attempt = 0; attempt < 5; attempt++) {
    const page = await spotify(credentials.access, '/playlists/' + id + '/items?limit=50');
    const uris = (page?.items ?? []).map((item: any) => (item.item ?? item.track)?.uri);
    if (!page.next && uris.length === tracks.length && tracks.every((t, i) => t.uri === uris[i])) return id;
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new AppError('Spotify has not confirmed the saved playlist yet. Your selection is kept. Try again in a moment; no playback command was sent.', 409, 'spotify_playlist');
}
