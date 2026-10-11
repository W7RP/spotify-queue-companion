# Queue Companion verification

Verified on 10 October 2026. This is a working, unsigned Windows x64 preview installed in the actual Spotify desktop client. Queueing, library reads and ChatGPT inference are live. Portability acceptance is incomplete, and the default 15-song mood request currently exceeds the requested 1–5 second target.

## Tested environment and pinned components

| Component | Actual version / scope |
| --- | --- |
| Windows | Windows 10 Pro, 10.0.19045, x64; one Windows user |
| Spotify | Desktop installation from spotify.com; Premium observed in the actual client |
| Spotify build | 1.3.4.258.gc60b10b0946a; exposed platform version 1.3.4.258 |
| Spicetify | 3.0.0-rc.3, CLI source commit `3cde524eb792da382697a216c68981a6b1f82e77` |
| Spicetify distribution SHA-256 | `aa49b8480a7860280bcdf0989f55347f8c8cf23249ded7aa10efa9a85de97bf2` |
| Spicetify modules | manager 1.5.1, stdlib 1.13.2, store 1.8.1, splash 0.1.1; pinned sources and notices in vendor |
| Helper / installer | .NET 10.0.8, self-contained Windows x64; SDK 10.0.300 |
| Extension build | Node 22.13.0, TypeScript 5.9.3, esbuild 0.25.11; npm lockfile |
| ChatGPT | Fresh Queue Companion registration, browser sign-in and plan-usage consent completed by the user; real model discovery and inference |

Spotify updated during development from 1.2.98 to this build. Spicetify 2.45.3 failed to expose the necessary services. The pinned v3 release candidate worked. Its class map fallback 1030003 was used. Replacement is deliberately gated to the tested Spotify platform version; newer versions require another acceptance check. Microsoft Store Spotify, Windows ARM, Free Spotify and Free ChatGPT have no support claim.

## Source inspection

