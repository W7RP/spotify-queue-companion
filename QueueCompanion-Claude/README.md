# Queue Companion — Claude API edition (0.2.2)

The Queue-panel bar, library access, listening counts and native queue behavior are the same. This release bundles the integration engine and standard library, with the optional Spicetify splash, Store and manager omitted. Queue Companion-owned installations keep normal Spotify startup; Repair retains this minimal profile. Settings now offer Claude API and ChatGPT. This edition installs as the same Queue Companion product and upgrades an existing installation. The original ChatGPT installer is kept separately.

A larger request bar inside Spotify’s Queue panel. The small queue icon immediately before Browse in Spotify’s Search opens Queue and focuses the bar. The request bar takes its own space below the Queue tabs, leaving native queue controls accessible. Songs go into Spotify’s real queue; Spotify handles playback. This is an unsigned Windows x64 preview. Queue Companion code is MIT licensed; bundled components retain their own licenses, including LGPL Spicetify and GPLv3 modules. Their notices and corresponding upstream source archives are included in `vendor`.

## Install and use

1. Install the desktop Spotify client from spotify.com and sign in. Start a song on this computer. Premium is the initial target; Free and Microsoft Store installations have not been validated.
2. Open `QueueCompanion.Claude.Setup.exe` and choose Install. Keep Spotify open during setup so custom installations can be detected. Setup discloses the minimal Spicetify integration’s unofficial modification of Spotify, saves the stock app archive, installs bundled runtimes and restarts Spotify. No developer dashboard, Spotify application or secret is needed.
3. Click the queue icon inside Spotify’s Search, immediately before Browse. Open the small gear beside “What do you feel like listening to?” Choose **Claude API**, paste an **Anthropic API key** from Claude Console and choose **Connect Claude**. The API workspace needs credits and model access. The helper checks the model catalogue before saving the protected key. Subscription login is omitted for this API release, as requested. A Claude Pro subscription does not by itself fund API requests.
4. Automatic model selection prefers an available Haiku model, then Sonnet; you can choose any model offered to your key. Settings show input/output token counts for the last successful selection, not an exact remaining balance. API use is billed by Anthropic.
5. To use ChatGPT, select it, connect through the existing browser sign-in and eligible plan-usage consent, then choose **Save**. Each provider retains its own model preference and credentials. No fallback to the other provider occurs if a request fails.
6. Type a request and press Enter. Examples: `Add 3 mellow songs for working`, `Mix 15 songs from my "Road Trip", "Summer" and "Indie" playlists`, `Only jazz from my liked songs`, `Add another ten songs like these`, `Start over with 15 energetic songs`.

The default is 15 songs appended, with a configurable maximum of 50. Start over replaces pending manually queued songs and preserves the current song and context. Replacement is enabled only on the tested Spotify 1.3.4.258 build. A changed queue during selection aborts replacement. The native Queue screen remains the place to manage songs. Follow-up context lasts for the current Spotify session; make a new selection after restarting before asking for more.

Use quoted playlist names or Spotify playlist links. Ambiguous names open an inline chooser. A simple playlist mix uses balanced deterministic selection and no inference. Mood and genre requests use one bounded inference request. Fewer songs may be returned when the sources contain too few matching playable tracks. Retrieval is bounded to the first 200 tracks per source; large libraries are not exhaustively classified.

The helper runs without a window and starts at Windows sign-in. After setup, all everyday controls are inside Spotify. If it is stopped, open the gear and choose Start helper. Reconnection never repeats a queue write automatically.

## Listening counts and privacy

“Most played recently” ranks locally observed meaningful plays with the actual start date shown. Spotify’s available recent songs are supported separately; these do not supply complete play counts. Collection starts locally, excludes pauses, seeks and disconnected time, and counts a session after 30 seconds or half the track, whichever is shorter. Events are retained for up to 90 days and 20,000 sessions per Spotify account. Disable or clear counts in settings.

The helper uses DPAPI for Anthropic API keys and OpenAI credentials and owner-only Windows file permissions. Spotify authenticates its own catalogue/library operations. Compact candidate title/artist information, temporary identifiers, the request and up to ten previous song titles/artists for follow-ups are sent for inference. Settings explain that exact remaining API balances and ChatGPT quotas are unavailable; credit, access and rate-limit errors are shown. A Claude selection uses one bounded streaming Messages request without tools or automatic retries. Metadata caches are partitioned by Spotify account and bounded. The local IPC is paired, versioned and restricted to the Spotify process and Spotify’s app origin. The API key is entered in a masked field and cleared immediately on submission or closing settings. It is passed over the existing paired local connection to the helper, which alone makes API calls. It is never saved in browser storage or returned by status/settings. No OAuth tokens are supplied to the extension and neither provider’s credentials are written to logs.

