# Queue Companion Claude API edition — 0.2.0

Built and checked on 10 October 2026, on the same Windows 10 x64 / Spotify Premium desktop installation (Spotify 1.3.4.258) documented in the earlier release. This installer adds Claude API access and retains the ChatGPT connection option, native queue integration and the 0.1.1 custom Spotify-location fix. The original release files remain separate.

## Implementation and automated checks

The release passed **18 extension tests and 28 helper/installer tests**, TypeScript checking, pinned vendor hash verification and self-contained .NET publishing. Twelve new test groups exercise the Claude adapter. See [claude-build-verification.txt](claude-build-verification.txt).

Claude uses the official [Messages API](https://platform.claude.com/docs/en/api/messages/create), [Models API](https://platform.claude.com/docs/en/api/models/list) and [streaming event contract](https://platform.claude.com/docs/en/build-with-claude/streaming). The helper uses a fixed HTTPS Anthropic endpoint, `x-api-key`, `anthropic-version: 2023-06-01`, a discovered available model and one bounded streaming Messages request. There are no tools, agent loops, retries or fallback to ChatGPT. Automatic selection prefers an available Haiku model, then Sonnet, using the catalogue's explicit `line` field. It does not infer model families from identifiers. Without that metadata, it uses the first available catalogue entry. Input/output token counts are reported after a validated selection; an exact remaining credit balance is not available.

Test responses are isolated HTTP stubs, not real Claude calls. Checks cover request headers and fields; compact source restrictions without Spotify URIs; model pagination and retirement; valid selection and usage; fabricated IDs, source escape, duplicates and invalid JSON; truncated, token-limited, refused, error and unexpected tool streams; unauthorized/access/rate/spending/overload/credit failures; real Windows DPAPI encryption with plaintext absent from disk; unsuccessful replacement preserving the old key; successful rotation resetting models/usage; disconnect during connection, model retrieval or inference; cancellation before persistence; and legacy preferences retaining independent provider model choices. A changed key invalidates an in-flight selection. Status never returns the key.

## Actual installed Spotify checks

| Check | Result / evidence |
| --- | --- |
| Upgrade/repair | Initial and final installer repairs completed with exit code 0. Installed helper and staged module hashes match the final build; version is 0.2.0. Spotify was restarted normally and the temporary debug port closed. [claude-install-proof.json](claude-install-proof.json), [claude-final-install-proof.json](claude-final-install-proof.json), [installed files](claude-installed-files-proof.json) |
| Claude settings and missing connection | One bar, Claude default, masked key input, immediate clearing on submit and close, blank field on reopening, invalid subscription-token format rejected. A mood request without a key returned an actionable error with no selection and no queue/current-song change. [claude-ui-smoke.json](claude-ui-smoke.json), [actual settings screenshot](claude-settings.png) |
| Inference-free playlist mix | Six real songs, two from each of three actual playlists, verified source membership, fresh native queue identities, current song unchanged. Completed in 0.994 s; generation 0. This ran while Claude was selected without a key. [claude-deterministic-mix-proof.json](claude-deterministic-mix-proof.json) |
| Provider switch | ChatGPT connection survived the upgrade; seven available models were discovered through the installed popover. Save selected ChatGPT. [provider-switch-proof.json](provider-switch-proof.json) |
| ChatGPT regression in this build | Actual form submission selected and confirmed three songs, current song unchanged, immediate activity and Added 3 songs. Generation 4.979 s, total 6.435 s. These are ChatGPT measurements, not Claude latency. [claude-build-chatgpt-regression.json](claude-build-chatgpt-regression.json) |
| IPC boundary | Foreign HTTP/process WebSockets, wrong Host and unsolicited OAuth callback rejected again. [claude-ipc-security-proof.json](claude-ipc-security-proof.json) |
| Cleanup and settings | Nine exact test queue identities removed; fifteen manual entries remained and playback stayed paused. Local preferences restored to ChatGPT, 15/50, replace and automatic model. [claude-test-cleanup-proof.json](claude-test-cleanup-proof.json), [claude-final-settings-proof.json](claude-final-settings-proof.json) |

The cleanup's full remaining-entry equality check returned false. A follow-up native append/remove check confirmed why this comparison is unsuitable for cleanup: Spotify exposes an 80-entry window, and removing one manual entry expanded the visible context from 64 to 65. The context prefix and all existing manual identities/order were preserved, as was the current song. The original failed comparison is retained, not rewritten as a passing observation. [claude-queue-window-proof.json](claude-queue-window-proof.json)

## Credentials, distribution and remaining checks

The masked key field passes the submitted key only to the paired local helper, clears it immediately, and never persists it in browser storage. The helper verifies model access before saving `claude-key.dat` using user-bound Windows DPAPI and owner-only file permissions. Failed replacement leaves the existing key intact. Remove API key and uninstall erase the key locally; revocation in Claude Console is a separate action. The installer/source archive contain public source and vendor components, not installed API keys, pairing credentials or OAuth data.

This release is **API only for Claude**, as requested. No Claude subscription login or token-cache import is offered. A Pro subscription does not by itself fund API calls; use the API workspace's credits. The earlier investigation of subscription integration was deferred, not represented as a working feature. Anthropic's [developer guidance](https://code.claude.com/docs/en/agent-sdk/quickstart) describes approval requirements for third-party subscription login; [API-credit eligibility](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers) is separate from this app's API key support.

**Actual Claude API connection/inference is unverified:** no real Anthropic API key was supplied for the local test. The friend must connect his own key, verify model discovery and run a mood request. Claude music quality, billed usage, service behavior and latency are not established by the contract tests. No latency promise is made.

**Second Windows user/machine remains pending.** Run [SECOND-ACCOUNT-CHECKLIST.md](SECOND-ACCOUNT-CHECKLIST.md) with this installer and a fresh API key. The friend's successful installation at his actual Spotify location has not yet been observed. Windows ARM, Store Spotify, Free Spotify and newer Spotify versions remain unverified. The unsigned installer and pinned unofficial Spicetify integration retain the earlier practical compatibility limits.

[VERIFICATION.md](VERIFICATION.md) and the other inherited evidence describe the earlier ChatGPT releases. They establish the baseline and must not be read as Claude service acceptance or timings.
