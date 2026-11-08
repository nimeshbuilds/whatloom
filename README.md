# Whatloom

![Whatloom — Make room for what could be](public/brand/social-card.png)

**[Try the browser studio](https://nimeshbuilds.github.io/whatloom/)** · **[Download the Mac app](https://github.com/nimeshbuilds/whatloom/releases/latest)**

A local founder workspace for finding an idea, understanding the alternatives, shaping a product and brand, and handing an approved direction to your AI builder.

Whatloom 0.3 pairs a conversation with editable documents. It is a working prototype: ideas and AI findings need judgment and real-world testing; the app cannot predict commercial success.

## From a curiosity to a first version

1. **Discover.** Start with your interests, a frustration, an existing idea, or a product you want to improve. Explore different directions and choose the one you want to pursue.
2. **Research.** Compare competitors, substitutes, and existing workarounds. Keep primary source links and the questions they leave unanswered.
3. **Define the product.** Write what the product does, who it serves, why it matters, its user journeys, success criteria, and first-version boundaries. The builder chooses the technical implementation later.
4. **Name and brand.** Compare names and choose a direction, tagline, palette, typography, and logo concept. Export editable SVG starting assets and CSS/JSON brand tokens. The SVG kit uses a local monogram/wordmark template; it is a starting point for design, not a trademark or name-availability check.
5. **Review.** Inspect the complete brief, research, brand, and open questions. AI document suggestions remain drafts until you apply them. Explicitly approve the current revision; material edits require another review.
6. **Build, test, and optionally publish.** Choose Codex or Claude and its model. Optionally connect GitHub, choose your account or organization, confirm a new repository name and visibility, and enable automatic publishing. Whatloom creates a fresh folder under `Documents/Whatloom Builds`. The coding agent implements and tests the product; Whatloom independently reruns the recorded checks, then commits and pushes the generated source when GitHub publishing was selected. Follow each phase and its results in the app.

You can use the guided notebook without an AI account. It records your conversation and offers stage prompts; it does not simulate AI answers or current market research. Edit the documents yourself, export a backup, or connect an AI partner when ready.

The earlier possibility-map workbench remains available at **Earlier workbench**. Its [ten guided scenarios](https://nimeshbuilds.github.io/whatloom/#scenarios) cover mechanisms, assumptions, evidence, experiments, and sharing. Each scenario opens an editable practice copy with a resumable checklist. Practice content is illustrative; completing a checklist does not validate an idea or record a real experiment.

## Mac app

Download the Apple Silicon ZIP or DMG from [Releases](https://github.com/nimeshbuilds/whatloom/releases/latest). Move **Whatloom.app** into Applications, then open it. The app includes its Node.js runtime and local server; you do not need Node.js or npm to use it.

The native app targets **Apple Silicon Macs running macOS 13 or newer**. It is ad-hoc signed and **not notarized with an Apple Developer ID**. macOS may interrupt opening a downloaded preview build. No signing identity is bundled or assumed. Intel Macs can use the source launcher below.

Codex and Claude Code are optional, separately installed official CLIs. They are not bundled with Whatloom. The notebook, document editing, brand exports, and backups work without them. The native app's saved work is separate from an ordinary browser profile; use JSON export/import to move a project between them.

## Connect your AI account in the app

Open **Connect AI / Settings**, choose Codex or Claude, and select **Connect**. Whatloom starts that provider's official browser sign-in. Complete the provider's page and return to the app; its connection status updates automatically. A pending sign-in can be cancelled or restarted if it expires. You do not need to enter a login command or paste an OAuth token into Whatloom.

Whatloom discovers official CLIs on PATH and in common installation directories. If a provider is missing, install it from [OpenAI's Codex documentation](https://learn.chatgpt.com/docs/cli) or [Claude Code's setup documentation](https://code.claude.com/docs/en/setup), then refresh the connection. Whatloom does not automatically install a provider or change your existing login on page load.

After connection, choose a model in Settings or use the provider CLI's default. Codex tasks retain your sign-in and run without loading personal Codex configuration, so the default follows the installed CLI rather than a model override in your settings. Explicit model selections are passed unchanged; Whatloom does not silently switch models when access fails. Codex models come from your installed app-server's live catalog. Claude choices are documented aliases: account default, Sonnet, Opus, and Haiku. A catalog or alias is not proof of account entitlement; the provider checks access when a task runs. Your selection follows partner conversations and build handoffs. The earlier workbench uses the provider's default.

Credentials stay with the official CLI. Whatloom reads the CLI's connection status, exposes only allowlisted provider authorization URLs during sign-in, and never copies its token cache. Eligible subscription usage remains subject to provider access, terms, and limits. A CLI configured for API billing may bill usage that way; a chat subscription does not become unlimited API access.

See the official [Codex authentication](https://learn.chatgpt.com/docs/auth), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude Code CLI](https://code.claude.com/docs/en/cli-reference), and [Claude model configuration](https://code.claude.com/docs/en/model-config) documentation.

## Connect GitHub and publish the tested product

In the **Build** handoff, open the GitHub panel. Whatloom uses the official [GitHub CLI](https://cli.github.com/) credential store; Git and GitHub CLI must be installed locally. Connect through the browser using the displayed one-time code. The requested repository, organization-read, and workflow permissions support creating the repository and pushing generated workflow files. Credentials are never sent to the UI or saved in project backups.

Select a connected account and one of its organization or personal destinations. Review the suggested repository name, choose **Private** (the default) or **Public**, and enable **Automatically commit and push after checks pass** before starting. The destination is captured for that build. Existing repositories are rejected; Whatloom never force-pushes or replaces existing work. Organization policies and your permissions can still prevent creation.

The coding agent must provide `TESTING.md` and `.whatloom/verification.json` with reproducible checks covering real user behavior. Whatloom runs these bounded local commands itself. At least one test or smoke check is required; a successful model exit or a build command alone is insufficient. Failed or missing checks stop publication. Passing checks demonstrate the recorded coverage, not exhaustive correctness or validated customer demand.

After checks pass, Whatloom creates a clean source commit and the selected repository, pushes `main`, verifies the remote commit, and returns its GitHub link. The export respects the generated app’s `.gitignore` and excludes private planning/handoff documents, `.whatloom` records, credentials/configuration, dependencies, and generated output. It screens the source for common credential patterns and rejects unsafe links or oversized exports; this is not a guarantee that all sensitive content can be detected. Review the generated source before choosing public visibility.

A failed push keeps the local implementation and source commit. **Retry tests & publish** reruns checks and resumes only the repository recorded for that build. Keep Whatloom open until completion. After reopening, an interrupted or failed publication can retry its saved destination and rerun checks; the coding agent does not restart automatically. GitHub publication does not deploy or host the generated product.

## Browser studio on GitHub Pages

[The hosted studio](https://nimeshbuilds.github.io/whatloom/) supports the guided founder notebook, editable documents, manual source records, name/brand choices, local SVG/token exports, project backups, and the earlier workbench with its ten walkthroughs. It saves in that browser profile.

GitHub Pages does not run a local AI server. Provider/GitHub sign-in, model discovery, AI conversation/research, coding-agent execution, verification, and GitHub publishing require the Mac app or a local source instance. The hosted studio offers the Mac download instead of sending prompts to an unavailable API. Export a founder project backup and import it in the local app to continue; the imported copy must be reviewed before building.

## Research and building: what a result means

AI ideas and proposed differentiators are hypotheses. Research is a bounded first pass, not a novelty, demand, or market-size determination. Vendor statements remain vendor claims. Review sources and their relevance yourself.

AI research uses the chosen CLI's native web tools. Retained citations must match an exact public URL recorded in a completed native page operation. Founder research also connects each competitor to its returned sources. This verifies the observed tool event, not the accuracy of a page, the success of every retrieval, or the model's interpretation. If usable page events are unavailable, the app reports the limitation instead of inventing evidence. You can record primary sources you reviewed manually; those are distinguished from agent-linked sources.

The build control requires a complete review and approval of the current revision. It starts implementation in a fresh local folder, preserving the handoff files and brand assets. The builder may stop if account limits or CLI permissions prevent a required action. An implementation then enters independent verification; selected GitHub publication follows only when checks pass. Review the files, recorded test coverage, run instructions, and unresolved requirements before relying on the result.

Earlier workbench live checks passed with Codex CLI 0.154.0 for structured generation and native research, including a primary URL matched to its native event. Both installed providers' read-only connection checks and the Codex model catalog have also been checked locally. Authentication lifecycle, model selection, and handoff tests use fixtures; they do not change a user's login or claim that a complete generated product has been validated. Claude live generation and research have not been exercised in that validation.

## Data and execution

Projects, conversations, editable documents, drafts, model preferences, and saved build summaries are stored in **localStorage**, without a cloud database or account sync. Tabs on the same origin receive saved project changes; simultaneous edits can conflict, so use one active editing tab. Clearing browser storage, switching profiles, or changing the origin/port can make work unavailable. Export projects you want to keep.

Build folders are ordinary local files and remain after the app closes. Active login/build processes and their status live in the local server's memory; restarting the server does not restore an active job. Quitting stops processes owned by that server. An app reusing another healthy Whatloom instance does not stop that other instance when its own window closes.

The server listens on **127.0.0.1**. Mutations require same-origin JSON requests. Partner conversations and workbench generation/research run one agent task at a time in a fresh temporary directory with bounded input, runtime, and output. Structured drafts are validated before being offered to the creator. Shell, file, connector, and delegation tools are disabled for those thinking sessions; research enables native web search/page fetch. Build execution uses a separate approved workspace and the coding CLI's permissions, without bypass flags. Independent verification runs generated test code as the local user with a reduced environment and bounded processes; it is not an operating-system sandbox. Publication pins the chosen GitHub account and builds a separate source snapshot without generated Git hooks or user Git configuration.

**Local storage does not mean local inference.** Starting an AI conversation sends the project's context, relevant documents, research, and recent conversation to the selected provider through its CLI. Workbench generation/research sends its submitted brief or assumptions. A build sends the approved handoff and allows the agent to read files in its build workspace. Research queries and page requests go through the provider's native web tools. Provider privacy and retention policies apply. The CLI can maintain its own authentication, state, and diagnostic logs. Enabling GitHub publication sends the screened generated source, assets, README, and test report to the selected repository with its selected visibility. Private brainstorming records remain local.

## Run from source on a Mac

Double-click **Start Whatloom.command**. The launcher finds Node.js, installs this project's dependencies if needed, starts **http://127.0.0.1:4310**, and opens your browser. Keep its window open; press **Control-C** there to stop the source server.

Requirements: Node.js **22.13 or newer**, npm, and a modern browser. You can also run:

```sh
node scripts/launch-local.mjs
```

The launcher reuses an already running Whatloom instance and leaves another app on port 4310 alone. It uses a production build when present, otherwise the development server.

## Development

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Additional builds:

```sh
npm run build:pages       # static hosted studio → outputs/pages
npm run build:mac         # native Apple Silicon .app, ZIP, DMG and checksums
```

The Pages build stages a separate copy and omits server routes. Set `WHATLOOM_BASE_PATH` and `NEXT_PUBLIC_REPOSITORY_URL` for another repository. The Mac build needs macOS and Xcode Command Line Tools; it verifies the official Node 22 runtime download and includes its matching license and dependency notices. See [desktop build details](desktop/README.md).

Pushing `main` publishes the hosted studio. A matching `v*` version tag runs the Apple Silicon release workflow. Release archives include SHA-256 checksums; build products and signing material are excluded from Git.

Tests use fixtures and small local Node processes, without model calls or provider usage. The local APIs require Node.js and are excluded from GitHub Pages:

- `GET /api/agents`: installed CLI names, versions, and availability.
- `GET /api/agents/auth?provider=codex|claude`: sanitized connection and pending-login status.
- `POST /api/agents/auth`: explicitly start or cancel a provider browser sign-in.
- `GET /api/agents/models?provider=codex|claude`: live Codex catalog or documented Claude aliases.
- `POST /api/partner`: stage-aware conversation and proposed document drafts.
- `GET /api/github`, `POST /api/github`: inspect accounts/destinations, start or cancel browser sign-in, or explicitly switch accounts.
- `POST /api/build`, `GET /api/build?id=…`, `DELETE /api/build?id=…`: start, follow, or stop an approved build/test/publish flow; `POST {action:"retry-publish",id}` retries verification and publication for its recorded destination.
- `POST /api/explore`, `POST /api/research`: earlier workbench generation and native research.
- `GET /api/health`: local launcher health check.
