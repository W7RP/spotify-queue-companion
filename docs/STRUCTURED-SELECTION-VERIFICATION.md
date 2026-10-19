# Structured selection verification

Verified 2026-10-19. Shared selection policy: 1.1.0.

The model returns a musical brief alongside its proposed songs in one response.
This records similarity versus artist-only intent, named reference/excluded artists,
genre, mood, era, discovery preference, explicit familiar-song allocation and excluded
version labels. These fields cannot change the chosen source, playback mode or device.
Both applications consume the same generated policy and schema. Mobile ChatGPT also
requires the updated paired Windows helper; publishing the Site cannot update another
person's desktop installation.

## Live model comparison

The committed `evals/baseline-luna-brief-2026-10-18.json` and
`evals/structured-luna-brief-2026-10-18.json` each contain 27 successful Luna runs:
the 24 shared music requests and three repeated cases. These are model proposals,
without Spotify catalogue lookups or playback writes.

| Measurement | Previous response | Structured response |
| --- | ---: | ---: |
| Runs | 27 | 27 |
| Mechanical violations after curation | 0 | 0 |
| Median generation time | 7,769 ms | 8,368 ms |
| Maximum generation time | 20,330 ms | 21,214 ms |

The checks cover requested counts, familiar-artist caps, opening artist, explicit
allocations, artist-only restrictions and named exclusions where the dataset defines
them. The baseline already passed these checks. This comparison does **not** establish
better musical taste, track availability, genre accuracy or improved resolution rates.
There was no connected Claude API key, so Claude's live quality and latency remain
untested. Its schema and transport were checked with isolated provider responses.
Conditional refill is covered by deterministic integration tests, not these live runs.

To reproduce scoring without inference or Spotify access:

```sh
cd extension
npm run eval:selection -- ../evals/baseline-luna-brief-2026-10-18.json
npm run eval:selection -- ../evals/structured-luna-brief-2026-10-18.json
```

For a fresh live comparison on Windows, close the installed Queue Companion helper
first to avoid competing OAuth refreshes. Run each stage separately from the repository
root, using the existing encrypted local provider connections:

```sh
dotnet run --project evals/runner/QueueCompanion.Evals.csproj -c Release -- --cases evals/music-selection.json --output baseline.json --stage baseline
dotnet run --project evals/runner/QueueCompanion.Evals.csproj -c Release -- --cases evals/music-selection.json --output structured.json --stage structured
```

Restart the helper afterwards. This uses available plan usage/API credits; disconnected
providers are skipped. Reports contain prompts and model proposals, never credentials.
Review prompts before sharing reports. This runner makes no Spotify requests.

## Automated coverage

- Extension: 86 tests passed, including one refill, keeping accepted songs, empty
  Spotify metadata in refill input, bounded proposals, and no queue write after a
  changed brief, invalid ID or cancellation. Type check and production bundle passed.
- Windows helper: 52 tests passed, including native Responses/Claude schemas, bounded
  brief parsing, original target preservation and legacy request compatibility.
- Mobile: 62 tests passed, including actual selection routes and encrypted D1 bridge
  results, one-time claims, invalid-brief completion, fixed model and explicit artist
  allocations. Type check and production build passed.

A refill runs at most once, only for unrestricted discovery that is short after
reserves and still within the 60-second eligibility window. It keeps the original
brief and target and receives only user text and prior model output. The provider
call has a 20-second timeout; the PC refill mailbox expires after 25 seconds. No
constraints are relaxed to fill slots. Restricted sources and playlist blends use
their existing bounded selection paths. Queue writes still occur only after validated
selection; ambiguous playback writes are never automatically replayed.

Artist matching uses Spotify credits; version exclusions use explicit title labels.
These checks cannot establish an unlabeled cover's identity or verify musical mood,
era, energy and genre. Human listening review and broader live catalogue benchmarks
are the next quality gates. The updated installed Windows helper passed the deployed
Site's fixed one-song bridge diagnostic on 2026-10-19, exercising real ChatGPT
inference and brief validation. This update did not perform live Spotify playback writes.
