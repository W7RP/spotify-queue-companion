# Paused iPhone recovery verification

Verified 2026-10-18. This supplements the earlier playback verification: paused
Spotify is controllable only while iOS keeps its Spotify Connect session alive.

## Observed limitation

With Spotify open but paused on the owner's iPhone, both the available-device list
and playback-state response became empty. The app remembered the owner's recent
iPhone target and attempted a native transfer with `play: true`. Spotify rejected
that request with HTTP 404. This is a real connection boundary, not a requirement
that Queue Companion needs an arbitrary song to generate music.

Spotify's official iOS documentation says disconnected paused clients require an
app switch, and its native SDK uses a play URI to wake Spotify:

- https://developer.spotify.com/documentation/ios/concepts/application-lifecycle
- https://developer.spotify.com/documentation/ios/getting-started

## Recovery behavior

- Refresh device IDs immediately before sending. Combine the advertised device
  list with playback-state information and retain a last-device hint encrypted
  and bound to the connected Spotify account for at most one hour.
- Match a changed ID only by a unique matching name and device type. A missing
  phone must never silently redirect playback to an unrelated computer/speaker.
- Attempt bounded native reactivation of the known device. This may briefly
  resume the previous song before the generated context starts. A rejected
  activation sends no generated playback context and retains the selection.
- For Play now, **Open first song in Spotify** opens the first generated track.
  Tap Play there, return, then continue the saved selection. For Append, resume
  the current Spotify song before continuing, preserving append semantics.
- Store only the opaque pending selection ID and numeric kept-song indexes in
  session storage. The owner-scoped selection remains encrypted on the server
  for ten minutes. Returning/reloading restores it and preserves review removals.
  It does not make another AI request or automatically replay a music write.
- Remove the pending ID/indexes after delivery, clearing a selection or erasing
  saved data. Disconnecting Spotify removes its retained device hint.

## Validation

47 server/domain/runtime checks and 39 browser checks passed, plus TypeScript and
the production build. Actual workerd/D1 tests cover an unadvertised remembered
phone, refused activation followed by successful delivery, and idempotent receipts.
Browser tests cover a Spotify handoff, reload, retained review removals and exactly
one generation before continuation. Private APIs reject anonymous access.

The physical iPhone test began with a paused, unadvertised phone and the rejected
404 activation above. A five-song selection remained saved. The owner then played
**Crawl — Breaking Benjamin** from Search. Continuing the same selection succeeded:
**5 of 5 accepted**, Crawl observed playing, and the other four generated songs
visible immediately next in their selected order. The final playback PUT returned
204. No regeneration or new manually queued entries were needed during recovery.

The existing owner-private Site was published with environment revision 3. Final
source: `20a622ff77fd42f4ad48381ee9cb0de0b6e95c52`. Automatic wake of a fully
suspended native Spotify client is not claimed; the explicit first-song handoff
is the supported fallback in this web preview.
