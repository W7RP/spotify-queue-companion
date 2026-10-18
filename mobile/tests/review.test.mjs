import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedSelection, deliveryVisibility, requireMusicSource } from '../lib/queue/review.mjs';
const tracks = [1, 2, 3, 4].map(n => ({ uri: 'spotify:track:' + String(n).padStart(22, '0'), title: 'Song ' + n }));
test('reviewed subsets preserve server order and recalculate familiar originals after removals', () => {
  const result = reviewedSelection({ tracks, familiar: 2 }, [tracks[3].uri, tracks[1].uri]);
  assert.deepEqual(result.tracks, [tracks[1], tracks[3]]); assert.deepEqual(result.indexes, [1, 3]); assert.equal(result.familiar, 1);
});
test('review rejects injected, duplicate and empty choices before any queue write', () => {
  for (const value of [[], [tracks[0].uri, tracks[0].uri], ['spotify:track:UNKNOWN'], [null], 'all']) assert.throws(() => reviewedSelection({ tracks }, value));
  assert.deepEqual(reviewedSelection({ tracks }).tracks, tracks);
});
test('delivery distinguishes accepted commands, actual visibility, current playback and unsent songs', () => {
  const result = deliveryVisibility(tracks, 3, { playing: tracks[0], queue: [tracks[1]] });
  assert.deepEqual(result.map(r => r.state), ['playing', 'visible', 'accepted', 'not_sent']);
});
test('an ambiguous write is unconfirmed rather than incorrectly called not sent', () => {
  assert.deepEqual(deliveryVisibility(tracks, 1, null, 'uncertain').map(r => r.state), ['accepted', 'unconfirmed', 'not_sent', 'not_sent']);
});
test('ChatGPT selection never silently uses an existing Claude key', () => {
  assert.throws(() => requireMusicSource({ provider: 'chatgpt', claudeKey: 'FAKE_KEY' }), e => e.code === 'chatgpt_connect');
  assert.throws(() => requireMusicSource({ provider: 'claude' }), e => e.code === 'claude_connect');
  assert.equal(requireMusicSource({ provider: 'claude', claudeKey: 'FAKE_KEY' }), 'claude');
});
test('library mixes need no paid provider, while unsupported free-text library requests fail clearly', () => {
  assert.equal(requireMusicSource({ provider: 'spotify' }, false), 'spotify');
  assert.throws(() => requireMusicSource({ provider: 'spotify' }), e => e.code === 'library_request');
});
