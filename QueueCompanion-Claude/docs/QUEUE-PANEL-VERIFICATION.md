# Queue Companion 0.2.1 — Queue panel and Search shortcut

Verified on October 10, 2026, on Windows 10 x64 with desktop Spotify Premium 1.3.4.258. This release updates the existing Claude API / ChatGPT edition.

## Result

- The 44px request bar, with 16px text, sits below the Queue / Recently played tabs, above Spotify's scroll area. It reserves 56px including bottom spacing; the song list shrinks to fit rather than being covered.
- A 32px button with a 20px queue icon sits inside Spotify's Search, immediately before Browse. Search text, its clear button, its placeholder and keyboard hint reserve extra space. Browse remains accessible. The button has a label, tooltip, visible keyboard focus and open-state indication.
- Clicking the shortcut opens Queue and focuses the request input. Repeated clicks keep it open. When Recently played is selected, the shortcut selects Queue. Draft text and ongoing feedback survive panel closing and navigation. Closing the panel clears masked API-key input and closes settings.
- Settings retain their existing controls, colors and font size. They expand below the request bar and scroll within the Queue panel, leaving space for native queue content at the tested small sizes.
- Disposing the extension removes its composer, shortcut and style and restores the native search padding and alignment it changed.

## Verification

The full build passed 18 TypeScript selection/queue tests, 28 isolated helper/provider tests, and 21 browser UI checks. The browser checks load the production extension bundle in a local fixture based on the inspected Spotify layout. They cover real Enter and Space activation, native Search event isolation, Browse, clear-button spacing, repeated activation, a retained hidden panel, Recently played, draft retention, masked-key clearing, Search and Queue remounts, settings sizing, and disposal. Four viewports were checked: 1355×791, 1024×740, 780×620, and 600×440, with panel widths from 420px to 240px. No browser errors occurred. Screenshots of the fixture were inspected; these are fixture screenshots, not captures of the live Spotify window.

Fifteen additional checks ran inside the actual Spotify extension with temporary test instrumentation, using the existing paired helper connection to save only bounded layout metadata and pass/fail results. These passed for opening/focusing Queue, the 44px/16px bar, shortcut alignment before Browse, space above the native scroll area, repeated activation, closing/reopening with a draft, Recently played, settings, Escape, and unchanged playback/manual queue identities during the checks. No inference or song-write requests were made. The active provider remained ChatGPT and its connected state was true during the live checks.

The live check exposed two differences from the fixture: Spotify retains panel DOM after closing it, and its outer reset overrides some shadow-host sizing rules. The implementation now checks the native Queue button's open state and sizes only its own host with inline styles. These fixes passed both live checks and the updated retained-panel fixture.

The production 0.2.1 installer was applied successfully to the existing local installation. The installed and Spotify-staged extension hashes match the production bundle. Temporary test instrumentation is absent from the shipped bundle and installer.

Evidence: `queue-panel-build-verification.txt`, `queue-panel-browser-proof.json`, `queue-panel-live-proof.json`, `queue-panel-install-proof.json`, and `queue-panel-installed-files-proof.json`.

## Scope and limits

The selected provider, inference, library retrieval, history and queue-writing code retain the earlier edition's behavior. No new live Claude API claim is made; an actual Anthropic key was not available. A second Windows account/machine, Free Spotify and Microsoft Store Spotify remain unverified. Spotify updates can change these UI anchors and may require Repair or an adapter update.

To repeat the browser checks, build the extension, then run `npm run test:ui` from `extension` with Microsoft Edge installed. The normal Windows build runs these checks as well. `QC_BROWSER_CHANNEL` can select another installed Playwright channel. Optional `QC_UI_REPORT` and `QC_UI_SCREENSHOT` set a report filename and an existing screenshot directory.
