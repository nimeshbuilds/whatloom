# Whatloom

![Whatloom — Make room for what could be](public/brand/social-card.png)

**[Try the browser studio](https://nimeshbuilds.github.io/whatloom/)** · **[Download the Mac app](https://github.com/nimeshbuilds/whatloom/releases/latest)**

A local invention studio for turning a future worth creating into different mechanisms, explicit assumptions, an emerging ecosystem, and a first practical proof.

This is a working prototype. It helps organize invention and research; it cannot predict the size or success of an industry.

## Mac app

Download the Apple Silicon ZIP or DMG from [Releases](https://github.com/nimeshbuilds/whatloom/releases/latest). Move **Whatloom.app** into Applications, then open it. The app includes its Node.js runtime and local server; users do not need to install Node.js or npm. The native window hosts the full local studio, including the installed-agent connection.

This first release targets **Apple Silicon Macs running macOS 13 or newer**. It is ad-hoc signed and **not notarized with an Apple Developer ID**. macOS may interrupt opening a downloaded preview build. No Developer ID signing identity is bundled or assumed. Intel Macs can use the source launcher below.

Your official Codex or Claude Code CLI still needs to be installed and signed in separately for AI features. The guided studio, local editing, and exports work without an AI connection. Native-app storage is separate from your ordinary browser storage; use a portable JSON backup to move an exploration between them.

## Browser studio on GitHub Pages

[The hosted studio](https://nimeshbuilds.github.io/whatloom/) supports guided explorations, examples, assumptions, evidence entry, experiment records, PNG cards, and backup import/export. It saves to that browser profile. GitHub Pages does not run the local AI server: the hosted interface offers the Mac download for Codex/Claude features and does not transmit prompts to a nonexistent API.

Start with **[Guided scenarios](https://nimeshbuilds.github.io/whatloom/#scenarios)** to try ten different uses of the studio. Each opens its own editable practice exploration, with instructions, an expected outcome for each step, and a checklist you can resume on this browser. Practice materials are illustrative; completing a checklist does not validate an idea or record a real experiment. All ten work without an AI account.

## Run from source on a Mac

Double-click **Start Whatloom.command**. The launcher finds Node.js, installs this project's dependencies if needed, starts the app at **http://127.0.0.1:4310**, and opens your browser. Keep its Terminal window open while using Whatloom; press **Control-C** there to stop it.

Requirements: Node.js **22.13 or newer**, npm, and a modern browser. If macOS does not open the command file, open Terminal in this folder and run:

```sh
node scripts/launch-local.mjs
```

The launcher reuses an already running Whatloom instance. It will not stop another app occupying port 4310. If a production build is present it uses that build; otherwise it runs the development server.

## Use your existing AI account

The app discovers the **official Codex CLI** and **official Claude Code CLI** on your PATH and in common local installation directories. Install and sign in to the agent you want to use through its own official interface:

```sh
codex login
claude auth login
```

Install only the provider you intend to use. Detection checks installation and version; it does not inspect stored credentials or confirm plan eligibility. Choosing an installed agent and explicitly starting an exploration or research pass invokes that CLI. Whatloom never copies OAuth tokens or asks you to paste credentials into the app. It does not automatically install an AI CLI, sign you in, or run inference on page load.

The CLI uses its own authentication and account configuration. Eligible subscription usage remains subject to the provider's terms, access, and rate limits. If the CLI is configured for API billing, its usage may be billed that way. Whatloom does not turn an ordinary chat subscription into unlimited API access.

See [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), and [Claude Code programmatic use](https://code.claude.com/docs/en/headless).

## What works

- Explore an example or create your own project in the offline guided framework.
- Change a condition and create a separate exploration, keeping the original work intact. With an AI selected, new paths are developed under that condition; guided mode records it as a framework to work through.
- Generate three different mechanism paths through a local agent connection, with linked untested assumptions, potential ecosystem opportunities, and planned experiments.
- Research competitors, substitutes, and contradictory findings through the chosen CLI's native web tools when those tools are available on your account.
- Keep source links, assumptions, and experiment outcomes alongside the invention rather than losing them in a chat transcript.
- Save work in this browser and export a shareable PNG future card, a Markdown exploration brief, or a portable JSON backup. Import a backup to continue in another browser or on another device.
- Inspect the logo, app icon, social launch graphics, bundled fonts, and brand guide at `/brand/brand-board.html`.

AI-generated mechanisms are hypotheses. Research is a bounded first pass and needs human review. A vendor's statement is a vendor's claim, and a competitor's existence does not establish customer demand.

The research API returns at most six sources. It retains citations only when their exact URL matches a completed native page operation in the CLI's event stream and they link to one of the submitted assumptions. This includes Codex's URL operations, which some versions label as `other`. It checks that the agent invoked a native page operation for the cited URL; it does not independently verify the page's contents, a successful retrieval, or the interpretation. Sources and their relevance still need human review. If the CLI provides no verifiable page-URL events, research returns an explicit error instead of fabricated evidence. Add sources manually when native research is unavailable.

Live integration checks passed with **Codex CLI 0.154.0** for both structured exploration and native web research, including a returned primary source matched to its completed page-URL event. **Claude Code 2.1.283** installation detection and mocked structured/event parsing are verified; its live generation and research have not been exercised in this prototype's validation.

## Data and execution

Projects are stored in **localStorage in this browser**, without a cloud database or account sync. Changes are synchronized between tabs on the same origin; simultaneous edits can still conflict, so use one active editing tab. Clearing browser storage, using a different browser/profile, or changing the origin/port can make saved projects unavailable. Export work you want to keep.

The app server listens on **127.0.0.1**. Generation and research require a same-origin JSON request from the local page. One agent task runs at a time. Inputs, runtime, and captured output are capped. The app starts each CLI in a fresh temporary directory, supplies the brief through stdin, validates structured output, and removes the temporary schema afterward. It does not log prompts, provider responses, or credentials.

Exploration disables shell execution, web browsing, connector integrations, and agent delegation. Research enables native web search/page fetch while shell, file, connector, and delegation tools remain disabled. Claude uses explicit web-only tool selection; Codex uses read-only sandboxing plus disabled execution/integration features. User customization is excluded where supported; provider or administrator policies still apply. These CLI options require reasonably current installations and may need updating when providers change their CLIs.

**Local storage does not mean local inference.** When you start an agent, your vision, domain, context, constraints, or selected assumptions are sent to the chosen model provider through its CLI. Research sends search queries and requested URLs through that provider's native web tools. The provider's privacy and retention policies apply. Other project material is not automatically attached. The CLI may maintain its own authentication, application state, and diagnostic logs even though Whatloom requests ephemeral/non-persistent sessions.

## Development

```sh
npm install
npm run dev
npm run build
npm test
```

Additional builds:

```sh
npm run build:pages       # static hosted studio → outputs/pages
npm run build:mac         # native Apple Silicon .app, ZIP, DMG and checksums
```

The Pages build runs in an isolated staging directory and does not remove local API routes. Set `WHATLOOM_BASE_PATH` and `NEXT_PUBLIC_REPOSITORY_URL` when deploying under another repository.

The Mac build needs Xcode Command Line Tools and macOS. It downloads an official Node 22 runtime and checks its release SHA-256 before bundling it with the standalone server. The complete matching Node license and dependency notices are included. Build products and signing material are excluded from Git. Release SHA-256 files accompany the downloadable ZIP/DMG.

Pushing `main` publishes the hosted studio through the Pages workflow. Pushing a `v*` tag runs the Apple Silicon Mac release workflow.

The APIs require the Node.js runtime because they invoke local executables. They are omitted from the GitHub Pages export and are not exposed on a public network. Tests use fixtures and small local Node processes; they do not call a model or consume provider usage.

API endpoints:

- `GET /api/agents`: installed agent names, optional versions, and installation status.
- `POST /api/explore`: structured invention generation for `codex` or `claude`.
- `POST /api/research`: native web research tied to submitted assumption IDs.
- `GET /api/health`: local launcher health check.