## Repair, restore and uninstall

- After a Spotify update, open **Queue Companion Setup** from Start and choose Repair, or use Repair installation in the gear. Repair restarts Spotify and retains the protected connection. Spotify versions beyond the tested build may require adapter changes.
- **Restore stock Spotify** removes the modified interface while retaining the connection and installer for later repair.
- Remove **Queue Companion** from Windows Installed apps, or use **Uninstall Queue Companion** in Start. Uninstall removes the helper, startup and URI entries, connection data, caches and local counts. It restores stock Spotify if this installer created Spicetify; otherwise it removes its own module and preserves the pre-existing Spicetify setup.
- **Remove API key** erases the Claude key on this computer. Revoke the key separately in Claude Console when necessary. Uninstall also removes the local key.
- ChatGPT Disconnect revokes renewable credentials when reachable and erases tokens locally even if the network fails. If revocation cannot be confirmed, also revoke Queue Companion in ChatGPT’s connected-app settings.

For a pre-existing independently installed Spicetify setup, Queue Companion preserves its existing modules and appearance. The minimal profile applies to installations created by Queue Companion.

## Troubleshooting

**Spotify could not be located:** use installer 0.1.1 or later. It checks the running app, common folders and Windows installation records. Open Spotify and keep it running, then retry setup from the same Windows account. If needed, choose **Browse for Spotify** and select the installed `Spotify.exe`, rather than the downloaded `SpotifySetup.exe`. Setup validates the app files and remembers this location for repair and the helper's process verification. Store installations remain unverified.

**No bar:** click the queue icon inside Search or open Spotify’s Queue, then wait for Spotify to finish loading. Use Repair if the icon is missing. The Spotify update during development required Spicetify 3.0.0-rc.3; version 2.45.3 did not expose the required services. This preview bundles the verified v3 components and disables automatic Spicetify upgrades.

**Another device is active:** select this computer in Spotify’s device menu. Queue writes are paused while a phone or speaker is active.

**Uncertain write:** inspect Spotify’s Queue. Some songs may already exist. Do not repeat append. Restart Spotify, inspect the Queue, then acknowledge the interrupted-write message. The saved receipt is deliberately conservative.

**Claude unavailable:** connect a key from Claude Console, ensure that workspace has API credits and choose an available model. Invalid keys, missing access, rate/spending limits and low credit balance produce explicit errors. A truncated or limited response never becomes a queue write. No API key is included in the installer.

**ChatGPT unavailable:** reconnect, grant plan inference permission and select an available model in settings. Current official documentation supports eligible Plus/Pro plan usage. Free-plan inference has not been tested or promised. Authentication and first library retrieval are outside the warmed-up latency target.

**Playlist missing:** try its Spotify link. The tested root-list service returns the folder tree without paging arguments; playlist and liked-song contents are fetched in pages. Deep folder navigation has not had a separate live acceptance test.

## Build from source

Install Node.js 22, Microsoft Edge (for the headless UI checks), and .NET SDK 10.0.300 on Windows x64, then run `./build.ps1`. Dependencies are pinned by the npm lockfile and the .NET 10.0.8 framework version. The script runs the meaningful automated tests, verifies vendor hashes, builds the extension and self-contained helper, embeds the public vendor payload, then produces `release/setup/QueueCompanion.Setup.exe`. No installed API key, pairing credential, daemon token or OAuth state is included in the distribution.

Architecture: `extension/src/spotify.ts` owns native Spotify services; `domain.ts` parses and enforces constraints; `pipeline.ts` retrieves, classifies and validates; `queue.ts` serializes and reconciles native writes; `ipc.ts` talks to the helper; `index.ts` owns the disposable UI; `placement.ts` places the composer inside Queue and reserves space for the Search shortcut. The .NET helper separates OAuth, Claude API inference, shared selection validation, ChatGPT inference, DPAPI storage, peer verification and observed history. C# was chosen because the Windows host already had .NET 10 and no Rust toolchain, allowing a self-contained Windows helper and installer without a separate runtime installation.

Read `docs/MINIMAL-RUNTIME-VERIFICATION.md` for the 0.2.2 runtime release, `docs/QUEUE-PANEL-VERIFICATION.md` for the 0.2.1 UI release and `docs/CLAUDE-VERIFICATION.md` for inherited 0.2.0 provider observations. `docs/VERIFICATION.md` contains inherited observations from the earlier ChatGPT release; its inference timings are not Claude measurements. The second Windows-account installation and actual Claude API inference remain pending. On upgrade, this edition selects Claude by default if legacy settings had no provider field; existing ChatGPT credentials, song counts, queue preference and model choice are retained. Choose ChatGPT and Save to keep using it.