The implementation inspected current [Spicetify wrapper documentation](https://spicetify.app/docs/development/api-wrapper/functions/add-to-queue), [pinned CLI source](https://github.com/spicetify/cli/tree/v3.0.0-rc.3), [modules source](https://github.com/spicetify/modules) and [Spotifly](https://github.com/ralph/Spotifly) at commit `8b22d236e060121c122d9b7f8dbf791ef949066c`. Runtime inspection then verified the exposed queue, library, playlist, catalogue and Connect services on this client. RootlistAPI.getContents takes no paging arguments and returns the folder tree; actual track contents use paging. Recent-song entries had no complete play counts.

OAuth follows official [registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations). The helper uses its own issued registration, PKCE, callback state, signed ID-token validation, rotating refresh tokens, streaming Responses and store:false. It requests plan-inference permissions, verifies returned scopes and discovers account-specific model slugs. Current documentation describes eligible Plus/Pro usage; identity-only consent is insufficient. No Codex token cache or Spotify credential file is read.

Inspection establishes implementation choices; it is not counted as live acceptance.

## Automated checks

The 0.1.1 build passed **18 extension tests and 16 helper/installer tests**, type checking and self-contained publishing. Three added regression checks cover custom-path discovery, registry path formatting and exact selected-executable peer verification. npm reported zero known vulnerabilities for the extension lockfile. See [build-verification.txt](build-verification.txt).

Installer 0.1.1 fixes an installation-location assumption reported on a friend's computer: 0.1.0 only checked Roaming/Spotify. It now considers the running executable, common desktop installation folders and Windows App Paths/uninstall records, with a Browse option. The selected executable and app-data directory are persisted for apply/restore/repair and exact helper peer verification. Paths are quoted safely for TOML, including Windows account names containing apostrophes. The updated installer repaired the actual installation successfully ([installer-location-fix-proof.json](installer-location-fix-proof.json)); the running executable matched the saved selection and the installed helper matched the build ([selected-location-proof.json](selected-location-proof.json)). Foreign-process IPC rejection was checked again. Regression cases exercise alternative paths; the friend's actual location and successful installation have not yet been observed.

Tests cover source intersections and changed membership, balanced mixes, source escape rejection, intentional/accidental duplicates, add-more source inheritance, compact follow-up context, cancellation before mutation, serialization, concurrent edits, partial/uncertain writes without blind retry, account/device guards, exact catalogue title/artist resolution, explicit availability, completed/truncated/failed SSE, invalid model IDs, quota errors, identity-only scope rejection, real DPAPI round-trip, refresh rotation, failed revocation clearing local tokens, callback rejection and history thresholds/account partitioning. Provider responses and account/device switches in these tests are isolated stubs, not live service acceptance.

## Live observations

| Behavior | Observation / evidence |
| --- | --- |
| Native queue proof | Three known tracks appended with fresh queue entry IDs; current URI and position unchanged. [native-append-proof.json](native-append-proof.json), [native-queue.png](native-queue.png) |
| Removal semantics | Exact URI+UID removal affected only manual entries; current track and context preserved. [native-remove-proof.json](native-remove-proof.json) |
| Mood and discovery | Actual inference, catalogue resolution, playable tracks and exact insertion readback. [mood-acceptance.json](mood-acceptance.json), [default-ui-acceptance.json](default-ui-acceptance.json) |
| Final installed bar | Following layout and adjective-count fixes, the actual input submitted Add 3 mellow songs for working: three requested and confirmed, current unchanged, immediate activity and Added 3 songs. [final-ui-smoke.json](final-ui-smoke.json) |
| Three-playlist mix | Six songs, two each from THE NEW DYNASTY FALL/WINTER 2026, jim and divorced father; each URI verified against actual source contents. [mashup-acceptance.json](mashup-acceptance.json) |
| Liked-song genre constraint | Three metal songs selected entirely from actual liked songs. [final-liked-acceptance.json](final-liked-acceptance.json) |
| Add more | Three new songs, inherited liked-source restriction, compact previous-selection context, no repetition. [more-acceptance.json](more-acceptance.json) |
| Replacement | Old manual IDs removed, new IDs confirmed; current URI, playback position and context unchanged. [replace-acceptance.json](replace-acceptance.json); also 15-song replacement in [fast-model-replace-acceptance.json](fast-model-replace-acceptance.json) |
| Concurrent queue edit | Real native SDK removal during inference aborted replacement. This used the exposed native API, not a mouse edit. [concurrent-edit-acceptance.json](concurrent-edit-acceptance.json) |
| Accurate observed history | Empty-history request gave an honest error. A 34-second listen counted Dissipate by Polaris once; ranking returned that actual record with coverage starting 16:56 UTC. Lifecycle uninstall subsequently removed those test counts. [history-before-acceptance.json](history-before-acceptance.json), [history-listen-proof.json](history-listen-proof.json), [history-after-acceptance.json](history-after-acceptance.json) |
| Helper interruption | Helper killed during selection: IPC disconnected, no native write, no automatic append retry. [helper-interruption-proof.json](helper-interruption-proof.json) |
| Interrupted write | Actual renderer reload during native mutation left a durable writing receipt. Inserted songs existed; restarted UI blocked submission until Queue inspection was acknowledged, and never repeated the append. [interrupted-write-proof.json](interrupted-write-proof.json), [interruption-recovery-proof.json](interruption-recovery-proof.json) |
| Native playback independence | With helper stopped, Next reached the first and second queued URIs and playback progressed. Shuffle/repeat worked and restored; playback paused after testing. Native Previous returned the playback context, rather than reinserting a consumed manual entry; Queue Companion does not override this behavior. [final-native-controls-proof.json](final-native-controls-proof.json) |
| Natural transition | A native seek near the song end followed by playback advanced to the pending URI; production code has no song-end handler. [native-transition-proof.json](native-transition-proof.json). Its immediate repeat-restoration read was premature; the final control proof above waited and confirmed restoration. |
| IPC restrictions | Foreign HTTP, wrong Host, foreign WebSocket process even with Spotify origin, and wrong pairing token rejected; unsolicited OAuth callback rejected. [ipc-security-proof.json](ipc-security-proof.json), [pairing-denial-proof.json](pairing-denial-proof.json) |
| Restart and UI lifecycle | Repeated actual Spotify restarts and renderer reloads retained one bar. Renderer viewport changes and navigation checked width, alignment and stable listener count; these are not a physical mouse resize. [layout-navigation-proof.json](layout-navigation-proof.json), [queue-companion.png](queue-companion.png) |
| Installer lifecycle | Repair, stock restore, uninstall, installed-path uninstaller/self-cleanup, clean reinstall and final packaged install succeeded. Stock archive hash matched the saved backup; own startup/URI/module/data entries were removed. [restore-proof.json](restore-proof.json), [uninstall-proof.json](uninstall-proof.json), [installed-uninstaller-proof.json](installed-uninstaller-proof.json), [final-layout-install-proof.json](final-layout-install-proof.json) |

Older raw evidence is retained where useful and may show an earlier message grammar or an earlier count without the later requested-count field. Only genuine native screenshots are included; no mock interface or success feedback was substituted.

## Latency

These are individual measured observations, not percentile guarantees. Generation is the helper's inference-stream time. Insertion measures the native write and reconciliation. Total also includes retrieval, resolution and validation. Authentication and first installation are excluded.

| Request / evidence | Confirmed songs | Generation | Insertion | Total |
| --- | ---: | ---: | ---: | ---: |
| Mellow mood, mood-acceptance | 3 | 2.328 s | 0.200 s | 4.273 s |
| Final installed mood input, final-ui-smoke | 3 | 1.436 s | 0.246 s | 2.752 s |
| Three-playlist mix, mashup-acceptance | 6 | 0 | 0.367 s | 1.179 s |
| Liked metal, final-liked-acceptance | 3 | 2.680 s | 0.233 s | 3.943 s |
| Add more, more-acceptance | 3 | 2.768 s | 0.227 s | 3.361 s |
| Energetic replacement, replace-acceptance | 3 | 3.263 s | 1.140 s | 6.432 s |
| Local observed ranking, history-after | 1 | 0 | 0.138 s | 0.478 s |
| Default mellow after resolution fixes, default-ui | 15 | 4.895 s | 0.464 s | 8.098 s |
| Warm default, foreground, default-warm-foreground | 15 | 6.350 s | 0.983 s | 8.710 s |
| Alternate gpt-5.6-luna replacement, fast-model-replace | 15 | 8.540 s | 1.221 s | 11.365 s |

Automatic selection currently prefers an available Luna model; the connected account's first was gpt-6-luna. The alternative was slower and the setting was restored to automatic. A hidden-window run also completed 15 songs in 13.639 seconds; the debugger's in-renderer polling timed out, so it is not presented as a completed full acceptance artifact. Hidden Spotify timer throttling can add delay. The **default 15-song mood target is unmet**. Immediate activity appears on submission; smaller and deterministic requests met the target in these observations. There is no artificial delay, automatic inference retry or reduced default count to disguise the measurement.

## Remaining acceptance and practical limits

- **Second Windows account/machine:** user confirmed one is available but deferred it. A same-user reinstall does not establish fresh portability. Follow [SECOND-ACCOUNT-CHECKLIST.md](SECOND-ACCOUNT-CHECKLIST.md).
- **Spotify account and remote Connect switch:** automated guards passed; actual logout/login and phone/speaker switching have not been exercised. No claim of live validation.
- **Physical queue edit and Internet interruption:** live SDK queue edits and helper/renderer interruptions were exercised. Mouse queue edits and a real Internet cut during inference remain separate checks.
- **OAuth lifecycle:** fresh consent and subsequent real inference worked. Rotation/revocation failure paths have isolated tests. Actual remote revocation, expiry-driven refresh and a different ChatGPT subject have not been accepted live. The valid protected connection was held aside during destructive installer testing, then restored. Disconnect always clears local tokens, but network revocation can be unconfirmed.
- **Coexistence:** lifecycle tests began without another user's Spicetify setup. Preservation of a pre-existing third-party Spicetify configuration is implemented but has no live acceptance on a separate installation. Deep playlist-folder navigation also lacks a dedicated live check.
- **Retrieval and music quality:** at most 200 tracks per source and six playlists per mix. Metadata caching is account-partitioned; source membership is fetched again before commit. Mood/genre classification can be imperfect; no fabricated audio features or historical play counts are used. Unresolved suggestions are omitted and partial counts are shown honestly.
- **History:** observed while this extension is connected and receiving playback progress. Renderer restart resets a listening session; elapsed pause/seek/disconnected time is not counted. Rankings cover only actual local records, not all Spotify listening. Retention pruning runs when a new meaningful play is recorded.
- **Follow-up:** previous selection context lasts for this Spotify renderer session. A restart requires making a new selection before asking for more.
- **Distribution:** installer is unsigned, requires the desktop Spotify layout, and bundles an unofficial Spicetify release candidate. Future Spotify changes may break append or library adapters as well as replacement. Repair retains credentials and a stock backup; it cannot guarantee compatibility with untested builds.

The source and installer exclude OAuth tokens, issued user registration, pairing credentials, daemon tokens and Spotify backups. New installs create their own per-user pairing and protected state. Bundled upstream licenses and corresponding source are in vendor. Queue Companion's own code is MIT; that does not replace the LGPL/GPL/MIT/.NET licenses of included components.
