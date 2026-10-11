# Playlist-reference discovery — 0.2.5

The parser previously treated every quoted playlist name or playlist link as a hard source restriction. This prevented catalogue discovery even when the user explicitly asked for similar songs or to branch out.

The parser now assigns each playlist mention a source or reference role. Direct “from” requests and explicit “only” constraints stay restricted. “Like”, “similar”, “based on”, “inspired by” and “branch out” requests use the playlist as taste references. Mixed requests such as “like X, only from Y” preserve both roles. Names remain data: words inside playlist titles never become commands. Explicit references work on a fresh session, including “more music like X”. Ambiguous names still use the inline chooser; missing or empty references fail instead of silently discovering unrelated music.

Reference playlists use the existing discovery path shared by ChatGPT and Claude: up to 12 spread title/artist seeds, four parallel artist searches, at most 200 candidates, one inference and at most 25 reserves, then exact matching and availability checks. Up to six distinct playlists may be read, each bounded to its first 200 tracks. Every retrieved reference song is excluded by URI and song identity, including alternate remastered editions; exclusions are not limited to the seed or candidate sample. Follow-up discovery retains these exclusions and does not inherit the reference playlist as a source restriction. Songs outside the retrieved window cannot be guaranteed absent. Explicit repeats retain their existing behavior.

Source playlists are fetched once during retrieval and checked again immediately before a native write. Catalogue suggestions are still forbidden for restricted requests. The native queue reconciliation, cancellation and account boundaries are unchanged.

Automated validation: all 120 checks passed — 55 extension tests (including 11 new playlist intent/pipeline checks), 44 helper/installer tests and 21 browser UI checks across four viewports. TypeScript checking and bundling succeeded. Helper provider tests use isolated HTTP stubs.
