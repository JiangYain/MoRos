<div align="center">

<img src="./moros_flow_smooth.gif" width="700">

</div>

<div align="center">

<a href="https://github.com/JiangYain/MoRos/releases/latest/download/Demo01.mp4">
  ▶ Watch full demo video (GitHub Release asset)
</a>
<br />
<a href="https://github.com/JiangYain/MoRos/releases/latest">
  View latest release page
</a>

</div>

## Executive summary

The `packages/Moros` package implements a local-first, Electron-based desktop application that combines a Markdown-centric knowledge workspace, an Excalidraw whiteboard, and an “agentic chat” interface backed by a locally spawned CLI agent process. The stack is a React + Vite renderer with Tailwind/typography plugins, plus an embedded Express server on `http://localhost:53211` that exposes file-system, knowledge-graph, settings, proxy, and agent streaming endpoints.

Two distinct “AI” paths exist in code:  
1) a local CLI “coding-agent” integration (via RPC over stdin/stdout) for providers labeled `github-copilot`, `openai-codex`, and `opencode-go`; and  
2) direct-to-provider HTTP calls from the renderer for Dify chat streaming and multiple image-generation backends (including “Midjourney” polling and GPT-4o image endpoints), with API keys stored in browser `localStorage`. 

From a security and product-hardening standpoint, the codebase shows strong prototyping velocity (frequent commits in early March 2026) but has material risks: permissive proxying (`/api/proxy?url=...`) that can become an open proxy if exposed, several endpoints that read “absolute” paths from the host machine, a likely path-traversal gap in “raw” file serving, `webSecurity: false` in the Electron window, and a deliberate “auto-approve” handler for agent tool confirmation requests. There are no visible automated tests or CI signals under `packages/Moros`. 

Licensing is non-OSI: `packages/Moros/LICENSE` is a “MoRos Community Source License 1.0” that prohibits commercial use and still contains template placeholders, creating legal ambiguity for redistribution and downstream contributors.

## Codebase anatomy

### Repository structure and languages

The repository is a monorepo (`workspaces`) with multiple packages; `packages/Moros` is the desktop app under analysis.

Within `packages/Moros`, the notable top-level elements are:

- `src/`: React renderer (JS/JSX + some TS utility files) with editor, chat, sidebar, whiteboard, preview/export, i18n. 
- `server/`: Express API server written in TypeScript (compiled into `dist/server`). 
- `markov-data/`: local data root (tracked with `.gitkeep` in-repo, populated at runtime). 
- `vendor/excalidraw/`: vendored Excalidraw-related code/assets; plus `@excalidraw/excalidraw` is also used as a dependency. 
- build/config: `vite.config.js`, `tsconfig.json`, `server/tsconfig.json`, `electron.config.cjs`, Tailwind/PostCSS configs.

The package is explicitly an ES module (`"type": "module"`) and uses Electron as the main entry (`"main": "electron.config.cjs"`).

### Build and runtime dependencies

`packages/Moros/package.json` shows a combined Electron + web stack:

- Renderer: React 18, Vite, Tailwind, `react-markdown` + `remark-gfm` + `rehype-highlight`, `highlight.js`, `shiki`, `streamdown` (+ math/cjk/code), `lucide-react`.
- Whiteboard: `@excalidraw/excalidraw`. 
- 3D/graph: `react-force-graph-3d`, `three` suggest a knowledge graph or visualization component exists in the UI.
- Export: `html2canvas`, `jspdf`, `pptxgenjs`, `file-saver`, and `juice` (CSS inlining).
- Server: Express + CORS + Multer + Chokidar.
- Tooling: `tsx watch` for server dev, `concurrently`, `wait-on`, `electron-builder`.

A critical implicit runtime dependency for the “agent” workflow is a compatible CLI agent binary/script that speaks the expected JSON-RPC protocol. The server’s `RpcAgentSessionManager` attempts to resolve and spawn:
1) an override from `MOROS_PI_CLI_PATH`, otherwise  
2) `@mariozechner/pi-coding-agent`’s `dist/cli.js`, otherwise  
3) workspace fallbacks (`../coding-agent/dist/cli.js` or `../coding-agent/src/cli.ts` via `tsx`), otherwise  
4) a global `pi` executable.

