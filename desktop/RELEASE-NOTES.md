# Whatloom 0.1.0

The first native Whatloom app for **Apple Silicon Macs running macOS 13 or later**.

- Includes a local production server and its own Node.js 22 runtime; no Node.js/npm installation is required to use the app.
- Keeps explorations in a persistent local desktop web store, with portable JSON import/export, Markdown briefs, and PNG future cards.
- Connects to separately installed official Codex or Claude Code CLIs using their own sign-in. AI generation and research send the selected context to the chosen provider and remain subject to account access and limits.
- Opens research links in the default browser and serves the studio only on `127.0.0.1:4310`.

Download the arm64 DMG or ZIP and move **Whatloom.app** to Applications. Checksums are supplied with the release.

**Signing:** This prototype is ad-hoc signed, without an Apple Developer ID, and is **not notarized**. macOS may require the **Privacy & Security → Open Anyway** flow after you review the download. It has not passed Apple's notarized distribution assessment.

Codex CLI generation and native research have been tested. Claude Code installation detection and mocked adapters are tested; its live model workflow has not yet been verified. AI findings require review.
