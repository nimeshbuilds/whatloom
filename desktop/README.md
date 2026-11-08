# Native macOS app

`Whatloom.swift` is a native AppKit/WKWebView desktop shell. A packaged app includes its own Node.js runtime and the Next.js standalone production server. End users do not need Node.js or npm. Codex and Claude Code remain optional, separately installed official tools; they are never embedded with credentials.

The app supports Apple Silicon Macs on macOS 13 or later. It opens a persistent WKWebView store, provides native import/save dialogs, supports blob exports through WKDownloadDelegate, opens external source links in the default browser, and uses a local server at `127.0.0.1:4310`. It reuses a healthy existing Whatloom server; quitting stops only a server launched by that app instance. Work saved in a regular browser profile is separate from the desktop app's store; use the portable JSON export/import to move it.

## Build

On a Mac with Xcode command line tools and Node.js 22.13+:

```sh
node scripts/build-mac.mjs
```

The build runs Next.js, compiles Swift for macOS 13+, bundles the standalone server and public/static assets, downloads the current official Node 22 runtime for the build machine's architecture, verifies its SHA256 against that release's official checksum list, includes its full matching LICENSE, and signs the app ad hoc. To pin the runtime for a reproducible release, set `WHATLOOM_NODE_VERSION` to an exact `v22.x.y` release. `--skip-web-build` packages an already completed `.next/standalone` build. Runtime downloads are cached under `outputs/runtime`.

The output includes `outputs/Whatloom.app`, versioned ZIP/DMG archives and SHA256 checksums. The app contains a build manifest with the exact runtime version, checksum and web build ID, and third-party notices derived from bundled packages. Dependency license/readme/notice files are preserved where supplied by the installed packages.

```sh
node scripts/test-mac-bundle.mjs
```

This checks the packaged runtime, bundle metadata and signature, then starts only the bundled server on an unused loopback port to check the app, static assets, health endpoint and CLI discovery. It does not call a model. Native UI checks are performed separately on the built app.

## Distribution

The app is **ad-hoc signed and not notarized**. It is not signed with an Apple Developer ID. macOS may block a downloaded copy; after reviewing the source and download, use Apple's **System Settings → Privacy & Security → Open Anyway** flow if offered. A future public release should use Developer ID signing and notarization. Do not describe these artifacts as notarized or as having passed Gatekeeper distribution assessment.

No developer home directories, caches, global CLI installations, credentials, or environment files are copied into the bundle. The runtime is downloaded separately from nodejs.org, and only traced production files plus public assets and license material are packaged.
