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
