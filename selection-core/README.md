# Shared music-selection core

Edit this directory to change music-selection policy for both desktop and mobile.
It is a library and build input, not another server or a new app window.

| Source | Owns |
| --- | --- |
| `prompts/curation.txt` | Shared musical interpretation, discovery, variety and hidden-gem guidance for every provider |
| `prompts/helper.txt` | Desktop/PC helper's bounded candidate and suggestion response contract |
| `prompts/mobile.txt` | Mobile Claude's title/artist response contract and Spotify-data boundary |
| `curation.ts` | Request interpretation, artist caps, ordering and fast-model selection |
| `policy.json` | Policy version, artist-share defaults, model families and supported effort settings |
| `brief.schema.json`, `prompts/brief.txt` | Bounded musical interpretation returned alongside song proposals, including explicit artist allocations and exclusions |

Normal changes are made here once. The application adapters keep their own OAuth,
API keys, HTTP/SSE handling, Spotify retrieval and playback. Desktop ChatGPT and
Claude share the C# helper. Mobile ChatGPT uses that same helper through the paired
PC; mobile Claude retains an independent Worker adapter. This refactor does not
send additional Spotify data to either provider.

## Update both applications

1. Edit the relevant shared source and bump `policy.json`'s version when behavior
   changes. Prompt placeholders use the same numeric defaults as the code.
2. From the repository root, run:

   ```sh
   node scripts/sync-selection-core.mjs
   ```

   For an already-open separate Sites checkout, also export to that directory:

   ```sh
   node scripts/sync-selection-core.mjs --mobile-checkout=/absolute/path/to/site-checkout
   ```

3. Run desktop and mobile tests/builds. The Windows build synchronizes before
   testing. Extension builds generate outputs; extension tests and macOS packaging
   reject stale outputs. Standalone mobile tests/builds validate the exported lock.
4. Rebuild/distribute the desktop installer and publish the mobile app through the
   existing Sites workflow. Commit the generated outputs with their source change.

Generated outputs are `extension/src/curation.ts`, `mobile/lib/queue/curation.ts`,
`mobile/selection-core.lock.json`, and `helper/SelectionPolicy.g.cs`. Do not edit
them directly. Every output carries the same policy version and source fingerprint.
The standalone mobile export also hashes its generated module, so a manual edit
cannot quietly pass a build. To verify repository parity without changing files:

```sh
node scripts/sync-selection-core.mjs --check
```

`tests/selection-core.test.ts` proves that one prompt edit reaches both applications
and the helper, regeneration is repeatable, and stale/manual edits are detected.
Existing curation, pipeline and provider tests verify the resulting behavior.
The music benchmark in `evals/` remains shared.

## Structured interpretation and bounded refill

Policy 1.1.0 asks for a compact musical brief and songs in the same inference.
Hosts validate that named artists came from the user's request, preserve explicit
allocations, and use the brief for familiar-artist limits, ordering and exclusions.
Known supported provider models receive a native JSON schema; all responses are
validated before selection. Genre, mood and era guide the model; they are not
independently verified audio attributes. Version filtering uses title labels.

Normal requests still use one inference with reserves. Unrestricted discovery may
make one targeted refill if the resolved selection remains short and selection
has taken less than 60 seconds. The original target and brief stay pinned. Refill
input contains the user's request and earlier model proposals, without forwarding
Spotify results. The provider call is limited to 20 seconds (the PC mailbox expires
after 25 seconds). Accepted tracks stay in the pool; there is no third attempt or
silent relaxation of constraints. Restricted library requests and playlist blends
do not use this refill. Invalid, cancelled or failed responses cannot commit a queue.

See `docs/STRUCTURED-SELECTION-VERIFICATION.md` for measured results and limits.

## Source updates and installed-app updates

Policy 1.2.0 distinguishes collective identity from credited member artists using
referenceType and collectiveMembers. Bare source names, source-only requests and
similarity requests have separate behavior. Known collective membership entries
and their source URLs live in policy.json; other membership is model-supplied and
not independently verified. Artist exclusions still apply to Spotify credits.

One source change now feeds both products. Publishing the mobile Site does not
replace another person's installed desktop helper or Spotify extension. Those
receive a new policy when the rebuilt application is installed; Spotify reloads
the extension on restart. Mobile ChatGPT uses the policy in the running paired PC
helper, so update that helper as well when changing its prompts.

Immediate changes to every installed app would require a central inference service
or a verified update mechanism. That is a separate rollout feature. This shared
library preserves the current local desktop operation and personal PC bridge.
