# Artist similarity and fast selection

2026-10-18: “songs like X” means a varied selection inspired by X. The default
allows a familiar minority, up to about one fifth of the requested target from
named reference artists combined. Another artist opens the selection, familiar
songs are distributed, and consecutive artists are avoided where possible.
An artist-only request, a source restriction, or an explicit custom allocation
takes precedence. A one-song similarity request chooses another artist.

Both providers receive the same musical interpretation guidance. The desktop
helper and the mobile app use the offered Luna/Haiku family for Automatic,
without relying on catalogue order or Claude's optional `line` field. Explicit
model choices remain available. Known GPT-6 models use low reasoning effort;
Claude Haiku 5.5 uses its documented low effort setting. Unsupported parameters
are not added to older models. Normal selection still uses one inference call.

The mobile and desktop curation modules are identical. Artist caps are applied
before stopping at the target, so unused reserve proposals can supply other
artists. If the bounded proposals cannot fill a varied selection, return a
smaller honest result rather than padding with the reference band's catalogue.
There is no automatic second inference or model escalation in this change.
Matching now accepts clearly labeled remaster/mono/stereo suffixes while retaining
credited-artist checks and distinct live, acoustic and remix versions.

## Verification

- 79 desktop domain/pipeline tests and the extension production build passed.
- 49 helper/provider tests passed, including automatic model selection, bounded
  inference, authentication, source restrictions, cancellation and partial output.
- 55 mobile tests passed. New tests execute the actual selection route in
  Miniflare with D1 and stubbed providers/catalogue replies. A response starting
  with six reference-band songs uses its reserves to return ten varied songs,
  including two familiar songs, starting elsewhere, in one inference and no writes.
- Mobile typecheck, production build and 39 browser tests passed across three
  viewport sizes. Browser tests use fixtures, not real Spotify mutations.
- Four live ChatGPT calls used the account-offered `gpt-6-luna`, with the updated
  helper prompt and no Spotify reads or playback writes. Each returned fifteen
  proposals for a ten-song target. Timings: Pearl Jam similarity 10.380 s;
  Breaking Benjamin similarity 4.513 s; classic-rock hidden gems 5.451 s;
  Pearl Jam only 4.789 s. These are single samples, not a latency benchmark.
- Local processing of those proposal lists yields nine artists with one Pearl
  Jam song, eight artists with one Breaking Benjamin song, and ten artists for
  the classic-rock request. Similarity selections start elsewhere with no
  adjacent repeated artists. The artist-only request remains entirely Pearl Jam.
- No Claude API key is connected locally. Claude request shape, Haiku routing and
  response handling are verified with stubs; live Claude quality is unverified.

## Repeatable quality review

`evals/music-selection.json` contains 24 user-authored benchmark prompts with
mechanical checks and musical review criteria. `evals/live-luna-2026-10-18.json`
contains model-generated proposals only, with no Spotify library data or tokens.
To evaluate saved proposal results:

```sh
cd extension
npm run eval:selection -- ../evals/live-luna-2026-10-18.json
```

The evaluator reports count completion, artist variety, reference share,
adjacent artists and explicit artist exclusions/allocations. It simulates the
mobile five-proposal batches, without catalogue lookups. It never queues songs.
Only four benchmark prompts were run live; the remaining cases are a review set.

Human review remains necessary for musical fit, obscurity and recording accuracy.
The live hidden-gems list still includes recognizable hits, and a proposed
“So Cold” by Filter needs catalogue rejection or verification. These are useful
quality failures, not proof that the model or benchmark is perfect. Real Spotify
matching must reject an incorrect title/artist pairing; these proposal-only
results do not establish song availability or full count after matching.

Do not send Spotify API content, history or playlists to a model or automated AI
judge. Benchmark inputs are authored requests, and saved answers are model output.
Review taste with blinded human comparisons rather than treating structural
passing scores as proof of better music.

Provider references: [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Claude latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency),
[evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices).
