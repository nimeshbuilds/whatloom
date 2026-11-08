# Native macOS app

`Whatloom.swift` is a native AppKit/WKWebView shell. The app bundles its Node.js runtime and Next.js standalone production server, so end users do not need Node.js or npm. Official Codex and Claude Code CLIs remain optional, separately installed tools; no provider credentials are bundled.

Whatloom 0.3 opens the founder studio: a conversation beside editable opportunity, research, product, and brand documents. The creator applies AI drafts, chooses an idea and name, reviews the full direction, and approves the current revision before handing it to a local builder. The earlier workbench and ten guided scenarios remain available.

## Connect and build

Open the in-app **Connect AI / Settings** panel to select a provider. **Connect** starts its official browser sign-in; finish the provider's page and return to Whatloom. The panel polls connection status and lets you cancel a pending attempt. Credentials remain in the provider's own CLI storage. No login command or pasted token is required in Whatloom.

The panel reads Codex models from the installed app-server catalog. Claude choices are documented account-default/Sonnet/Opus/Haiku aliases. Neither listing proves that an account can run a model. The selected model is passed to partner conversations and builds; the earlier workbench uses the provider's default. Provider permissions, billing configuration, and usage limits still apply.

An explicit build action creates a new folder under `Documents/Whatloom Builds`. It includes `WHATLOOM-BUILD.md`, `PRODUCT-BRIEF.md`, the reviewed project snapshot, and SVG/CSS/JSON brand assets. The official coding CLI runs there with its own supported permissions and without bypass flags. Build status/output is visible in the app, with a stop control. The builder writes TESTING.md and a machine-readable check manifest. Whatloom independently reruns the checks before marking verification passed. When the creator enables GitHub publishing, it creates a clean source commit and pushes it to the selected new repository after verification. A passing check set needs review against the intended journeys and does not deploy the product.

## GitHub

Git and the official GitHub CLI are optional, separately installed dependencies for publishing. The Build handoff guides browser/device sign-in, connected-account selection, organization selection, a new repository name, and private/public visibility. Auto-publishing is explicitly enabled for each saved project; the selected destination is fixed for a started build. The app does not expose tokens to its web UI. Keep the app open through implementation, testing, and publishing. A retry, including after reopening the app, reruns tests and resumes the recorded repository without force-pushing. Interrupted coding-agent runs must be started again; they do not silently resume.

## Native behavior

The app supports **Apple Silicon Macs on macOS 13 or later**. Its persistent WKWebView store keeps work locally, native dialogs handle import/save, WKDownloadDelegate supports blob exports, and external links open in the default browser. The local server uses `127.0.0.1:4310`.

The app reuses a healthy existing Whatloom server. Quitting stops only a server that this app instance launched and that server's owned provider processes. Build folders remain on disk. Active job state is held in server memory and is not resumed after restart.

A regular browser profile and the desktop app have separate storage. Export/import a founder JSON backup to move work; imported copies require a new review. Earlier workbench backups remain available through that workbench's own importer. GitHub Pages provides the guided notebook and exports, while provider connection and coding execution require the local app or source server.

## Build

On a Mac with Xcode Command Line Tools and Node.js 22.13+:

```sh
node scripts/build-mac.mjs
```

The build runs Next.js, compiles Swift for macOS 13+, bundles the standalone server and assets, downloads the official Node 22 runtime for the build machine's architecture, verifies its SHA-256 against the release checksum list, includes its full matching license, and signs the app ad hoc. Pin `WHATLOOM_NODE_VERSION` to an exact `v22.x.y` release for reproducibility. `--skip-web-build` packages an already completed `.next/standalone` build. Runtime downloads are cached under `outputs/runtime`.

Output includes `outputs/Whatloom.app`, versioned ZIP/DMG archives, and SHA-256 files. The bundle manifest records the runtime version, checksum, and web build ID. Third-party notices and supplied dependency license/readme/notice files are preserved.

```sh
node scripts/test-mac-bundle.mjs
```

This checks bundle metadata, signature, and runtime, then starts the bundled server on an unused loopback port to check the app, static assets, health, and CLI discovery. It does not sign in, call a model, or build a generated product. Native UI and complete founder/build workflows require separate validation.

## Distribution

The app is **ad-hoc signed, without an Apple Developer ID, and not notarized**. macOS may block a downloaded preview. After reviewing the source and download, use Apple's **System Settings → Privacy & Security → Open Anyway** flow if offered. These artifacts must not be described as notarized or as passing Apple's Gatekeeper distribution assessment.

No developer home directories, caches, global CLI installations, credentials, or environment files are copied into the bundle. The runtime comes separately from nodejs.org; packaged content is limited to traced production files, public assets, and license material.
