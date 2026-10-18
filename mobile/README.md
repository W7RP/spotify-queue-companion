# Queue Companion · Mobile preview

An installable web app that sends music requests to the active Spotify queue. Spotify handles playback. ChatGPT selection can use a paired Windows PC; Claude API and Spotify-library requests run without it. This deployment is owner-only.

## On iPhone

1. Open [Queue Companion](https://queue-companion-mobile.quirkycoati256.chatgpt.site) in Safari and sign in with the owning ChatGPT account.
2. In Settings, connect Spotify and choose a Music source. Spotify library can mix named playlists, liked songs and recent plays without an AI key. Claude API enables free-text mood requests using your Anthropic API credits. ChatGPT uses the desktop helper on your paired PC and its existing ChatGPT plan connection. Keep that PC on, awake and online while finding songs; Settings shows whether it is connected. Site sign-in grants app access only, and direct hosted plan inference remains unavailable pending OpenAI access. Spotify Premium and access to the configured Spotify developer app are required. Claude Pro/Max subscriptions do not include API credits.
3. Use Safari’s Share menu → Add to Home Screen → Open as Web App.
4. Open Spotify on your iPhone so it is visible as a Spotify Connect device. A paused client works while Spotify keeps its Connect session alive. On iOS, Spotify can disappear from the API after pausing even while the app remains open. Songs can still be generated without an available playback device.
5. Describe your music and tap **Generate & play**. The default **Play now** mode sends the full selection in one playback command and starts from the first song. Play now tries to resume the chosen device if necessary (the previous song may briefly resume), turns off shuffle and repeat-one, and waits for Spotify to confirm those settings before starting. It replaces the suggested album, playlist or radio context. **Append to queue** keeps the current song and adds to its queue instead.
6. To triage before sending, turn on **Review before sending** in Settings. Remove unwanted suggestions, then play or append the kept songs. If Spotify was unavailable, the generated selection stays on screen so you can open Spotify, refresh devices and send it without generating again.
7. After Spotify accepts the selection, Queue Companion can close. The app distinguishes command acceptance from observed playback and next-up order. An uncertain write is never automatically replayed.

Spotify’s public API cannot delete individual manually queued tracks. Those may remain when a new playback context is started; the app checks the visible order and explains when Spotify still reports a different next-up list. Clear those entries in Spotify’s native Queue if necessary. The API can show only a window of a long queue.

## Music selection

Free-text requests use one Claude request with reserve suggestions, followed by exact Spotify catalogue matching. Unavailable tracks, unmatched suggestions, recording duplicates and songs already in the visible queue can reduce the count. The app reports the number actually sent.

Spotify API data is never sent to Claude. Only the text you type and the requested count enter the model request. Playlist/recent-play discovery instead uses Spotify artist genres locally on the server. Reference recordings are excluded, and an explicit request to include a few playlist originals mixes those in. This preview searches a bounded pool and can return fewer tracks; it does not reproduce every desktop discovery feature.

Direct playlist/liked-song mixes inspect up to 200 available songs per source, with up to six playlists and 200 playlist names. Quote playlist names or paste Spotify playlist links. Ambiguous names require a choice. Mood-filtered library-only requests, conversational “more” follow-ups, complete listening-history counts and deletion of manually queued songs are currently unsupported and produce an explanation rather than silently falling back to unrelated music. Recently played references use up to 50 recent plays. Spotify developer-mode restrictions can limit which playlists are available.

## Privacy and queue writes

- Sites handles owner access and ChatGPT sign-in. This sign-in provides identity; it does not provide ChatGPT inference or billing.
- Spotify uses authorization-code PKCE with short-lived, single-use, browser- and visitor-bound state. No Spotify Client Secret is required.
- API keys, Spotify tokens, pending selections and request details use AES-GCM encryption with visitor-bound authentication. The encryption key is a hosted runtime secret, excluded from source.
- APIs require a trusted signed-in visitor, mutations require the configured Origin, and database lookups are scoped to that visitor.
- The browser stores a draft and opaque pending/last-selection identifiers in session storage. A reopened app reads a delivery receipt without replaying the append. Recent receipt song details remain available only while the associated selection is valid. Provider credentials are not returned to browser storage. The service worker caches only app icons.
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

## PC bridge for personal testing

The paired Windows helper polls this owner-only site over outbound HTTPS. It uses the same OAuth instance as desktop Queue Companion, so rotating ChatGPT credentials stay in DPAPI storage on the PC. There is no tunnel, incoming port, API-key fallback or Spotify playback on the PC. The existing Windows login startup entry starts the helper again after sign-in.

An operator configures `PC_BRIDGE_TOKEN_HASH` as a secret in Sites and sends `{origin, serviceToken, bridgeToken}` to `node ../scripts/configure-mobile-bridge.mjs <absolute-helper-path>` through hidden stdin. `bridgeToken` is a random 32-byte base64url credential; its SHA-256 base64url hash goes in Sites. `serviceToken` is the native Sites service-access credential, restricted to this private site's origin. Never put either token in source, command arguments, logs, browser storage or a URL. Publish the environment revision before restarting the updated helper.

The helper registers against a single existing site account, then pins that owner permanently in D1. It refuses ambiguous initial pairing. Sharing the site later does not give other visitors access to the PC. Deleting saved user data clears pending music jobs but retains the pairing boundary. Removing the local `mobile-bridge.dat` connection (`QueueCompanion.exe --disable-mobile-bridge`) stops polling; desktop ChatGPT remains connected. Uninstall removes both provider credentials and bridge configuration.

Only the typed music request, count and offered model reach the PC. It returns bounded title/artist pairs. Spotify account tokens, queue contents, library metadata and artwork never enter the model request. Pending requests and results are encrypted, expire after 100 seconds and are removed after consumption. An atomic one-time claim prevents automatic inference replay after a crash, timeout or uncertain completion; a new user request can try again. Review and Spotify queue writes remain on the site.

After setup: choose **ChatGPT** in Settings, check **Connected through your PC**, start Spotify on the iPhone, then find, review and append songs. Once Spotify accepts them, the page can close and the PC is no longer needed for those queued songs.

## Playback write handling

Player POST/PUT success responses are acknowledgements. Empty 200, 202 and 204 replies are all accepted without trying to parse JSON. Previously an empty non-204 reply could add the first song, fail JSON parsing, record zero accepted and stop the batch. The append pipeline now checkpoints every acknowledged write; Play now submits the whole bounded list in one PUT to `/me/player/play` with `position_ms: 0`. Receipts prevent duplicate sends after reloads. Playback confirmation is read-only and cannot trigger a replay.

Device discovery uses `/me/player/devices`, including paused controllable clients, and rechecks the chosen device immediately before sending. No active song is required for discovery or generation. An expired uncertain append can be superseded by an explicit new Play now request; a still-active operation remains protected by its lease.

## Paused iPhone recovery

The app refreshes device IDs immediately before sending, combines available-device and playback-state information, and keeps a Spotify-account-bound last-device hint encrypted for up to one hour. A unique matching device name/type can recover a changed device ID. It never silently redirects a missing phone request to an unrelated computer or speaker. A bounded native transfer with `play: true` tries to restore the last selected device before the generated list is sent. Some iPhones refuse this when iOS has suspended Spotify's Connect session.

If Spotify refuses activation, the generated list remains saved for ten minutes. Choose **Open first song in Spotify**, tap Play in Spotify, then return and send the saved selection. This uses the first generated song instead of a throwaway track. Returning or reloading restores the same visitor-owned selection using an opaque session identifier and numeric kept-song indexes (review removals survive the handoff); it makes no new AI request and does not automatically send or replay music. Expired selections remain unavailable.

Spotify documents that iOS App Remote needs an app switch to resume a disconnected paused client, and its native SDK uses a play URI to wake Spotify: [application lifecycle](https://developer.spotify.com/documentation/ios/concepts/application-lifecycle), [initial music configuration](https://developer.spotify.com/documentation/ios/getting-started). A web app cannot guarantee waking a suspended native Spotify client. No background keep-alive loop or native SDK capability is claimed here.