### Server-side APIs, data models, and configuration

The Express server (`server/index.ts`) binds to `PORT` defaulting to `53211`, serves static files from `dist`-adjacent paths, sets JSON body limits up to `100mb`, and mounts routers:

- `/api/files` for file CRUD and uploads  
- `/api/knowledge` for knowledge graph, related files, and content search  
- `/api/proxy` for HTTP proxying  
- `/api/agent` for streaming “agent” interactions and session management  
- `/api/settings` for system prompt persistence  
- `/api/openai-codex` for local OAuth flows and token refresh

The primary shared server-side data models are defined in `server/types/index.ts`:

- `FileItem` includes `path`, timestamps, `size`, and optional `color`.  
- `KnowledgeGraph` contains `nodes` and `links`, where `KnowledgeLink.type` distinguishes `reference`, `similarity`, and `tag`.

Local storage layout is anchored on `process.cwd()/markov-data`. The file-system utility (`server/utils/fileSystem.ts`) defines hidden/control files for ordering and metadata (`.order.json`, `.metadata.json`) and defines a “global settings” filename `.moros-settings.json` that is excluded from file-tree scans. It also includes a defensive `resolveDataPath` that is intended to keep resolved paths within the data root.

### Renderer entry points and key modules

The renderer is bootstrapped by `src/main.jsx` mounting `<App />` into `#root`. (The raw file includes the React DOM render call.) 

`src/App.jsx` is a large orchestration component that wires together:

- the left sidebar file tree and workspace/skills sections  
- a central editor area that switches among Markdown, chat, images, and whiteboard  
- preview/split view modes and various UI sub-panels (style editing, settings modal, and a “cursor guide” overlay) 

In the editor stack:

- `MainContent.jsx` handles file-type routing (`.moros` chat, `.excalidraw` whiteboard, markdown vs plain text), a landing screen, and triggers a Dify-backed “AI streaming insert” hook for in-editor writing assistance.
- `RightPanel.jsx` provides preview-only UI in split mode, including `ExportToolbar` and a “rich HTML preview” mode.
- `Whiteboard.jsx` provides Excalidraw editing with debounced autosave and pruning of unused embedded image blobs to reduce `.excalidraw` file size. 
- `EnhancedWhiteboard.jsx` adds a drag-drop “markdown card” overlay system and built-in image generation/variation functions.
- `ChatInterface.jsx` and `chat-interface/*` implement `.moros` chat sessions, “chat artifacts,” tool-event timelines/segments, attachments, and streaming.

### Tests and documentation gaps observed in code

No unit/integration test directories or test scripts are defined in `packages/Moros/package.json`, and no test tooling (Vitest/Jest) appears in this package’s devDependencies.

Several modules contain embedded Chinese UX strings and developer notes, but there is no in-code API documentation for the agent event schema beyond helper functions. The “skills” system is implemented (skills folders, paths passed to the agent), but the expected skill file format and runtime semantics are not documented in this package.

The license file contains `[YEAR]`/`[LICENSOR]` placeholders, making downstream legal interpretation unclear.

## Runtime behavior

### How it runs

The normal dev workflow is explicitly defined:

- `npm run client` starts Vite on `http://localhost:53210`  
- `npm run server` runs `tsx watch server/index.ts` (Express on `:53211`)  
- `npm run electron-dev` runs both, waits for the Vite URL, then starts Electron

Production build uses:

- `npm run build`: `vite build` + `tsc -p server/tsconfig.json`  
- `npm run dist`: builds and invokes `electron-builder`

In production, the Electron main script (`electron.config.cjs`) constructs a BrowserWindow, loads either the Vite URL (dev) or the built HTML file, and starts the backend server by spawning a Node-compatible process using `ELECTRON_RUN_AS_NODE` pointing to `dist/server/index.js`. It also attempts to kill the backend when all windows close.

### Main GUI workflows and local persistence

Local persistence is primarily file-based under `markov-data/`:

- Markdown and other notes are saved as ordinary files under the data root via `/api/files`.
- The sidebar auto-creates `.excalidraw` files for new whiteboards and creates `.MoRos` chat files for new chats; `.MoRos` JSON includes provider/model metadata plus a message list.
- The sidebar includes logic to auto-delete “empty” unopened `.MoRos` chats (messages empty and `conversationId` empty).
- Whiteboards autosave JSON after a debounce and prune unused images.

