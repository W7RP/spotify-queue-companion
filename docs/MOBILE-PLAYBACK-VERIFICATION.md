# Mobile playback and append verification

Verified 2026-10-18 against the owner's iPhone and isolated workerd/D1 fixtures.

## Changes

- Default flow: describe music → **Generate & play** → start the full selection.
  **Play now** uses one PUT to `/me/player/play` with every selected URI and
  `position_ms: 0`. Append remains optional, as does pre-send review.
- Selection no longer requires an active song or device. Device discovery uses
  Spotify Connect's available-device list, including paused controllable clients.
  The selected device is rechecked before sending. When necessary, Play now
  activates that device without requesting playback, then waits for confirmation.
- Play now disables shuffle and repeat-one and confirms the resulting playback
  state before starting. The live test exposed that shuffle can start a later URI
  even when the entire URI list was accepted.
- Empty successful Player writes, including HTTP 200/202/204, are acknowledged
  without JSON parsing. The old wrapper parsed every non-204 response as JSON;
  an empty 200 added a song but failed before incrementing the accepted count.
  Production Append logs confirmed HTTP 200 replies on the iPhone.
- Append checkpoints every acknowledged track; Play now checkpoints the entire
  accepted list. Both paths preserve selection receipts and avoid write replay.
  Playback observation is separate from command acceptance.
- A new Play now request can supersede an expired uncertain append operation.
  A still-active operation remains protected by its lease.

## Checks and live observations

- 43 server/domain/runtime tests passed. New real workerd/D1 tests execute the
  actual commit, storage and Spotify transport code against provider fixtures:
  twenty empty-200 append acknowledgements all count, replay sends nothing, other
  visitors cannot use the selection, and an empty-202 Play now request starts all
  twenty URIs in one command on a paused device.
- Shuffle, inactive-device activation, repeat-one, lagging state observation,
  first-song verification and retained manual queue entries have regression checks.
- 36 UI checks passed across phone, small-phone and desktop layouts. They cover
  automatic generation/playback, generation without a device, retaining an unsent
  selection, optional review and existing provider/privacy/receipt behavior.
- TypeScript and the production build passed. The existing owner-private Site
  deployed successfully, retaining environment revision 3 and its PC bridge.
- First live ChatGPT request: 19 catalogue matches accepted and visible in Spotify;
  the previous suggested context was replaced. Shuffle selected a later first
  song, which prompted the ordered-playback fix.
- Live Append: five liked songs accepted (5/5), all five independently visible in
  Spotify's queue, with the current song continuing. Production write logs showed
  HTTP 200. This verifies the reported first-track/zero-count failure is fixed.
- Final live ChatGPT request: 20/20 accepted and the first selected track,
  **Wicked Annabella — The Kinks**, observed playing. The next generated tracks
  appeared in order after the five manually queued Append-test entries.

## Spotify boundary

Starting a new context replaces the suggested album, playlist or radio sequence.
It does not delete pre-existing manually queued entries. The live test confirmed
those manual entries survive and precede the remainder of the new selection.
The UI detects a different visible next-up sequence and explains this limitation.
They must be cleared in Spotify's native **Next in queue** section. Play now
creates no manual entries, so subsequent Play now requests do not require this
cleanup unless another client or an Append operation has added manual entries.

The user cleared the five manual test entries. A fresh live ChatGPT request then
passed the complete clean-queue check: **20 of 20 accepted**, **Moonchild — Rory
Gallagher** (selection index 0) observed playing, and all nineteen remaining
selected songs independently visible in their generated order, beginning with
**The Nile Song — Pink Floyd**. No old manual or suggested-context songs remained
in the visible list. The page reported playing on iPhone and that it could close.
This confirms the normal default flow on the physical iPhone; it does not imply
that public Spotify APIs provide native manual queue deletion.

Final functional Site source: `3f0b29a3929c06f8a1cf3add05e2101a7d071f31`.


---

# Mobile playback acknowledgement recovery

2026-10-21: a user reported that Play now stopped their current song, left Spotify
empty, and still showed a green acknowledgement in Queue Companion. Production logs
showed a 204 response from Spotify's start-playback endpoint. The app's URI-list
request matches Spotify's documented format. No change to the playback implementation
had been deployed between the working version and this report. These facts do not
establish why Spotify failed to start the list.

The confirmed application bug was treating an accepted write as completed playback.
The fix keeps accepted and observed delivery distinct, persists observation in the
receipt, and requires the selected device, playing first song and next-up sequence
before reporting completion. A missing observation is unconfirmed and retains the
generated selection. Delayed read-only checks may confirm it without another write.
Device wake-up now waits for playing state as well as the device ID, avoiding a
replacement while a transfer is still pending.

