import { env } from 'cloudflare:workers';
import { user, db, random, hash, seal, origin, fail } from '@/lib/queue/server';
export async function GET() {
  try {
    const person = await user();
    if (!/^[a-f0-9]{32}$/i.test(env.SPOTIFY_CLIENT_ID ?? '')) return Response.redirect(origin() + '/?connection=setup', 303);
    const state = random(), verifier = random() + random(), browser = random(), redirect = origin() + '/api/spotify/callback';
    await db().prepare('DELETE FROM oauth_attempts WHERE expires_at < ?').bind(Date.now()).run();
    await db().prepare('INSERT INTO oauth_attempts(state, user_id, sealed, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await hash(state), person.userId, await seal({ verifier, browser: await hash(browser), redirect }, person.userId), Date.now() + 600_000).run();
    const params = new URLSearchParams({ client_id: env.SPOTIFY_CLIENT_ID!, response_type: 'code', redirect_uri: redirect, code_challenge_method: 'S256', code_challenge: await hash(verifier), state,
      scope: 'user-read-private user-read-playback-state user-modify-playback-state user-read-recently-played playlist-read-private playlist-read-collaborative user-library-read' });
    return new Response(null, { status: 303, headers: { Location: 'https://accounts.spotify.com/authorize?' + params,
      'Set-Cookie': `qc_spotify_oauth=${browser}; HttpOnly; Secure; SameSite=Lax; Path=/api/spotify/callback; Max-Age=600`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return fail(error); }
}
