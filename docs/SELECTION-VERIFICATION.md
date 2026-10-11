# Song-count handling — 0.2.3

## Cause and behavior

The requested count is a target. Previously, discovery searched at most 40 catalogue candidates and asked for exactly the target number of model choices. It silently discarded suggested songs that did not resolve to an exact Spotify title/artist, resolved to a duplicate URI, or repeated the previous selection. The model could also return fewer choices than requested. The final success message reported the smaller selection as “Added 43 of 50 songs” without the reason. Native queue confirmation requires the entire submitted selection; a successful partial target is a selection shortfall, not seven silently failed native queue writes.

The user's earlier 43-of-50 run did not preserve per-suggestion diagnostics. Its exact missing seven cannot be attributed retrospectively.

Discovery now searches at least 40 candidates, scaling to 100 for a 50-song request. Searches page using Spotify's existing authenticated GraphQL operation, with at most five pages and 200 raw candidates. Unavailable and duplicate results are excluded. Add-more discovery uses a similarly scaled, bounded artist pool. Search cache keys changed so smaller legacy results are not reused.

Both providers receive the actual queue target plus a separate reserve limit: up to half the target, capped at 25 extra choices. The instructions require reserves to match the same request. Claude's bounded output-token budget includes reserves and remains capped at 6,000. There is still one inference call, no automatic inference retry and one reconciled queue write. Spotify suggestion lookups run in batches of five and stop when the target is filled. All returned candidate IDs, including unused reserves, are validated before trimming. Final playability, source membership, account, cancellation and queue confirmation checks remain enforced.

Restricted playlist/liked requests receive no catalogue reserves and never leave their checked sources. Shortfall feedback states the number of matches selected from the checked candidate subset. Discovery feedback distinguishes fewer model choices, unmatched suggestions, duplicate matches and songs already in the previous selection. Observed/recent history has its own availability explanation. Diagnostic counts are attached to the existing in-memory last-result object; no additional credentials or prompt logging is introduced.

## Automated verification

All 89 checks passed: 28 extension tests, 40 helper/installer tests and 21 headless browser UI checks across four viewport sizes. TypeScript checking and bundling succeeded. Helper tests compile without warnings. Provider tests use isolated HTTP stubs and fake credentials.

New regression checks cover:

- Fifty-song discovery with seven failed exact matches fills to 50 unique tracks from reserves, with one inference and one write. Unused reserves are not all resolved.
- A provider that supplies only 50 proposals with seven failed matches queues 43 and reports seven unmatched suggestions.
- Too few model choices and duplicate Spotify matches are reported separately.
- Invalid or duplicate IDs in unused reserves cannot evade validation.
- Nineteen liked-song matches out of a target of 25 remain within the source and explain the checked subset.
- A new request cancels a request still resolving suggestions before it can mutate the queue.
- Catalogue pagination advances through 40/40/20 pages, handles server-capped pages, skips duplicates/unavailable entries, stops stalled pagination and enforces its five-page ceiling.
- An account change cannot cache results for the original account.
- Shared provider parsing enforces reserve bounds, restricted-source rules, total proposal limits and compatibility with legacy messages that omit the reserve field.
- ChatGPT carries the target/reserve contract; Claude carries it in one bounded Messages call with the correct token budget.

## Live Windows verification

A read-only check on the installed desktop Spotify Premium 1.3.4.258 returned 89 unique usable tracks for a 100-candidate classic-rock search. Current playback identity and pending manual queue entries remained unchanged. No inference or native queue mutation was performed by that check. See `selection-catalogue-live-proof.json`.

Spotify's wrapper exposes its GraphQL request function through a getter, so the initial attempt to instrument it was rejected. The completed check calls the production search adapter directly without replacing that function. Spotify also hydrates background context entries during startup; the completed queue comparison checks the current track and manual entry identities after startup rather than transient context metadata.

This catalogue check and the stubbed seven-failure regression do not establish that the user's exact prompt will always produce 50 real matches. Model output, catalogue availability and the source restrictions can still cause shortfalls; these are now explained. Live Claude inference and the second Windows-account installation remain pending from previous releases.
