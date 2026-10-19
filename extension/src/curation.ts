// Kept byte-identical to extension/src/curation.ts in the desktop repository.
type ArtistTrack = { artist: string; artistNames?: string[] };
const words = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const artistKey = (track: ArtistTrack) => words(track.artistNames?.[0] ?? track.artist);

export function selectionBrief(prompt: string, count: number) {
  const text = words(prompt);
  const similarity = /\b(?:like|similar to|similar music to|inspired by|in the style of|sounds like)\b/.test(text);
  const referenceText = text.split(/\b(?:similar to|similar music to|inspired by|in the style of|sounds like|like)\b/).slice(1).map(part => part.split(/\b(?:but|without|except|excluding|only|include|including)\b/)[0].trim()).filter(Boolean);
  // Explicit artist allocations belong to the user's request, not our default.
  const narrow = text.match(/\b(?:only|exclusively|nothing but|all by)\s+(?:(?:songs?|tracks?|music)\s+)?(?:(?:by|from)\s+)?(.+)/)?.[1];
  const artistOnly = !!narrow && (/^(?:them|that band|that artist)\b/.test(narrow) || referenceText.some(part => (' ' + narrow + ' ').includes(' ' + part + ' ')));
  const allocation = artistOnly || /\b(?:mostly|mainly|more (?:of|from)|half|percent|equal|evenly|\d+\s+(?:songs?|tracks?)\s+(?:by|from)|include|including|mix in)\b/.test(text) || /\d\s*%/.test(prompt);
  return { similarity, balance: similarity && !allocation, referenceText, count,
    referenceLimit: Math.min(count - 1, Math.max(1, Math.floor(count / 5))), artistLimit: Math.max(2, Math.ceil(count / 5)) };
}

export function isReferenceArtist(track: ArtistTrack, brief: ReturnType<typeof selectionBrief>) {
  return (track.artistNames?.length ? track.artistNames : [track.artist]).some(name => {
    const key = words(name);
    return !!key && brief.referenceText.some(part => (' ' + part + ' ').includes(' ' + key + ' '));
  });
}

export function curateArtists<T extends ArtistTrack>(tracks: T[], brief: ReturnType<typeof selectionBrief>, restricted = false): T[] {
  if (restricted) return tracks.slice(0, brief.count);
  const references: T[] = [], others: T[] = [], totals = new Map<string, number>();
  for (const track of tracks) {
    const reference = isReferenceArtist(track, brief), key = artistKey(track);
    if (brief.balance && (reference ? references.length >= brief.referenceLimit : (totals.get(key) ?? 0) >= brief.artistLimit)) continue;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    (reference ? references : others).push(track);
  }
  // Do not claim discovery if the provider returned only the named artist.
  if (brief.balance && !others.length) return [];
  // Interleave the familiar portion across the entire selection, starting outside it.
  const referenceCount = brief.balance ? Math.min(references.length, brief.count - 1) : Math.min(references.length, brief.count);
  const familiar = references.slice(0, referenceCount);
  const remaining = others.slice();
  const ordered: T[] = []; let previous = '';
  while (ordered.length < brief.count - familiar.length && remaining.length) {
    let index = remaining.findIndex(track => artistKey(track) !== previous);
    if (index < 0) index = 0;
    const [track] = remaining.splice(index, 1); ordered.push(track); previous = artistKey(track);
  }
  // If explicit allocation leaves only the reference artist, retain those choices.
  if (!ordered.length) return familiar.slice(0, brief.count);
  const result: T[] = []; let at = 0;
  for (let i = 0; i < ordered.length; i++) {
    result.push(ordered[i]);
    while (at < familiar.length && Math.floor((i + 1) * familiar.length / ordered.length) > at) result.push(familiar[at++]);
  }
  return result.slice(0, brief.count);
}

export const curationInstructions = 'Understand the musical brief before selecting: genre, era, mood, language, familiarity, exclusions, and whether an artist is a reference or the requested source. "Songs like X" and "similar to X" mean discover compatible music by other artists, with a small familiar portion allowed. Unless the user specifies another mix, use at most one fifth of the final target from the named reference artists COMBINED and at most one fifth from any other artist (minimum two). Start with a different artist, distribute reference-artist songs throughout, and avoid consecutive songs by the same artist when alternatives exist. Include one or two suitable reference-artist songs when space and the request allow; do not exclude the artist entirely by default. "Only X", "songs by X", explicit allocations and explicit exclusions override that default. Never let candidate availability turn a similarity request into the named artist catalogue. Apply these rules to primary picks and reserves. Hidden gems means less obvious but musically suitable songs, not obscurity for its own sake. For hidden gems or not the most listened to, avoid signature hits and ubiquitous radio staples; favor strong album cuts and less exposed singles, including from established artists. Respect hard constraints over filling the count; never claim measured popularity or audio features. Return only the requested JSON, without explanations or a separate reasoning response.';

export function fastModel<T extends { id: string }>(models: T[], provider: 'chatgpt' | 'claude', selected?: string): string | undefined {
  const explicit = models.find(model => model.id === selected);
  if (explicit) return explicit.id;
  const family = provider === 'chatgpt' ? 'luna' : 'haiku';
  const offered = models.filter(model => model.id.toLowerCase().includes(family));
  // Numeric comparison avoids depending on API catalogue ordering (5-5 > 4-5).
  offered.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  return offered[0]?.id ?? (provider === 'claude' ? models.find(model => model.id.includes('sonnet'))?.id : undefined) ?? models[0]?.id;
}
