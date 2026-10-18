# Queue Companion · Mobile preview

An installable web app that sends music requests to the active Spotify queue. Spotify handles playback; no desktop companion needs to run. This deployment is owner-only.

## On iPhone

1. Open [Queue Companion](https://queue-companion-mobile.quirkycoati256.chatgpt.site) in Safari and sign in with the owning ChatGPT account.
2. In Settings, connect Spotify and enter your Anthropic API key. Spotify Premium and access to the configured Spotify developer app are required. Claude Pro/Max subscriptions do not include API credits.
3. Use Safari’s Share menu → Add to Home Screen → Open as Web App.
4. Start a song in Spotify, open Queue Companion, describe the music, choose a count, and tap Add to queue.
5. Keep Queue Companion open until sending finishes. Afterward you can close it; playback continues in Spotify.

Each request appends songs. It does not replace or clear the native queue. The displayed device is the target; a device change before sending requires a fresh request.

If connecting from ChatGPT’s embedded browser fails, open the site directly in Safari and start a fresh connection there. Sign-in links use top-level navigation. A failed callback reports whether the browser session was lost, the attempt expired, Spotify rejected the code, profile access was denied, or connection storage failed. Diagnostics contain fixed error codes and HTTP status only, without provider credentials or profile data.

## Music selection

Free-text requests use one Claude request with reserve suggestions, followed by exact Spotify catalogue matching. Unavailable tracks, unmatched suggestions, recording duplicates and songs already in the visible queue can reduce the count. The app reports the number actually sent.

Spotify API data is never sent to Claude. Only the text you type and the requested count enter the model request. Playlist/recent-play discovery instead uses Spotify artist genres locally on the server. Reference recordings are excluded, and an explicit request to include a few playlist originals mixes those in. This preview searches a bounded pool and can return fewer tracks; it does not reproduce every desktop discovery feature.

Direct playlist/liked-song mixes inspect up to 200 available songs per source, with up to six playlists and 200 playlist names. Quote playlist names or paste Spotify playlist links. Ambiguous names require a choice. Mood-filtered library-only requests, conversational “more” follow-ups, complete listening-history counts and queue replacement are currently unsupported and produce an explanation rather than silently falling back to unrelated music. Recently played references use up to 50 recent plays. Spotify developer-mode restrictions can limit which playlists are available.

## Privacy and queue writes

- Sites handles owner access and ChatGPT sign-in. This sign-in provides identity; it does not provide ChatGPT inference or billing.
- Spotify uses authorization-code PKCE with short-lived, single-use, browser- and visitor-bound state. No Spotify Client Secret is required.
- API keys, Spotify tokens, pending selections and request details use AES-GCM encryption with visitor-bound authentication. The encryption key is a hosted runtime secret, excluded from source.
- APIs require a trusted signed-in visitor, mutations require the configured Origin, and database lookups are scoped to that visitor.
- The browser stores a draft and an opaque pending-selection identifier in session storage. Provider credentials are not returned to browser storage. The service worker caches only app icons.
- Pending selections become unavailable after ten minutes and expired rows are removed during later selections. Request history contains the typed prompt and delivery counts, with the latest 20 shown. Settings → Privacy and saved data removes stored connections, selections and history. Spotify authorization can also be revoked from your Spotify account.
- Queue writes are sequential, recorded before sending, and deduplicated by selection. Network errors and server errors stop the batch without retrying uncertain writes. Reopening reads a receipt; it never replays a queue request. An uncertain batch requires an explicit queue review before another batch can start.
- “Sent to Spotify” means the queue API accepted the command. It does not claim that Spotify has already played the song or independently verify every entry beyond Spotify’s visible queue window.

## Development

Node.js 22.13+ and Git are required. The app uses React, Vinext and a Cloudflare Worker with D1. Sites build integration and dispatch-owned authentication are preserved.

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_low_thunderbolt.sql
npm run dev
```

Apply each migration once per local database. The portable development server defaults to loopback port 5173. Its built-in `/signin-with-chatgpt?return_to=/` path creates a development identity; this simulation is absent from production builds. Set local Worker variables through an ignored `.dev.vars` file if testing provider connections. Use separate development credentials and a separate encryption key.

Hosted runtime configuration:

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact HTTPS site origin, without trailing slash |
| `SPOTIFY_CLIENT_ID` | Public Spotify developer app Client ID |
| `DATA_ENCRYPTION_KEY` | Secret, random 32-byte key encoded as 64 lowercase hex characters |

Configure the Spotify app for Web API with the exact `${APP_ORIGIN}/api/spotify/callback` redirect URI. Add permitted testers in Spotify’s developer dashboard. Preserve the encryption key across deployments or saved connections become unreadable.

Verification:

```sh
npm test
npm run typecheck
npm run test:ui
npm run build
```

Browser tests use explicit fixtures at phone, small-phone and desktop sizes. They exercise a single successful batch, interrupted-write recovery, settings, privacy dialogs, focus and browser-storage behavior. They require a running local preview and Microsoft Edge; change the Playwright browser channel for another environment. Transport tests run the actual HTTP helper and callback flow in Miniflare/workerd with in-memory provider responses, including redirect rejection and timeout behavior. Provider sign-in, a real Claude inference and native Spotify queue changes still require live account testing. Never treat fixture tests as live integration verification.

Publish with the Sites skill’s source workflow and private deployment operation. `.openai/hosting.json` is the existing site identity; do not create a duplicate Site. Production runtime secrets and local execution state must never enter Git.

Queue Companion is an independent companion for Spotify and is not affiliated with Spotify or Anthropic.
