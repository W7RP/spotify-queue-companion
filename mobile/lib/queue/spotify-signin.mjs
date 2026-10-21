export const spotifySignInMessages = {
  sign_in: 'Sign in to Queue Companion again, then reconnect Spotify.',
  state_expired: 'Spotify sign-in expired or was already used. Start a fresh connection from Settings.',
  browser_session: 'Spotify sign-in lost its browser session. Open Queue Companion directly in Safari, then connect Spotify there.',
  consent_denied: 'Spotify permission was declined. Choose Connect again if you want to grant access.',
  code_missing: 'Spotify did not return a sign-in code. Start a fresh connection.',
  token_client: 'Spotify did not recognize this app’s Client ID. Check the Spotify developer app configuration.',
  token_rejected: 'Spotify rejected the sign-in code or PKCE check. Start a fresh connection directly in Safari.',
  token_failed: 'Spotify’s token exchange failed. Wait a moment and start a fresh connection.',
  profile_forbidden: 'Spotify authorized sign-in but denied profile access (403). Add the exact Spotify account under your developer app’s Users and Access, then reconnect.',
  profile_failed: 'Spotify could not return your account profile. Start a fresh connection.',
  premium_required: 'The connected Spotify account does not report Premium. Connect the Premium account you use for playback.',
  storage_failed: 'Connection storage was unavailable or changed during sign-in. Refresh and reconnect.',
  unavailable: 'Spotify sign-in could not finish. Open Queue Companion directly in Safari and reconnect.',
};
export class SpotifySignInError extends Error {
  constructor(reason, stage, status) {
    super(spotifySignInMessages[reason] ?? spotifySignInMessages.unavailable);
    this.reason = Object.hasOwn(spotifySignInMessages, reason) ? reason : 'unavailable';
    this.stage = stage;
    this.status = status;
  }
}
export function spotifySignInFailure(error) {
  return error instanceof SpotifySignInError ? error : new SpotifySignInError(error?.code === 'sign_in' ? 'sign_in' : 'unavailable', 'identity');
}

// Dependencies keep the real callback flow testable without provider credentials.
// Never include codes, state, cookies, tokens, profile data or raw provider errors
// in failure objects: only fixed reason/stage enums and numeric HTTP status.
export async function finishSpotifySignIn(request, deps) {
  let stage = 'state';
  const reject = (reason, status) => { throw new SpotifySignInError(reason, stage, status); };
  try {
    const params = new URL(request.url).searchParams;
    const state = params.get('state');
    if (!state || state.length > 150) reject('state_expired');
    const row = await deps.consumeAttempt(state);
    if (!row) reject('state_expired');
    const attempt = await deps.openAttempt(row.sealed);
    stage = 'browser';
    const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('qc_spotify_oauth='))?.slice('qc_spotify_oauth='.length);
    if (!cookie || await deps.hash(cookie) !== attempt.browser) reject('browser_session');
    if (params.has('error')) reject('consent_denied');
    const code = params.get('code'); if (!code || code.length > 3000) reject('code_missing');
    stage = 'storage'; const before = await deps.readAccount();
    stage = 'token';
    const result = await deps.fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: deps.clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect }) });
    if (!result.ok) {
      const detail = await result.json().catch(() => ({}));
      reject(detail.error === 'invalid_client' ? 'token_client' : detail.error === 'invalid_grant' ? 'token_rejected' : 'token_failed', result.status);
    }
    const token = await result.json();
    if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) reject('token_failed');
    stage = 'profile';
    const profile = await deps.fetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + token.access_token } });
    if (!profile.ok) reject(profile.status === 403 ? 'profile_forbidden' : 'profile_failed', profile.status);
    const identity = await profile.json();
    if (typeof identity.id !== 'string' || !identity.id) reject('profile_failed');
    if (identity.product && identity.product !== 'premium') reject('premium_required');
    stage = 'storage';
    await deps.saveAccount({ ...before.value, spotify: { access: token.access_token, refresh: token.refresh_token, subject: identity.id, expires: Date.now() + token.expires_in * 1000 } }, before.revision);
  } catch (error) {
    if (error instanceof SpotifySignInError) throw error;
    throw new SpotifySignInError(stage === 'storage' || stage === 'state' ? 'storage_failed' : stage === 'token' ? 'token_failed' : stage === 'profile' ? 'profile_failed' : 'unavailable', stage);
  }
}
