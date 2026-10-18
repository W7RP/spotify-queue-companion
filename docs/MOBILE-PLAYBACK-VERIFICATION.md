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

The user was asked to clear the five Append-test entries for the final clean-order
observation. This document does not claim that step is complete or that public
Spotify APIs provide native manual queue deletion.

Final functional Site source: `3f0b29a3929c06f8a1cf3add05e2101a7d071f31`.