Recovery is an explicit user action: open the first saved song and tap Play in
Spotify, then continue the existing selection. The server checks the first song and
device, preserves source/account checks, and creates one deterministic child attempt
for the same selected list. Repeated requests return its receipt. No automatic replay
or new inference is performed, and a failed child cannot create a recovery chain.
Selection expiry remains ten minutes. An uncertain transport error retains its
existing manual-review behavior; it is not treated as a known empty acknowledgement.

Regression coverage uses actual selection/receipt code and encrypted D1 records with
fixture Spotify transport: a 204 that empties playback, persistence across receipts,
blocked recovery before native playback, successful recovery without repeated writes,
late confirmation through reads, another account, and a second failure with no third
attempt. Browser coverage checks that the warning and saved selection survive reload
and no green success or repeated model request appears before confirmed recovery.

No live Spotify playback writes were made during these checks. The real-device
failure and recovery still need confirmation from the user's phone; passing transport
fixtures is not evidence that Spotify's current iOS behavior is resolved.

Verification for this update: 67 backend checks and 48 browser checks passed; TypeScript and the production build passed. Live-phone confirmation remains pending.

## Playlist-context recovery (2026-10-21)

The user's follow-up disproved the first-song warmup workaround above: both the original URI-list request and its explicit recovery returned success while clearing playback. The old recovery behavior is superseded by this update.

Play now now requires `playlist-modify-private` and uses one private, non-collaborative Queue Companion playlist per Spotify account. Existing connections get a reconnect link; missing permission causes no Spotify writes and preserves the saved selection. Granted scopes are recorded during sign-in and preserved or updated on token refresh.

Before playback, the server creates or reuses only its stored account-bound playlist ID, verifies ownership/privacy on reuse, replaces all items in one request, and reads back the complete ordered list. No player command is sent if this verification fails. Playback starts using `context_uri: spotify:playlist:<id>`, offset position zero. The bare `uris` form is no longer sent to the player endpoint. Append continues using the queue endpoint. Repeated receipts and status refreshes do not replay playback.

An unconfirmed start retains a link to the full playlist; users can open it in Spotify and press Play. Read-only refresh can confirm it. Existing unconfirmed legacy URI jobs can migrate once to the playlist path, with deterministic recovery IDs and owner/source checks. The old first-song prerequisite is removed. Normal Spotify manual-queue limitations still apply.

