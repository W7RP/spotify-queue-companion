# Queue Companion storage

Private backup of the saved Queue Companion application distributions.

- **QueueCompanion-Claude/** — current version 0.2.2, with ChatGPT and Claude API, the Queue-panel UI, and the minimal bundled Spicetify runtime. Start here for the current application.
- **QueueCompanion/** — original version 0.1.1, preserved with its original interface and ChatGPT support.

Both directories include source, build instructions, tests, verification records, bundled dependency notices, checksums and corresponding upstream source. Their own READMEs explain installation and rebuilding on Windows.

The installers, installer ZIPs, exact source ZIPs and accompanying checksum/readme files are saved as assets of the [private storage release](https://github.com/W7RP/queue-companion/releases/tag/storage-2026-10-11). Installers exceed GitHub's Git file-size limit, so they are stored in the release instead of Git history.

Installed credentials, API keys, pairing data and local development dependencies are excluded. The included vendor dependencies are the public components needed to rebuild and distribute the application.

Application code uses the MIT license. Bundled upstream components retain their own licenses and notices under each application's `vendor` directory.
