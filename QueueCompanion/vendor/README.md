# Bundled upstream components

Queue Companion's own source is MIT licensed. Upstream components retain their original notices and licenses. This directory is included in the installer and the source distribution; no Spotify font, Spotify app archive, daemon credential or user connection data is redistributed.

Spicetify CLI/daemon 3.0.0-rc.3 is unmodified, with LGPL-2.1 text in `SPICETIFY-LICENSE` and corresponding source in `source/spicetify-v3.0.0-rc.3.zip`, commit `3cde524eb792da382697a216c68981a6b1f82e77`. Official Windows x64 release archive SHA-256: `aa49b8480a7860280bcdf0989f55347f8c8cf23249ded7aa10efa9a85de97bf2`.

The official Spicetify v3 modules use GPL-3.0-or-later; see `MODULES-COPYING` and the unchanged copyright/SPDX notices in the source. Exact upstream source snapshots, including module code, build scripts, dependency lockfiles and interface declarations, are provided beside the binaries:

| Module | Version | Source commit |
| --- | --- | --- |
| manager | 1.5.1 | 65648be0956078693963905573fee2d7375cff24 |
| stdlib | 1.13.2 | 5a02dd9f0e06614da23d2c36c617a8fda1cc67de |
| store | 1.8.1 | b383a8e17c2bd6f4aab34be6ecd29dcc89b6c2ad |
| spicetify-splash | 0.1.1 | 45444fd023253133fd77a5fda9fb78a324a027cf |

The snapshots omit unrelated gallery preview images; source and module resources remain unchanged. To rebuild upstream modules, extract the matching snapshot, use its Node 24/pnpm requirements, install from its lockfile, and run the documented stitch command for that module using the bundled classmaps. To replace a module, place your build in the module/store directories and reapply Spicetify. Queue Companion does not restrict modified builds or require a signature.

`runtime/modules/vault.json` records the exact official module release archive checksums. `SHA256SUMS.json` records all bundled files. Classmaps are the public Spicetify 1030003 fallback actually used for the tested Spotify 1.3.4.258 client.

The .NET 10.0.8 runtime is bundled in the helper/installer. Microsoft runtime licenses and third-party notices are in `dotnet`. The embedded stdlib query-core 5.103.0 dependency has its MIT notice and original package/source archive included. Additional dependency notices and lockfiles are retained in the corresponding upstream archives.

Sources: [Spicetify](https://github.com/spicetify/cli/tree/v3.0.0-rc.3), [v3 modules](https://github.com/spicetify/modules), [query-core registry package](https://www.npmjs.com/package/@tanstack/query-core/v/5.103.0).