Evidence: production accepted both the initial and recovery URI-list commands without confirming playback. Other developers report the same failure and successful context-based playback in [Spotify Community](https://community.spotify.com/forum/en/discussion/7552922/web-api-me-player-play-returns-204-but-does-not-start-playback-and-clears-current-playback-desktop). This is a reported workaround, not a confirmed Spotify diagnosis. The implementation uses the documented [create playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist), [replace playlist items](https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-items), and [start playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback) endpoints.

Validation: 70 backend/runtime/domain tests, 51 browser checks across phone, small phone and desktop, TypeScript, and the production build passed. The runtime fixture rejects every bare URI-list play command, including a warm recovery, while allowing playlist contexts. Additional cases cover missing permission with zero writes, playlist reuse, changed privacy, partial propagation, failed context playback without replay, manual confirmation by reads, and legacy migration. The final 10 commit-runtime cases were rerun after updating the legacy recovery namespace. No real Spotify playback writes were made by the assistant. Real-device verification remains pending after the user reconnects Spotify.

## Queue-only correction (2026-10-21)

The playlist-context approach above was rejected by the user and withdrawn. Queue Companion must work through the queue, without creating or editing playlists. The deployed correction removes playlist creation, replacement, scope tracking, the added playlist permission and reconnect prompt. It does not delete anything in a user's Spotify library. Normal Play now again sends the original track-list playback request.

A separate, confirmed recovery bug is fixed: Continue previously repeated the full-list play command after the user manually started the first saved song. Continue now checks that the first saved song is playing on the selected device, then adds only the remaining songs via POST /me/player/queue. It does not send another play command. The current song/device is rechecked during delivery; an interruption or ambiguous response halts delivery and preserves a receipt rather than resending tracks. The first song is counted once, and deterministic recovery receipts prevent duplicate continuation. Legacy recovery IDs use a separate namespace so an old failed restart cannot silently repeat.

Queue observation now checks up to twenty successors rather than five, so a five-song partial recovery cannot confirm a longer selection. The normal start checks the selected device immediately before writing and logs only safe device type/state/count diagnostics. No track names, device identifiers or credentials are added to logs.

Read-only environment checks found Tailscale running on the Windows PC without an active exit node. The standard OpenClaw configuration had no Spotify channel or plugin. This does not establish the phone's VPN state or exclude other automation. The hosted backend sends Spotify API requests directly; the PC bridge supplies model selection. The initial playback regression remains unconfirmed pending the selected-device/network details and a live test. Other users' desktop reports do not establish the cause on this user's device.

Validation: 69 backend/runtime/domain checks and 48 browser checks passed, as did TypeScript and the production build. The workerd/D1 recovery fixture now rejects every full-list playback command, including warm attempts, but confirms the first song remains playing while the other nineteen are queued exactly once. Another fixture stops on a partial queue failure and proves repeated Continue does not resend. No live Spotify playback writes or network changes were performed by the assistant. This fixes recovery logic; it is not proof that initial automatic playback is restored on the user's device.

## Automatic empty-player recovery (2026-10-21)

The user confirmed that failed starts leave Spotify with no current song, with one intermittent success after several refreshes. Production logs recorded a Smartphone already playing before the full-list start returned 204; playback remained unconfirmed afterward. The phone uses Tailscale without an exit node. No causal relationship to Tailscale or OpenClaw has been established, and no network settings were changed.

The normal direct track-list start now allows more time for Connect to settle. Three additional reads must establish a known empty player and empty queue on the same device before automatic recovery. Missing playback data, an existing song, existing queue entries or a different device forbid rebuilding. A timed-out original write never enters this fallback.

A permitted rebuild records its attempt durably before sending each selected URI once through POST /me/player/queue. Device, current song and queue prefix are checked during delivery. Only after the queued first song is visible does the app send one POST /me/player/next and observe playback/order. If Spotify starts the first queued song itself, Next is omitted. No playlists, playlist editing scopes or new sign-in are involved.

Partial writes, foreign playback, unobserved queue updates and lost responses halt further commands. Reloads cannot enqueue again or repeat Next. A fully queued attempt with a lost advance response may later be confirmed through reads; a partial attempt cannot become complete merely because a later snapshot resembles the selection. Manual first-song continuation is available only when no automatic rebuild was attempted.

The client checks unconfirmed receipts every two seconds for up to thirty seconds while visible, using reads only. Confirmation clears the old warning and pending selection. Recovery flags survive reloads and prevent duplicate manual continuation. Logs contain only device/state booleans and counts, without track names, device IDs or credentials.

Validation: 80 backend/domain/runtime checks, 54 browser checks, TypeScript and production build passed. Workerd/D1 coverage includes empty-player rebuilding after all list-play commands fail, delayed original starts, existing queues, device changes, missing queue propagation, partial delivery, refused Next and lost advance responses. Pure tests include fifty tracks and the first queued track starting itself. Browser tests verify read-only automatic confirmation and durable no-replay behavior. Fixture wait intervals are compressed without removing reads or state transitions. No live Spotify playback writes were made by the assistant; phone confirmation remains pending.

References: [Spotify queue](https://developer.spotify.com/documentation/web-api/reference/add-to-queue), [Spotify Next](https://developer.spotify.com/documentation/web-api/reference/skip-users-playback-to-next-track), [Spotify playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback), [Tailscale exit-node routing](https://tailscale.com/docs/features/exit-nodes).

## Delivery through short connection interruptions (2026-10-21)

The phone still cleared playback with its VPN and Tailscale disabled. Production
recorded a canceled queue invocation after about 6.9 seconds. A separate recovery
received four successful enqueue acknowledgements followed by a 502 on the fifth,
without advancing playback. This exposes application failure handling problems;
it does not establish why Spotify's initial full-list command empties the player.

Queue and Continue operations now register their existing promise with Workers
waitUntil, preserving the same job through a brief browser disconnect rather than
replaying it. Cloudflare permits up to thirty seconds of work after disconnect;
this is bounded recovery, not indefinite background processing. After a lost HTTP
response the browser follows its saved receipt with reads, blocks duplicate delivery,
and avoids showing success until playback is observed.

Recovery retains the selected device through short missing reads. An ambiguous
enqueue response is reconciled through exact positive queue evidence, never by
resending that track. If a later enqueue cannot be confirmed, the app may start the
confirmed prefix once and reports the partial count. A narrowly bounded final-track
case may be confirmed later only when the entire selected order fits in Spotify's
visible queue window. Other partial attempts cannot become complete based on a
limited snapshot. No playlist behavior or permissions are added.

Validation: 85 backend/domain/runtime checks, 57 browser checks, TypeScript and
production build passed. A real workerd/D1 fixture gates delivery until its HTTP
response has ended, then verifies the original operation finishes once. Other cases
cover applied-but-502 writes, late final-track confirmation, retained devices and
partial prefix playback without replay. The assistant made no live Spotify playback
writes; the next phone test remains necessary to confirm the observed regression.

Reference: [Cloudflare waitUntil lifetime](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil).