Chat persistence is JSON inside `.moros` files: `ChatInterface.jsx` loads file JSON, streams model responses, captures tool events into structured “segments,” then persists the updated message list back to the file.

### Network calls and model inference paths

There are three distinct network “planes” in code:

1) **Local API plane** (always): the renderer uses a hard-coded `API_BASE = http://localhost:53211/api` and calls `/files`, `/knowledge`, `/settings`, `/agent`, `/openai-codex`, etc.

2) **Agent inference plane** (local CLI RPC + provider HTTP beneath it):  
   - The renderer calls `/api/agent/chat/stream` (SSE).
   - The server’s `agentRouter` uses `rpcAgentSessionManager` to spawn a CLI child process (provider/model/session-dir args) and then forwards agent events through SSE (`event: agent_event`).
   - The proxy router `/api/proxy?url=...` is used to forward requests to `github.com` / `githubcopilot.com` (with special Copilot headers) and to `opencode.ai`, with retries for transient errors.
   - OpenAI Codex OAuth is implemented as a local callback server flow (`localhost:1455`) with endpoints to start/status/cancel/refresh.

3) **Direct external API plane** (renderer makes outbound HTTP calls and stores secrets in localStorage):  
   - Dify chat streaming uses `https://api.dify.ai/v1` by default, with API key in localStorage, and contains an explicit security note recommending a backend proxy for production.
   - Image generation utilities default to `https://api.tu-zi.com/v1` and include:  
     - “Gemini” image generation via OpenAI-compatible `/chat/completions` streaming,  
     - “Midjourney” job submission/polling under `/mj/*`,  
     - GPT-4o image generation/edit/variation via `/v1/images/*` endpoints.

### Resource needs

The app’s performance envelope is driven by:

- Electron + React rendering (typical desktop overhead).
- local file scanning and caching (file tree/metadata ordering).
- whiteboard JSON sizes (server accepts up to 100MB request bodies; whiteboard autosave explicitly anticipates large inline image payloads).
- agent concurrency (sessions are cached and swept, with prompt timeouts and inactivity timeouts; the child CLI process can execute tool calls that may spawn additional processes).

### Screenshot capture instructions for UI evidence

If UI documentation is required (without fetching images here), capture:

- Electron window screenshots: OS-level screenshot (macOS: `Shift+Cmd+4`, Windows: `Win+Shift+S`, Linux: DE screenshot tool).  
- DevTools snapshots: open DevTools in Electron (if enabled), capture the Network tab filtered on `localhost:53211` to document API calls (`/api/agent/chat/stream`, `/api/files/*`, `/api/proxy`).  
- Whiteboard evidence: capture an `.excalidraw` canvas showing a dropped “markdown card” overlay and the image-generation menu interactions.  
- Chat artifacts panel: capture the right-side “artifacts” view while tool calls are streaming and after persistence to `.moros`.

## Feature inventory

