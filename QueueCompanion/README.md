# Queue Companion

A small request bar immediately below Spotify’s desktop search. Songs go into Spotify’s real queue; Spotify handles playback. This is an unsigned Windows x64 preview. Queue Companion code is MIT licensed; bundled components retain their own licenses, including LGPL Spicetify and GPLv3 modules. Their notices and corresponding upstream source archives are included in `vendor`.

## Install and use

1. Install the desktop Spotify client from spotify.com and sign in. Start a song on this computer. Premium is the initial target; Free and Microsoft Store installations have not been validated.
2. Open `QueueCompanion.Setup.exe` and choose Install. Keep Spotify open during setup so custom installations can be detected. Setup discloses Spicetify’s unofficial modification of Spotify, saves the stock app archive, installs bundled runtimes and restarts Spotify. No developer dashboard, Spotify application or secret is needed.
3. Open the small gear beside “What do you feel like listening to?” Choose Continue with ChatGPT and finish the browser sign-in and eligible plan-usage consent. This creates Queue Companion’s own registration; it never reads Codex credentials.
4. Type a request and press Enter. Examples: `Add 3 mellow songs for working`, `Mix 15 songs from my "Road Trip", "Summer" and "Indie" playlists`, `Only jazz from my liked songs`, `Add another ten songs like these`, `Start over with 15 energetic songs`.

The default is 15 songs appended, with a configurable maximum of 50. Start over replaces pending manually queued songs and preserves the current song and context. Replacement is enabled only on the tested Spotify 1.3.4.258 build. A changed queue during selection aborts replacement. The native Queue screen remains the place to manage songs. Follow-up context lasts for the current Spotify session; make a new selection after restarting before asking for more.

Use quoted playlist names or Spotify playlist links. Ambiguous names open an inline chooser. A simple playlist mix uses balanced deterministic selection and no inference. Mood and genre requests use one bounded inference request. Fewer songs may be returned when the sources contain too few matching playable tracks. Retrieval is bounded to the first 200 tracks per source; large libraries are not exhaustively classified.

The helper runs without a window and starts at Windows sign-in. After setup, all everyday controls are inside Spotify. If it is stopped, open the gear and choose Start helper. Reconnection never repeats a queue write automatically.

## Listening counts and privacy

“Most played recently” ranks locally observed meaningful plays with the actual start date shown. Spotify’s available recent songs are supported separately; these do not supply complete play counts. Collection starts locally, excludes pauses, seeks and disconnected time, and counts a session after 30 seconds or half the track, whichever is shorter. Events are retained for up to 90 days and 20,000 sessions per Spotify account. Disable or clear counts in settings.

The helper uses DPAPI for OpenAI credentials and owner-only Windows file permissions. Spotify authenticates its own catalogue/library operations. Compact candidate title/artist information, temporary identifiers, the request and up to ten previous song titles/artists for follow-ups are sent for inference. Settings explain that exact remaining ChatGPT quotas are unavailable; actual provider errors are shown. Metadata caches are partitioned by Spotify account and bounded. The local IPC is paired, versioned and restricted to the Spotify process and Spotify’s app origin. No OAuth tokens are written to logs or supplied to the extension.

## Repair, restore and uninstall

- After a Spotify update, open **Queue Companion Setup** from Start and choose Repair, or use Repair installation in the gear. Repair restarts Spotify and retains the protected connection. Spotify versions beyond the tested build may require adapter changes.
- **Restore stock Spotify** removes the modified interface while retaining the connection and installer for later repair.
- Remove **Queue Companion** from Windows Installed apps, or use **Uninstall Queue Companion** in Start. Uninstall removes the helper, startup and URI entries, connection data, caches and local counts. It restores stock Spotify if this installer created Spicetify; otherwise it removes its own module and preserves the pre-existing Spicetify setup.
- Disconnect revokes renewable credentials when reachable and erases tokens locally even if the network fails. If revocation cannot be confirmed, also revoke Queue Companion in ChatGPT’s connected-app settings.

## Troubleshooting

**Spotify could not be located:** use installer 0.1.1 or later. It checks the running app, common folders and Windows installation records. Open Spotify and keep it running, then retry setup from the same Windows account. If needed, choose **Browse for Spotify** and select the installed `Spotify.exe`, rather than the downloaded `SpotifySetup.exe`. Setup validates the app files and remembers this location for repair and the helper's process verification. Store installations remain unverified.

**No bar:** wait for Spotify to finish loading, then Repair. The Spotify update during development required Spicetify 3.0.0-rc.3; version 2.45.3 did not expose the required services. This preview bundles the verified v3 components and disables automatic Spicetify upgrades.

**Another device is active:** select this computer in Spotify’s device menu. Queue writes are paused while a phone or speaker is active.

**Uncertain write:** inspect Spotify’s Queue. Some songs may already exist. Do not repeat append. Restart Spotify, inspect the Queue, then acknowledge the interrupted-write message. The saved receipt is deliberately conservative.

**ChatGPT unavailable:** reconnect, grant plan inference permission and select an available model in settings. Current official documentation supports eligible Plus/Pro plan usage. Free-plan inference has not been tested or promised. Authentication and first library retrieval are outside the warmed-up latency target.

**Playlist missing:** try its Spotify link. The tested root-list service returns the folder tree without paging arguments; playlist and liked-song contents are fetched in pages. Deep folder navigation has not had a separate live acceptance test.

## Build from source

Install Node.js 22 and .NET SDK 10.0.300 on Windows x64, then run `./build.ps1`. Dependencies are pinned by the npm lockfile and the .NET 10.0.8 framework version. The script runs the meaningful automated tests, verifies vendor hashes, builds the extension and self-contained helper, embeds the public vendor payload, then produces `release/setup/QueueCompanion.Setup.exe`. No installed pairing credential, daemon token or OAuth state is included in the distribution.

Architecture: `extension/src/spotify.ts` owns native Spotify services; `domain.ts` parses and enforces constraints; `pipeline.ts` retrieves, classifies and validates; `queue.ts` serializes and reconciles native writes; `ipc.ts` talks to the helper; `index.ts` owns the disposable compact UI. The .NET helper separates OAuth, provider inference, DPAPI storage, peer verification and observed history. C# was chosen because the Windows host already had .NET 10 and no Rust toolchain, allowing a self-contained Windows helper and installer without a separate runtime installation.

Read `docs/VERIFICATION.md` before treating this preview as portable or broadly compatible. The second Windows-account installation/sign-in test is pending, as are live Spotify-account switching and some interruption/device behaviors. Default 15-song mood requests took 8.1–8.7 seconds in the main measured runs and currently miss the 1–5 second target; smaller and deterministic requests were faster. Retention pruning runs when a new meaningful play is recorded.
