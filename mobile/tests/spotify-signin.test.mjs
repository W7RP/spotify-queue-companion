import test from 'node:test';
import assert from 'node:assert/strict';
import { finishSpotifySignIn, SpotifySignInError } from '../lib/queue/spotify-signin.mjs';

function fixture({ cookie = true, expired = false, tokenStatus = 200, profileStatus = 200, product = 'premium', deny = false } = {}) {
  const saved = [], calls = [];
  let available = !expired;
  const request = new Request('https://queue.example/api/spotify/callback?state=FAKE_STATE&' + (deny ? 'error=access_denied' : 'code=FAKE_CODE'), { headers: cookie ? { cookie: 'unrelated=ok; qc_spotify_oauth=FAKE_BROWSER' } : {} });
  const deps = {
    clientId: 'FAKE_CLIENT', hash: async value => 'hash:' + value,
    consumeAttempt: async state => { assert.equal(state, 'FAKE_STATE'); const prior = available; available = false; return prior ? { sealed: 'FAKE_SEALED' } : null; },
    openAttempt: async () => ({ verifier: 'FAKE_VERIFIER', browser: 'hash:FAKE_BROWSER', redirect: 'https://queue.example/api/spotify/callback' }),
    readAccount: async () => ({ value: { claudeKey: 'FAKE_KEY' }, revision: 7 }),
    saveAccount: async (value, revision) => { saved.push({ value, revision }); },
    fetch: async (url, init) => {
      calls.push(url);
      if (url === 'https://accounts.spotify.com/api/token') {
        assert.equal(init.body.get('client_id'), 'FAKE_CLIENT'); assert.equal(init.body.get('code_verifier'), 'FAKE_VERIFIER');
        assert.equal(init.body.get('redirect_uri'), 'https://queue.example/api/spotify/callback');
        return Response.json(tokenStatus === 200 ? { access_token: 'FAKE_ACCESS', refresh_token: 'FAKE_REFRESH', expires_in: 3600 } : { error: 'invalid_grant', error_description: 'RAW_PROVIDER_DETAIL_FAKE_CODE' }, { status: tokenStatus });
      }
      assert.equal(url, 'https://api.spotify.com/v1/me'); assert.equal(init.headers.Authorization, 'Bearer FAKE_ACCESS');
      return Response.json({ id: 'FAKE_SUBJECT', product, error: 'RAW_PROFILE_DETAIL' }, { status: profileStatus });
    },
  };
  return { request, deps, saved, calls };
}
test('callback preserves existing settings and exchanges PKCE once before saving', async () => {
  const f = fixture(); await finishSpotifySignIn(f.request, f.deps);
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].revision, 7); assert.equal(f.saved[0].value.claudeKey, 'FAKE_KEY');
  assert.equal(f.saved[0].value.spotify.subject, 'FAKE_SUBJECT');
  await assert.rejects(finishSpotifySignIn(f.request, f.deps), e => e.reason === 'state_expired');
  assert.equal(f.calls.length, 2); assert.equal(f.saved.length, 1);
});
for (const [name, options, reason, calls] of [
  ['lost browser session', { cookie: false }, 'browser_session', 0],
  ['expired state', { expired: true }, 'state_expired', 0],
  ['declined consent', { deny: true }, 'consent_denied', 0],
  ['rejected code', { tokenStatus: 400 }, 'token_rejected', 1],
  ['Spotify profile access denied', { profileStatus: 403 }, 'profile_forbidden', 2],
  ['non-Premium account', { product: 'free' }, 'premium_required', 2],
]) test(name + ' is specific, sanitized and never saves credentials', async () => {
  const f = fixture(options);
  await assert.rejects(finishSpotifySignIn(f.request, f.deps), e => {
    assert.ok(e instanceof SpotifySignInError); assert.equal(e.reason, reason);
    assert.doesNotMatch(JSON.stringify(e) + e.message, /FAKE_CODE|FAKE_ACCESS|FAKE_STATE|RAW_/); return true;
  });
  assert.equal(f.calls.length, calls); assert.equal(f.saved.length, 0);
});
test('network exceptions cannot expose provider URLs or credentials through the error', async () => {
  const f = fixture(); f.deps.fetch = async () => { throw Error('https://provider.example?code=FAKE_SECRET'); };
  await assert.rejects(finishSpotifySignIn(f.request, f.deps), e => e.reason === 'token_failed' && !e.message.includes('FAKE_SECRET'));
  assert.equal(f.saved.length, 0);
});