| Feature / capability | Evidence in code | Implementation notes | Maturity / coverage |
|---|---|---|---|
| Local file workspace with folders/files | `server/routes/files.ts`, `server/utils/fileSystem.ts`, `src/utils/api.ts` | Full CRUD: create, read, save, delete, rename, move, reorder, folder color metadata; uploads via Multer. | High (core path) |
| File ordering + per-folder metadata | `.order.json`, `.metadata.json` in `fileSystem.ts`; reorder route | Ordering persists per directory; metadata includes `color`.| Medium–High |
| Sidebar workspaces + skills sections | `src/components/Sidebar.jsx` | Creates workspace/skills root folders; “skills” passed into agent sessions; format not documented. | Medium |
| Markdown editor + preview + split view | `MainContent.jsx`, `MarkdownEditor.jsx`, `MarkdownPreview.jsx`, `RightPanel.jsx` | Markdown preview uses `react-markdown` + GFM + highlight; split mode uses right preview panel. | High |
| Rich HTML preview | `RightPanel.jsx`, `RichHtmlPreview` integration | Alternate preview mode; used for export styling. | Medium |
| Export: PDF preview + PDF export | `ExportToolbar.jsx` | Uses `html2canvas` -> multipage slicing -> `jsPDF`; includes a preview modal and margin/orientation controls. | Medium–High |
| Export: clipboard and likely PPTX | `ExportToolbar.jsx` + dependency `pptxgenjs` | Code includes copy actions and CSS inlining (`juice`); PPTX dependency exists but coverage in this file not fully enumerated here. | Medium |
| Excalidraw whiteboard with autosave | `Whiteboard.jsx` | Debounced autosave; prunes unused embedded file blobs. | High |
| Enhanced whiteboard “markdown card” overlays | `EnhancedWhiteboard.jsx`, Sidebar drag MIME `application/markdown-file` | Drag markdown files from sidebar into whiteboard; creates elements with `customData.type = 'markdown-card'` and overlays ReactMarkdown render. | Medium–High |
| AI image generation inside whiteboard | `EnhancedWhiteboard.jsx` + `src/utils/markovImage.ts` | Supports Gemini-style `/chat/completions` streaming image outputs, Midjourney job polling, GPT-4o image generation/edit/variation; keys in localStorage. | Medium (powerful, risky) |
| Knowledge graph generation | `server/utils/knowledgeGraph.ts`, `/api/knowledge/graph` | Builds links via wiki-links `[[...]]`, tags (`#tag` intent), and a simple similarity heuristic. | Medium |
| Knowledge “related files” | `/api/knowledge/related/:path` | Uses graph relationships for related file suggestions. | Medium |
| Full-text search across md + excalidraw | `/api/knowledge/search?q=` | Scans markdown and `.excalidraw` element text; returns match snippets. | Medium |
| Agentic chat stored as `.moros` | `ChatInterface.jsx`, `utils/chatFiles.ts` | `.moros` JSON includes provider/model; chat auto-persistence; reopen/resume logic. | High |
| Agent streaming via local CLI RPC | `server/utils/rpcAgentManager.ts`, `server/routes/agent.ts`, `src/utils/localCliAgent.ts` | Server spawns CLI with provider/model/session-dir; SSE emits tool events & message deltas; client maps into UI “segments.” | Medium–High |
| Provider integrations: GitHub Copilot / OpenAI Codex / OpenCode Go | `src/utils/githubCopilot.ts`, `src/utils/openaiCodex.ts`, `src/utils/opencodeGo.ts`, proxy router | Copilot uses device flow and model resolution; Codex uses local OAuth flow; OpenCode Go uses API key/base URL plus local proxy. | Medium |
| OpenAI Codex OAuth local flow | `server/routes/openaiCodexOauth.ts` + `src/utils/openaiCodex.ts` | Start/status/cancel/refresh endpoints; local callback server; credentials cached client-side. | Medium |
  | HTTP proxy with Copilot header injection | `server/routes/proxy.ts` | For GitHub targets, injects editor headers; retries transient errors; wide-open target URL support. | Medium (dangerous if exposed) |
| System prompt persistence | `/api/settings/system-prompt`, `.moros-settings.json` | Stores a “system prompt” in data root; UI consumes via `settingsApi`. | Medium |
| i18n layer | `src/utils/i18n.js` | Translator hook used throughout; mixture of `zh-CN` and `en-US` in UI strings. | Medium |
| Automated tests | None observed | No test scripts in this package; no test folder surfaced in `packages/Moros`. | Low |

## Competitive landscape

### Comparable products and projects

**Claude Code** (proprietary): an agentic coding tool by entity["company","Anthropic","ai company"] that can read/edit code, run commands, and integrate with developer workflows; offered across terminal/IDE/desktop/browser per docs.

**Codex app** (proprietary): a desktop “command center for agents” by entity["company","OpenAI","ai research company"] (macOS + Windows as of March 2026), supporting multi-agent parallel work, diff review, and project/thread organization.

**Qoder/Qwen QoderWork** (proprietary ecosystem): public materials indicate “Qoder” integrates “Qwen-Coder-Qoder” and has desktop availability mentioned in official channels; the most authoritative source in-scope here is Qoder documentation and Qwen pages, but the full desktop repo and license terms are not surfaced as a public GitHub codebase in the sources retrieved.

**Open-source comparables** (agentic or desktop local-first):

