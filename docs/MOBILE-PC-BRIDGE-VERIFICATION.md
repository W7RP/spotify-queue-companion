# Mobile PC bridge verification

Verified on Windows, 2026-10-18.

The owner-private mobile site polls no public PC endpoint. The Windows helper
checks an HTTPS mailbox using a separate protected computer credential and the
native Sites service-access credential. Pairing pins the single existing site
account; later visitors cannot use that computer. ChatGPT inference uses the
same provider and OAuth instance as the desktop extension, preserving serialized
refresh-token rotation. No OAuth token enters the Site or browser.

The hosted mailbox contains encrypted, short-lived typed prompts and title/artist
results. It accepts no arbitrary URLs, Spotify metadata or remote commands.
Atomic claims are consumed once. A crashed request is not automatically replayed.
Review, catalogue resolution and Spotify writes stay on the Site.

## Checks

- 48 isolated helper checks passed, including protected bridge configuration,
  allowed-origin validation, existing OAuth refresh concurrency and both providers.
- 33 mobile server/domain checks passed, including single-owner pairing, atomic
  claims, crash/replay behavior, expiry, result validation and real workerd HTTP.
- 30 browser checks passed across phone, small-phone and desktop viewports,
  including unauthenticated computer-route rejection, connected/offline PC UI,
  ChatGPT model selection, review and existing queue receipt behavior.
- Mobile TypeScript and production build passed. Windows helper published
  successfully as a self-contained executable.
- Published the existing owner-only Site with environment revision 3 and the new
  schema migrations. Final source: `d691cda73d3a0e7fceb881ec9923d4e316e14480`.
- Updated the installed Windows helper while preserving local provider credentials,
  pairing, desktop preferences and the existing Windows login startup entry.
- The live Site showed **ChatGPT · Connected through your PC** and the offered
  ChatGPT models. No new OAuth sign-in was needed.
- Live `--verify-mobile-bridge --report <local-path>` passed at
  `2026-10-18T21:07:33Z`: Site → outbound PC mailbox → real ChatGPT plan inference
  → bounded song suggestions → Site. This fixed one-song diagnostic consumes plan
  usage, reads no Spotify data and performs no Spotify writes. The diagnostic
  process uses only bridge credentials; the running helper owns OAuth.

## Remaining device check

Spotify reported no active playback device during verification, so an actual
iPhone selection/review/append remains for the owner to try after starting a song
in Spotify. Native queue behavior is covered by the existing integration fixtures;
this is not a claim of a completed physical iPhone playback test.

Keep the PC on, awake and online while finding songs. Once Spotify accepts a
reviewed selection, playback continues independently. Removing the computer
configuration stops polling; it does not disconnect desktop ChatGPT. No incoming
port, tunnel, paid hosting or additional domain was configured.
