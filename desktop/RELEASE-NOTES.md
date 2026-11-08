# Whatloom 0.3.0

Connect your product handoff to GitHub, then build, test, and publish the generated source in one flow.

- Browser-based GitHub sign-in with connected account and organization selection.
- A suggested, editable repository name, private-by-default visibility, and explicit automatic publishing choice before the build starts.
- Stronger Codex/Claude handoffs require meaningful behavioral tests, actual results, run instructions, and a repeatable verification manifest.
- Whatloom independently reruns recorded checks before publication. Failed checks stop the push and keep the generated files local.
- A clean source commit in a new repository, remote commit verification, a final GitHub link, and recoverable publishing failures with a test-and-publish retry, including after reopening.
- Private brainstorming and handoff records, secrets/configuration, dependency folders, and generated output are excluded from the source export. Existing repositories are never overwritten.

Git and GitHub CLI are installed separately. GitHub authentication and organization policy determine repository permissions. Keep Whatloom open until the flow finishes. Publishing to GitHub does not deploy the product.

For **Apple Silicon Macs running macOS 13 or later**. Includes its Node.js 22 runtime and local server; no Node.js/npm installation is required. Move **Whatloom.app** into Applications. SHA-256 files accompany the ZIP and DMG.

Provider CLIs are optional and installed separately. AI conversation, research, and implementation send selected project context to that provider and follow its account limits and billing configuration. GitHub Pages supports the guided notebook and exports; provider sign-in and coding execution require the local app. Passing the recorded checks is not proof that every product requirement works. Only an explicitly selected GitHub publication sends the generated source to a repository; deployment remains separate.

**Signing:** Ad-hoc signed, without an Apple Developer ID, and **not notarized**. macOS may require the **Privacy & Security → Open Anyway** flow after you review the download. The app has not passed Apple's notarized distribution assessment.