- **ValeDesk**: Tauri + React desktop assistant with local model support, tool execution, and a “community license” with revenue threshold.
- **AiderDesk**: Electron desktop AI dev platform with agent mode, tool ecosystem, memory, MCP support, Git worktrees; Apache-2.0.
- **OpenPawz**: Tauri offline-first desktop AI platform with security guardrails and extensibility; MIT.
- **Cline**: an open-source autonomous coding agent integrated into VS Code; Apache-2.0.
- **OpenHands**: open-source agentic development framework (MIT-licensed core), typically run as a service/CLI rather than a single monolithic desktop notes app.
- **Aider**: terminal-based AI pair programming; Apache-2.0.

### Comparison table

| Project | Supported models / providers | UI/UX | Plugins / extensions | Offline capability | License | Language support | Target users |
|---|---|---|---|---|---|---|---|
| MoRos (packages/Moros) | GitHub Copilot token, OpenAI Codex OAuth, OpenCode Go API; plus Dify + custom image endpoints via direct HTTP | Electron desktop app; Markdown editor + Excalidraw + chat artifacts | “Skills” directories passed into agent; no formal plugin registry; embeds an HTTP proxy | Notes/file workflows local; inference depends on external providers and/or local CLI agent availability | MoRos Community Source License 1.0 (non-commercial) | Mixed zh-CN/en in UI strings | Knowledge-workbench + visual whiteboard + agentic coding/chat in one app |
| Claude Code | Provider is Anthropic models/service | Terminal/IDE/desktop/browser (per docs) | Supports plugins and workflows via official docs/plugin directory | Depends on cloud service | Proprietary | Documentation in English (and likely more) | Developers wanting agentic coding in existing dev tools | 
| Codex app | OpenAI Codex models and agent workflows | Desktop app (macOS/Windows) with multi-agent threads and diff review | Integrates with dev tooling; official docs mention worktrees/automations | Primarily cloud-backed; local sandboxing emphasized | Proprietary | English docs | Developers managing multiple agent threads/projects |
| ValeDesk | Any OpenAI-compatible API (Ollama/vLLM/LM Studio) | Tauri desktop app | Skills marketplace + tool ecosystem | Strong offline story if using local models | Community license (revenue threshold) | English | Developers wanting local-first desktop assistant |
| AiderDesk | Multiple providers (OpenAI/Anthropic/Gemini/etc. per README) | Electron desktop app | MCP support + internal tool ecosystem | Can be local if pointed at local models; otherwise cloud | Apache-2.0 | English | Software engineers needing full “AI dev platform” |
| OpenPawz | Local models and provider connectors | Tauri desktop app | Built-ins + automation integrations | Emphasizes offline-first | MIT | English | Local-first AI platform users |
| Cline | Multiple providers via IDE config | VS Code extension (plus CLI) | MCP integration | Depends on chosen model/provider; can use local endpoints | Apache-2.0 | English | IDE-centric developers |
| OpenHands | Many LLM backends (framework-level) | Service/CLI/web UI variants | Extensible agent framework | Can run locally with local models | MIT (core) | English | Agentic software development automation |

Sources for Claude Code and Codex app:
Sources for ValeDesk/AiderDesk/OpenPawz/Cline/OpenHands/Aider:

## Unique selling points and differentiation

### Unified knowledge workspace plus agentic sessions as first-class files

MoRos treats chats as real files (`.MoRos` / `.moros`) with JSON content persisted in the same file-tree as notes and whiteboards. The sidebar can create chats directly and even auto-garbage-collect empty chats. This “chat-as-file” design is structurally different from many agent tools that store conversations in internal databases or proprietary thread UIs.

### Tight whiteboard–notes linkage via drag-drop markdown cards

The enhanced whiteboard supports dragging markdown files from the sidebar with a dedicated MIME type (`application/markdown-file`) and creates special “markdown-card” elements that render markdown content as overlays. This is a concrete, code-level integration between note files and canvas objects rather than a generic “attach file” mechanic.

### Broad “maker” feature surface: document export + image generation inside the same app

Export is not a bolt-on: the right preview panel includes PDF preview and PDF export with pagination logic, CSS inlining, and multi-mode preview (markdown vs rich HTML). In parallel, the whiteboard includes integrated image generation and image variation endpoints (Gemini-style chat/completions, Midjourney polling, GPT-4o images API). Many coding-agent competitors focus strictly on code; this package merges “knowledge publishing” and “visual creation” capabilities.

