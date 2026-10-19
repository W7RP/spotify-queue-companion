import { AppError, uniqueTracks, spreadArtists, parseSuggestions, exactMatch, normalize } from './core.mjs';
import { mobileInstructions, selectionBrief, curateArtists, fastModel, claudeRequestOptions, mobileResponseSchema, validateMusicBrief, canRefill, type MusicBrief } from './curation';
import { parseIntent, balancedMix, playlistMatches, type Playlist } from './domain';
import { requireMusicSource } from './review.mjs';
import { proposeOnComputer } from './pc';
import { account, spotifyAccess, spotify, song, db, seal, boundedFetch, type Song } from './server';

export async function claudeModels(key: string) {
  const result = await boundedFetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
  if (result.status === 401 || result.status === 403) throw new AppError('That Claude API key could not be verified. Check the key and API access.', 400, 'claude_key');
  if (!result.ok) throw new AppError('Claude could not check the available models. Try again shortly.', 503, 'claude_unavailable');
  const value = await result.json() as any;
  return (value.data ?? []).filter((m: any) => typeof m.id === 'string' && m.id.startsWith('claude-') && m.lifecycle !== 'retired').map((m: any) => ({ id: m.id as string, name: String(m.display_name ?? m.id) }));
}
async function propose(key: string, model: string, prompt: string, count: number, refill?: {avoid:{title:string;artist:string}[];refillCount:number;brief:MusicBrief}) {
  const budget = (refill?.refillCount || count) + Math.min(25,Math.ceil((refill?.refillCount || count)/2));
  // Deliberate one-way boundary: only user-authored text reaches the model.
  // No Spotify API results, playlists, listening history, art or tokens are sent.
  const response = await boundedFetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({
    model, max_tokens: Math.min(6500, 750 + budget * 95), system: mobileInstructions,
    messages: [{ role: 'user', content: JSON.stringify({ request: prompt, count, selectionLimit: budget, ...(refill ?? {}) }) }] ,
    ...claudeRequestOptions(model,true,mobileResponseSchema),
    }), }, refill ? 20_000 : 40_000);
  if (!response.ok) throw new AppError(response.status === 429 ? 'Claude’s API limit was reached. Wait before trying again.' : 'Claude could not finish this request. Check your API key and credits.', response.status === 429 ? 429 : 503, 'claude_unavailable');
  const result = await response.json() as any;
  if (result.stop_reason !== 'end_turn' || !Array.isArray(result.content) || result.content.some((c: any) => !['text', 'thinking', 'redacted_thinking'].includes(c.type))) throw new AppError('Claude did not finish the song list. Nothing was queued.', 502);
  const text = result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  const songs = parseSuggestions(text,budget) as {title:string;artist:string}[];
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  let brief:MusicBrief;try{brief=validateMusicBrief(value.brief,prompt,count);}catch{throw new AppError('The music request could not be interpreted reliably. Try a clearer request. Nothing was queued.',502,'music_brief');}
  return {songs,brief,model};
}
async function parallel<T, R>(values: T[], concurrency: number, callback: (value: T) => Promise<R>) {
  const output: R[] = new Array(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(values.length, concurrency) }, async () => { while (next < values.length) { const i = next++; output[i] = await callback(values[i]); } })); return output;
}
async function library(token: string, path: string, source: string): Promise<Song[]> {
  const tracks: Song[] = [];
  for (let offset = 0; offset < 200; offset += 50) {
    const page = await spotify(token, path + (path.includes('?') ? '&' : '?') + 'limit=50&offset=' + offset);
    tracks.push(...(page.items ?? []).map((item: any) => song(item, source)).filter(Boolean));
    if (!page.next || !(page.items?.length)) break;
  }
  return uniqueTracks(tracks);
}
async function playlists(token: string): Promise<Playlist[]> {
  const values: Playlist[] = [];
  for (let offset = 0; offset < 200; offset += 50) {
    const page = await spotify(token, '/me/playlists?limit=50&offset=' + offset);
    values.push(...(page.items ?? []).filter((p: any) => p?.id && p?.name).map((p: any) => ({ uri: 'spotify:playlist:' + p.id, name: p.name, owner: p.owner?.display_name })));
    if (!page.next) break;
  }
  return values;
}
async function search(token: string, query: string, offset = 0) {
  const page = await spotify(token, '/search?' + new URLSearchParams({ q: query.slice(0, 200), type: 'track', limit: '10', offset: String(offset) }));
  return (page.tracks?.items ?? []).map((raw: any) => song(raw)).filter(Boolean) as Song[];
}
export async function makeSelection(userId: string, prompt: string, requestedCount: number, requestedDevice = '', choices: Record<string, string> = {}, requestedMode: 'append' | 'replace' = 'replace') {
  if (typeof prompt !== 'string' || prompt.trim().length < 2 || prompt.length > 1000 || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) throw new AppError('Describe your music and choose between 1 and 50 songs.');
  let intent: ReturnType<typeof parseIntent>;
  try { intent = parseIntent(prompt, requestedCount, 50, requestedMode); } catch (error: any) { throw new AppError(error.message); }
  if (intent.more) throw new AppError('For this mobile preview, describe the next set of songs in a new request.');
  const record = await account(userId);
  const needsModel = !intent.liked && !intent.history && !intent.inspiration && !intent.playlistNames.length && !intent.playlistUris.length && !intent.referencePlaylistNames.length && !intent.referencePlaylistUris.length && !intent.includedPlaylistNames.length && !intent.includedPlaylistUris.length;
  const provider = requireMusicSource(record.value, needsModel);
  const credentials = await spotifyAccess(userId);
  // Music discovery is independent of whether a Spotify client is playing.
  const currentQueue = intent.mode === 'append' ? await spotify(credentials.access, '/me/player/queue').catch((error: any) => { if (error.code === 'spotify_device') return null; throw error; }) : null;
  const queued = [currentQueue?.currently_playing, ...(currentQueue?.queue ?? [])].map(t => song(t)).filter(Boolean) as Song[];
  const groups = new Map<string, Song[]>(); let originals: Song[] = [], references: Song[] = [], sources: Song[][] = [];
  const sourceUris: string[] = [], referenceUris: string[] = [], includedUris: string[] = [];
  if (intent.playlistNames.length + intent.referencePlaylistNames.length + intent.includedPlaylistNames.length || intent.playlistUris.length + intent.referencePlaylistUris.length + intent.includedPlaylistUris.length) {
    const list = await playlists(credentials.access);
    const resolve = (names: string[], uris: string[]) => [...uris, ...names.map(name => {
      const options = playlistMatches(name, list), chosen = Object.hasOwn(choices, name) ? choices[name] : undefined;
      if (chosen && !options.some(p => p.uri === chosen)) throw new AppError('The selected playlist no longer matches your request.');
      if (!chosen && options.length > 1) throw Object.assign(new AppError('Choose which playlist you mean.', 409, 'playlist_choice'), { choice: { name, options } });
      if (!chosen && options.length !== 1) throw new AppError(`No playlist named “${name}” was found.`);
      return chosen ?? options[0].uri;
    })];
    sourceUris.push(...resolve(intent.playlistNames, intent.playlistUris)); referenceUris.push(...resolve(intent.referencePlaylistNames, intent.referencePlaylistUris)); includedUris.push(...resolve(intent.includedPlaylistNames, intent.includedPlaylistUris));
    const all = [...new Set([...sourceUris, ...referenceUris, ...includedUris])];
    if (all.length > 6 || all.some(uri => !/^spotify:playlist:[a-zA-Z0-9]{22}$/.test(uri))) throw new AppError('Use up to six valid playlists.');
    await parallel(all, 3, async uri => groups.set(uri, await library(credentials.access, '/playlists/' + uri.split(':')[2] + '/items', 'playlist')));
    sources = sourceUris.map(uri => groups.get(uri)!); references = uniqueTracks(referenceUris.flatMap(uri => groups.get(uri)!)); originals = uniqueTracks(includedUris.flatMap(uri => groups.get(uri)!));
  }
  if (intent.liked) {
    const liked = await library(credentials.access, '/me/tracks', 'liked');
    if (sources.length) { const allowed = new Set(liked.map(t => t.uri)); sources = sources.map(group => group.filter(t => allowed.has(t.uri))); }
    else sources = [liked];
  }
  let selected: Song[] = [], proposed = 0, unmatched = 0, familiar = 0, note = '';
  if (intent.history || intent.inspiration) {
    if (/most played|top tracks|listening history/i.test(prompt)) throw new AppError('This preview can use recently played songs. Complete past play counts are unavailable.');
    const recent = await spotify(credentials.access, '/me/player/recently-played?limit=50');
    const tracks = uniqueTracks((recent.items ?? []).map((item: any) => song(item, 'recent')).filter(Boolean)) as Song[];
    if (intent.history) selected = spreadArtists(intent.repeat ? tracks : uniqueTracks(tracks, queued), intent.count);
    else references = uniqueTracks([...references, ...tracks]);
  }
  const discovery = !!references.length;
  if ((referenceUris.length || intent.inspiration) && !references.length) throw new AppError('No reference songs were available. Choose another playlist or describe the music directly.');
  if (!selected.length && (sources.length || sourceUris.length || intent.liked) && !discovery) {
    if (intent.filtered) throw new AppError('For filtered discovery, describe the music without a library restriction. This mobile preview can mix songs directly from your playlists and liked songs.');
    selected = spreadArtists(uniqueTracks(balancedMix(sources, 200) as Song[], intent.repeat ? [] : queued), intent.count);
    note = 'Selected from the first 200 available songs in each requested source.';
  } else if (!selected.length && discovery) {
    // Infer taste locally from Spotify artist genres. Spotify results never enter Claude.
    const artistIds = [...new Set(references.flatMap(t => t.artistIds))].slice(0, 12);
    const artists = await parallel(artistIds, 4, id => spotify(credentials.access, '/artists/' + id));
    const counts = new Map<string, number>();
    artists.forEach(artist => (artist.genres ?? []).forEach((genre: string) => counts.set(genre, (counts.get(genre) ?? 0) + 1)));
    const genres = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([genre]) => genre);
    if (!genres.length) throw new AppError('Spotify did not provide enough genre references. Describe the genre or mood directly.');
    const found = await parallel(genres, 3, async genre => [...await search(credentials.access, 'genre:' + JSON.stringify(genre)), ...await search(credentials.access, 'genre:' + JSON.stringify(genre), 10)]);
    let pool: Song[] = uniqueTracks(balancedMix(found, 200) as Song[], intent.repeat ? [] : [...queued, ...references, ...originals]);
    if (sources.length) { const allowed = new Set(sources.flat().map(t => t.uri)); pool = pool.filter(t => allowed.has(t.uri)); }
    selected = spreadArtists(pool, intent.count - intent.playlistCount);
    if (intent.playlistCount) {
      if (!selected.length) throw new AppError('No different songs were found. Nothing was queued.');
      const allowed = sources.length ? new Set(sources.flat().map(t => t.uri)) : null;
      const portion = spreadArtists(uniqueTracks(originals, queued).filter((t: Song) => !allowed || allowed.has(t.uri)), intent.playlistCount); familiar = portion.length;
      selected = uniqueTracks([...portion, ...selected]).slice(0, intent.count);
    }
    note = 'Matched locally using Spotify’s available artist genres; reference songs were excluded. Spotify library data was not sent to Claude.';
  } else if (!selected.length && !intent.history) {
    note = provider === 'chatgpt' ? 'Selected using ChatGPT through your PC. Review these songs before adding to Spotify.' : 'Selected using Claude API. Review these songs before adding to Spotify.';
    const selectingAt=Date.now();
    let chosenModel=record.value.model;
    if(provider==='claude') {
      if(!record.value.claudeKey)throw new AppError('Connect your Claude API key in Settings to request music.',400,'claude_connect');
      chosenModel=fastModel(await claudeModels(record.value.claudeKey),'claude',chosenModel);
      if(!chosenModel)throw new AppError('No available Claude model was found for this key.');
    }
    const fetchProposals=(refill?:{avoid:{title:string;artist:string}[];refillCount:number;brief:MusicBrief})=>provider==='chatgpt'
      ?proposeOnComputer(userId,prompt,intent.count,chosenModel,refill)
      :propose(record.value.claudeKey!,chosenModel!,prompt,intent.count,refill);
    const proposal=await fetchProposals();chosenModel=proposal.model;
    const brief=selectionBrief(prompt,intent.count,proposal.brief);
    let resolvedPool:Song[]=[];
    const resolveProposals=async(suggestions:{title:string;artist:string}[])=>{
      proposed+=suggestions.length;
      for(let offset=0;offset<suggestions.length&&selected.length<intent.count;offset+=5) {
        const resolved=await parallel(suggestions.slice(offset,offset+5),5,async suggestion=>{
          const found=await search(credentials.access,`track:${JSON.stringify(suggestion.title)} artist:${JSON.stringify(suggestion.artist)}`);
          return found.find(track=>normalize(track.title)===normalize(suggestion.title)&&exactMatch(track,suggestion))??found.find(track=>exactMatch(track,suggestion))??null;
        });
        unmatched+=resolved.filter(track=>!track).length;
        resolvedPool=uniqueTracks([...resolvedPool,...resolved.filter(Boolean) as Song[]],intent.repeat?[]:queued);
        selected=curateArtists(resolvedPool,brief);
      }
    };
    await resolveProposals(proposal.songs);
    if(canRefill(selected.length,intent.count,selectingAt)) {
      const refill=await fetchProposals({avoid:proposal.songs.slice(0,75),refillCount:intent.count-selected.length,brief:proposal.brief});
      if(JSON.stringify(refill.brief)!==JSON.stringify(proposal.brief))throw new AppError('The refill changed the musical request. Nothing was queued.',502);
      const previous=new Set(proposal.songs.map(s=>normalize(s.title)+'|'+normalize(s.artist)));
      await resolveProposals(refill.songs.filter(s=>!previous.has(normalize(s.title)+'|'+normalize(s.artist))));
      note+=' One refill was used to replace rejected choices.';
    }
    if(brief.balance&&selected.length<intent.count)note+=' The selection was kept varied rather than filled with repeated artists.';
  }
  if (!selected.length) throw new AppError('No matching, playable songs were found. Try a broader request.');
  const after = await account(userId);
  if (after.value.spotify?.subject !== credentials.subject || after.value.claudeKey !== record.value.claudeKey || after.value.provider !== record.value.provider) throw new AppError('Your connection changed while selecting songs. Nothing was queued.', 409);
  const id = crypto.randomUUID(), expires = Date.now() + 600_000;
  await db().prepare('DELETE FROM selections WHERE expires_at < ?').bind(Date.now()).run();
  const value = { tracks: selected, prompt, count: intent.count, subject: credentials.subject, deviceId: requestedDevice, mode: intent.mode, note, familiar, proposed, unmatched, sourceUris, includedUris, liked: intent.liked, repeat: intent.repeat };
  await db().prepare('INSERT INTO selections(id, user_id, sealed, expires_at) VALUES (?, ?, ?, ?)').bind(id, userId, await seal(value, userId), expires).run();
  return { id, tracks: selected, requested: intent.count, note, familiar, unmatched, mode: intent.mode, expires };
}
