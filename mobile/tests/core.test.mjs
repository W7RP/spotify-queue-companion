import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, uniqueTracks, spreadArtists, parseSuggestions, exactMatch, guardOrigin, enqueueSequential } from '../lib/queue/core.mjs';
const song = (n, title = 'Song ' + n, artist = 'Artist ' + n) => ({ uri: 'spotify:track:' + String(n).padStart(22, '0'), title, artist, artistNames: [artist] });
test('recording deduplication covers remasters and reordered artist credits, preserving distinct live versions', () => {
 const first = { ...song(1, 'A Song', 'First, Second'), artistNames: ['First', 'Second'] };
 const duplicate = { ...song(2, 'A Song - 2024 Remaster', 'Second, First'), artistNames: ['Second', 'First'] };
 assert.deepEqual(uniqueTracks([first, duplicate, song(3, 'A Song - Live', 'First')]), [first, song(3, 'A Song - Live', 'First')]);
});
test('excluded references cannot re-enter discovery under another recording id', () => {
 assert.deepEqual(uniqueTracks([song(2, 'Same', 'Artist'), song(3)], [song(1, 'Same', 'Artist')]), [song(3)]);
});
test('artist spreading gives different artists a slot before repeating', () => {
 const tracks = [song(1, 'One', 'A'), song(2, 'Two', 'A'), song(3, 'Three', 'B')];
 assert.deepEqual(spreadArtists(tracks, 2).map(t => t.artist), ['A', 'B']);
});
test('model parsing caps proposals, discards malformed entries and duplicate title/artist choices', () => {
 const value = JSON.stringify({ songs: [{ title: 'One', artist: 'A' }, { title: 'One', artist: 'A' }, { title: 'Two', artist: 'B' }, { title: '', artist: 'B' }] });
 assert.deepEqual(parseSuggestions('```json\n' + value + '\n```', 1), [{ title: 'One', artist: 'A' }]);
 assert.throws(() => parseSuggestions(JSON.stringify({ songs: Array.from({ length: 101 }, () => ({ title: 'X', artist: 'A' })) }), 75));
 assert.throws(() => parseSuggestions('{incomplete', 15));
});
test('Spotify resolution requires an exact normalized title and a credited artist', () => {
 assert.equal(exactMatch(song(1, 'A Song', 'José González'), { title: 'A Song', artist: 'Jose Gonzalez' }), true);
 assert.equal(exactMatch(song(1, 'A Song', 'Other'), { title: 'A Song', artist: 'Artist' }), false);
 assert.equal(exactMatch(song(1, 'A Song Live', 'Artist'), { title: 'A Song', artist: 'Artist' }), false);
 assert.equal(exactMatch(song(1, 'A Song - 2024 Remaster', 'Artist'), { title: 'A Song', artist: 'Artist' }), true);
 assert.equal(exactMatch(song(1, 'A Song - Live', 'Artist'), { title: 'A Song', artist: 'Artist' }), false);
 assert.equal(exactMatch(song(1, 'A Song - Remastered', 'Cover Artist'), { title: 'A Song', artist: 'Artist' }), false);
});
test('mutations require exact same-origin; missing Origin is denied', () => {
 const origin = 'https://queue.example';
 assert.throws(() => guardOrigin(new Request(origin), origin), /must come from/);
 assert.throws(() => guardOrigin(new Request(origin, { headers: { origin: 'https://other.example' } }), origin), /must come from/);
 assert.doesNotThrow(() => guardOrigin(new Request(origin, { headers: { origin } }), origin));
});
test('queue writes are sequential and checkpointed before and after each send', async () => {
 const events = [], tracks = [song(1), song(2)]; let running = false;
 const result = await enqueueSequential(tracks, async track => { assert.equal(running, false); running = true; events.push(track.uri); await Promise.resolve(); running = false; }, async state => events.push(state.state + ':' + state.accepted));
 assert.deepEqual(result, { state: 'complete', accepted: 2, total: 2 });
 assert.deepEqual(events, ['sending:0', tracks[0].uri, 'writing:1', 'sending:1', tracks[1].uri, 'complete:2']);
});
test('a network ambiguity stops immediately, records uncertainty and never retries', async () => {
 let calls = 0; const checkpoints = [];
 const result = await enqueueSequential([song(1), song(2), song(3)], async () => { if (++calls === 2) throw Error('connection reset'); }, async state => checkpoints.push(state));
 assert.equal(result.state, 'uncertain'); assert.equal(result.accepted, 1); assert.equal(calls, 2);
 assert.deepEqual(checkpoints.at(-1), { state: 'uncertain', accepted: 1 });
});
test('provider 5xx is ambiguous; explicit rate-limit rejection is a known stop without retry', async () => {
 const uncertain = await enqueueSequential([song(1)], async () => { throw new AppError('upstream failed', 502); }, async () => {});
 assert.equal(uncertain.state, 'uncertain');
 let calls = 0;
 const rejected = await enqueueSequential([song(1), song(2)], async () => { calls++; throw new AppError('wait', 429); }, async () => {});
 assert.equal(rejected.state, 'failed'); assert.equal(rejected.accepted, 0); assert.equal(calls, 1);
});