### “Agent as a local child process” with session reuse and tool event capture

The server spawns a CLI agent process per “token fingerprint” (provider authorization secret) and reuses sessions across prompts, with idle sweeping and model switching (`set_model`). Tool execution and agent internal events are streamed to the UI and persisted as structured segments. This architecture resembles agent frameworks, but here it is embedded into a desktop knowledge tool with a minimal HTTP surface (`/api/agent/chat/stream`).

### Evidence of rapid iteration on chat artifacts and provider support

The commit history shows multiple feature commits in early March 2026 adding OpenAI Codex support, OpenCode Go support, refactoring chat and sidebar, and improving artifact handling. This supports an interpretation of active development, not a dormant code drop.

## Gaps and risks

### Security risks

**Open proxy behavior**: `/api/proxy` accepts an arbitrary `url` query parameter to any `http/https` target, sets permissive CORS headers (`Access-Control-Allow-Origin: *`), and forwards headers (with some filtering). If this service is reachable beyond localhost (misconfiguration, port-forwarding, hostile local environment), it can be abused.

**Host file exposure**:
- `/api/files/raw-absolute` and `/api/files/raw-absolute-html` explicitly read arbitrary absolute filesystem paths and return content.  
- `/api/files/raw-absolute-root` allows reads under a specified root path.  
- `/api/files/preview-html` reads an absolute path and returns HTML.
These endpoints may be acceptable in a strictly local desktop context but are incompatible with any “remote server” deployment model.

**Potential path traversal**: the relative raw route uses `path.join(DATA_DIR, targetPath)` without an explicit “is within data root” check in that route, whereas other absolute-root routes do perform containment checks. This asymmetry is a typical traversal footgun if user-controlled paths reach the route.

**Electron window hardening**: `webSecurity: false` is set in `electron.config.cjs`, which weakens renderer protections (CORS and related web security behaviors). In an app that loads remote resources (e.g., image URLs, API responses), that is a high-risk default.

**Agent tool confirmation auto-approval**: The RPC manager responds to `extension_ui_request` of method `confirm` by auto-confirming (comment: “auto-approve to avoid hanging tool calls”). This can bypass user consent for tool actions (shell commands, file writes) depending on what the CLI agent supports, and eliminates an important safety barrier.

**Secrets stored in localStorage**: Dify API keys and the “MoRos image” API key/base URL are stored in localStorage, with direct renderer-to-internet calls. This exposes secrets to renderer compromise, XSS, or malicious content injection. The Dify module even acknowledges this and recommends backend proxying for production.

### Licensing and compliance risks

`packages/Moros/LICENSE` prohibits commercial use (“any commercial purpose”) and contains template placeholders instead of finalized legal identity fields, increasing ambiguity for contributors and users. A commit explicitly references updating to “MoRos Community Source License 1.0.”

This license choice also makes MoRos non-comparable to Apache/MIT ecosystems for reuse; competitor open-source projects commonly use Apache-2.0 or MIT.

### Maintainability and scalability gaps

- **No tests**: no package-level test script/tooling found.
- **Hard-coded API base**: renderer uses a fixed `http://localhost:53211/api`, reducing flexibility for port selection or embedded server routing.
- **Mixed language strings and UX**: a mixture of zh-CN strings and en-US locale assumptions exists; `index.html` uses `lang="zh-CN"`. This affects global UX consistency.
- **Large-file handling**: the server advertises “50MB max” for uploads in error text but config and multer indicate higher limits in places, creating inconsistent UX and potential confusion.

## Suggested README draft

## Overview

MoRos is a local-first knowledge workbench that combines:

- A workspace-like file tree for notes and assets (`markov-data/`)
- Markdown editing with preview, styling, and export
- Excalidraw whiteboards (`.excalidraw`) with autosave
- Chat sessions stored as first-class files (`.moros` / `.MoRos`)
- An agentic chat backend powered by a locally spawned CLI agent process, with streaming tool events and “artifacts”

MoRos is implemented as an Electron desktop app (React + Vite renderer) with an embedded Express API server on `http://localhost:53211`.

## Key concepts

### Data root

All user data is stored under:

- `markov-data/` (relative to the app working directory)

