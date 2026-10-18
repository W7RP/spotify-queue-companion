import { env } from 'cloudflare:workers';
import { user, db, hash, open, origin, account, saveAccount, boundedFetch } from '@/lib/queue/server';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Set-Cookie': 'qc_spotify_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/spotify/callback; Max-Age=0' };
  try {
    const person = await user(); const params = new URL(request.url).searchParams;
    const state = params.get('state'); if (!state || state.length > 150) throw Error('state');
    const row = await db().prepare('DELETE FROM oauth_attempts WHERE state = ? AND user_id = ? AND expires_at > ? RETURNING sealed').bind(await hash(state), person.userId, Date.now()).first<{ sealed: string }>();
    if (!row) throw Error('state');
    const attempt = await open<{ verifier: string; browser: string; redirect: string }>(row.sealed, person.userId);
    const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('qc_spotify_oauth='))?.slice('qc_spotify_oauth='.length);
    if (!cookie || await hash(cookie) !== attempt.browser || params.has('error')) throw Error('consent');
    const code = params.get('code'); if (!code || code.length > 3000) throw Error('code');
    const before = await account(person.userId);
    const result = await boundedFetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: env.SPOTIFY_CLIENT_ID!, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect }) });
    if (!result.ok) throw Error('token');
    const token = await result.json() as any;
    if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string' || !Number.isFinite(token.expires_in)) throw Error('token');
    const profile = await boundedFetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + token.access_token } });
    if (!profile.ok) throw Error('profile');
    const identity = await profile.json() as any;
    if (typeof identity.id !== 'string' || !identity.id || identity.product && identity.product !== 'premium') throw Error('premium');
    await saveAccount(person.userId, { ...before.value, spotify: { access: token.access_token, refresh: token.refresh_token, subject: identity.id, expires: Date.now() + token.expires_in * 1000 } }, before.revision);
    return new Response(null, { status: 303, headers: { ...headers, Location: origin() + '/?connection=connected' } });
  } catch { return new Response(null, { status: 303, headers: { ...headers, Location: origin() + '/?connection=failed' } }); }
}
