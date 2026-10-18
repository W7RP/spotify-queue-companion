import { env } from 'cloudflare:workers';
import { user, db, hash, open, origin, account, saveAccount, boundedFetch } from '@/lib/queue/server';
import { finishSpotifySignIn, spotifySignInFailure } from '@/lib/queue/spotify-signin.mjs';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Set-Cookie': 'qc_spotify_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/spotify/callback; Max-Age=0' };
  try {
    const person = await user();
    await finishSpotifySignIn(request, {
      clientId: env.SPOTIFY_CLIENT_ID!, hash, fetch: boundedFetch,
      consumeAttempt: async (state: string) => db().prepare('DELETE FROM oauth_attempts WHERE state = ? AND user_id = ? AND expires_at > ? RETURNING sealed').bind(await hash(state), person.userId, Date.now()).first<{ sealed: string }>(),
      openAttempt: (sealed: string) => open(sealed, person.userId),
      readAccount: () => account(person.userId),
      saveAccount: (value: any, revision: number) => saveAccount(person.userId, value, revision),
    });
    return new Response(null, { status: 303, headers: { ...headers, Location: origin() + '/?connection=connected' } });
  } catch (error) {
    const failure = spotifySignInFailure(error);
    console.warn('spotify_sign_in_failed', JSON.stringify({ reason: failure.reason, stage: failure.stage, status: failure.status }));
    return new Response(null, { status: 303, headers: { ...headers, Location: origin() + '/?connection=failed&reason=' + failure.reason } });
  }
}
