# Listening-reference discovery — 0.2.4

## Findings

The previous parser marked any mention of “recently played” or listening history as a direct history request. “More music just like my recently played tracks” therefore skipped inference and catalogue discovery and replayed the available recent list. That list can contain repeated plays of one track; final validation rejected those as accidental duplicates. The same message could also occur when the model selected duplicate candidate IDs. This was routing and duplicate-handling behavior, not evidence of the model successfully trying and failing to discover similar music.

## Changes

- Distinguish direct replay from music inspired by recent or locally most-played songs. Explicit history references work in a fresh session and do not require a prior Queue Companion selection. Playlist names remain data rather than triggering history commands.
- Deduplicate available references and choose up to 12 with artist variety. Search up to four reference artists in parallel for a bounded initial pool. Send compact title/artist references separately from queue candidates. The model infers musical compatibility and is instructed to include related artists beyond the seed artists, subject to narrower user constraints. These are inferred musical judgments, not measured genre/audio-feature claims.
- Exclude all available reference songs, matching remastered/mono/stereo album editions, current tracks, and pending append tracks. More requests exclude the previous selection. Source replacement can reuse tracks from the queue being replaced; fresh source membership is still verified. Live/acoustic/remix title variants remain distinct.
- Preserve all valid model proposals through parsing, then remove duplicate IDs, URIs and song identities on the client and fill from available reserves. Unknown IDs and oversized responses are still rejected, including unused reserves. Restricted-source discovery never accepts catalogue suggestions.
- Remove repeated/familiar suggestions before exact Spotify lookups. Resolve and validate in bounded batches of ten rather than five, preserving order. Four artist searches run concurrently. There is still one inference call, no automatic inference retry and one reconciled native queue write.
- Keep intentional repeat requests working while negated phrases such as “no duplicates” and “do not include duplicates” disable repeats. Direct recent replay deduplicates history before taking the requested count.
- Check the Spotify account around history retrieval and before sending references to inference. Record retrieval, resolution and validation timing alongside the existing in-memory result; no new prompt or credential log is created.

## Automated verification

All 106 checks passed: 43 extension tests, 42 helper/installer tests and 21 browser UI checks across four viewport sizes. TypeScript checking and bundling succeeded. Helper tests use isolated fake credentials and HTTP stubs.

New checks exercise the user's exact prompt on a fresh session, different-song discovery and related-artist suggestions, seed exclusions before lookups, alternate editions, source-restricted inspiration, most-played inspiration, empty-history failure, replay deduplication before trimming, recoverable duplicate candidate IDs, explicit source replacement, bounded diverse references and repeat negation. Native availability checks prove ten concurrent requests at most, one request per track and unchanged output order. History account changes abort before inference, and retrieval remains capped at 200 raw entries. Provider parsing bounds seeds separately from candidates and retains valid duplicate proposals for client recovery.

The earlier seven-failed-match reserve regression and native queue reconciliation/source membership/cancellation tests still pass. See `SELECTION-VERIFICATION.md` for the prior 0.2.3 findings and observations.

## Live verification

Live measurements and installer upgrade results are recorded separately after testing the built release. A read-only verification writer is used for selection tests, so no test tracks are appended or removed. Live Claude inference and the second Windows-account installation remain pending from earlier releases.