The server maintains folder ordering and metadata using hidden JSON files (such as `.order.json` and `.metadata.json`) in each directory.

### File types

- Markdown notes: `.md`, `.markdown`
- Whiteboards: `.excalidraw` (JSON)
- Chats: `.moros` / `.MoRos` (JSON)

Chats are persisted directly in `.moros` files (provider/model metadata + message list).

### Agent sessions

MoRos can stream agent responses via `/api/agent/chat/stream` (SSE). The server spawns a child CLI agent and forwards tool events and deltas to the UI.

## Installation

### Prerequisites

- Node.js (recommended: modern LTS compatible with Electron)
- npm
- (Optional) a compatible “pi”-style agent CLI if you want agentic chat features

### Install dependencies

From the repository root:

1. `npm install`

This repo uses workspaces; install at the root so shared dependencies resolve correctly.

## Development quickstart

From `packages/Moros`:

1. Start the full Electron dev environment:

   - `npm run electron-dev`

This runs:
- Vite on `http://localhost:53210`
- Express on `http://localhost:53211`
- Electron after the Vite URL is available

### Useful dev scripts

- `npm run client` — Vite dev server
- `npm run server` — Express server via `tsx watch server/index.ts`
- `npm run build` — build renderer + compile server TS

## Production build

From `packages/Moros`:

- `npm run dist`

This builds the renderer and server and packages via `electron-builder`.

## Usage guide

### Create and edit notes

- Create folders/files in the sidebar
- Edit Markdown in the center panel
- Use split view to see export-ready preview (right panel)

### Create a whiteboard

- Create a new `.excalidraw` whiteboard from the sidebar. MoRos seeds an initial Excalidraw JSON structure and autosaves edits.

### Link markdown and whiteboard

- Drag a Markdown file from the sidebar onto the enhanced whiteboard to create a “markdown card” overlay.

### Create a chat session

- Create a new `.MoRos` chat file from the sidebar.
- Chats persist to the file with message history and model/provider metadata.

### Agent providers

MoRos supports agentic chat providers labeled:

- `github-copilot` (requires Copilot token/OAuth in UI integration logic)
- `openai-codex` (requires local OAuth flow)
- `opencode-go` (requires an API key and base URL)

These are streamed to the UI via SSE and recorded with tool-event segments.

## Architecture

```mermaid
flowchart LR
  subgraph Electron_App
    UI[React Renderer\nVite build]
    Main[Electron main\n(electron.config.cjs)]
    API[Express Server\n:53211]
    Data[(markov-data/)]
  end

  UI -->|HTTP| API
  API -->|read/write| Data
  Main -->|spawn node process\nELECTRON_RUN_AS_NODE| API
  API -->|spawn/pipe JSON-RPC| CLI[Local CLI agent\n(pi-coding-agent / pi)]
  UI -->|optional direct HTTP| External[Dify / Image APIs]
  API -->|proxy| Net[GitHub/Copilot\nopencode.ai\nother targets]
``` 

## Security notes

- The local proxy endpoint (`/api/proxy?url=...`) forwards requests to arbitrary `http/https` targets and injects Copilot headers for GitHub targets; treat it as localhost-only and do not expose it publicly.
- Several file APIs can read from absolute filesystem paths; this is intended for local desktop usage and is unsafe for any remote hosting model.
- API keys for some integrations are stored in localStorage; consider moving secrets into the server layer if you harden the app.

## Contributing

- Keep changes scoped under `packages/Moros/`.
- Prefer adding tests for server utilities (`knowledgeGraph`, file path validation, proxy restrictions) before expanding external integrations.
- Avoid expanding absolute-path endpoints without strict containment checks.

## License

MoRos uses “MoRos Community Source License 1.0” (non-commercial). Review `packages/Moros/LICENSE` before any redistribution or derivative work.

## Troubleshooting

- If the UI loads but actions fail, check that the server is running on `http://localhost:53211/api/health`.
- If agent chat fails immediately, confirm that a compatible CLI agent is available (via `MOROS_PI_CLI_PATH` or a resolvable `pi`/`@mariozechner/pi-coding-agent` setup).
- If whiteboard saves are slow or files grow large, reduce embedded image usage; autosave is designed to prune unused images, but large embedded assets still increase file sizes.