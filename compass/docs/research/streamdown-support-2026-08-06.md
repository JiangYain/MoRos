# Streamdown support audit (2026-08-06)

## Verdict

Compass can run Streamdown 2.5.0 on its current React 19 / Electron renderer. The
working-tree integration typechecks, builds, passes the full unit suite, and
passes the real Electron smoke scenarios for burst streaming, completion,
history, code blocks, narrow layouts, themes, and reduced motion.

The integration is accepted with streaming semantics and visual animation kept
independent: reduced-motion users retain incomplete-fence and emphasis repair
while `isAnimating` remains false.

## Upstream support boundary

- The npm `latest` release was `streamdown@2.5.0` on the audit date. The tagged
  [package manifest](https://github.com/vercel/streamdown/blob/streamdown%402.5.0/packages/streamdown/package.json)
  declares React and React DOM `^18.0.0 || ^19.0.0` peers; Compass currently uses
  React 19.2.7.
- Streamdown is an ESM package exporting the component and `styles.css`. It does
  not declare a Node engine floor in the 2.5.0 manifest. Compass uses it only in
  the browser/Electron renderer.
- The official [README](https://github.com/vercel/streamdown) describes streaming
  incomplete-Markdown repair, GFM, memoized rendering, and security hardening.
  The [configuration documentation](https://streamdown.ai/docs/configuration)
  exposes `mode="streaming" | "static"`, `parseIncompleteMarkdown`, custom
  components, remark/rehype plugins, and `isAnimating`.
- The official [animation documentation](https://streamdown.ai/docs/animation)
  says animation is a per-word HAST transform. Setting `isAnimating=false`
  removes the animation plugin and its extra spans from completed messages.
  Code, pre, SVG, math, and annotation content are skipped. Streamdown's shipped
  CSS has no `prefers-reduced-motion` media rule, so the host application must
  disable animation itself.
- The 2.5.0 public type and implementation also accept `stagger`; its source
  default is 40 ms per new tokenized segment. Compass pins `stagger: 0`, so all
  newly received words use only a cosmetic 150 ms fade and cannot form a hidden
  reading queue. `stagger` is present in the tagged package API but is not listed
  in the public animation options table, so exact version pinning is important.
- Streamdown's default rehype pipeline enables raw HTML, sanitization, and
  hardening. Compass intentionally supplies only the tagged `sanitize` and
  `harden` defaults so adopting Streamdown does not broaden its previous raw
  HTML behavior.
- The official installation guide assumes Tailwind scanning and shadcn-style
  design tokens. Compass does not add Tailwind; it supplies its existing
  semantic `.md` CSS and custom link/code/pre/table components instead. This is
  working in smoke tests, but it is an integration surface to recheck when
  upgrading Streamdown because upstream default component class names are
  Tailwind-oriented.
- The base 2.5.0 package manifest still lists Mermaid as a hard install
  dependency even though diagram rendering is plugin-driven. Compass does not
  enable Mermaid. The production sourcemap contained no Mermaid source, so Vite
  tree-shook its runtime from the renderer; the installation footprint still
  carries the dependency.
- The package is Apache-2.0. The installed 2.5.0 archive contains the standard
  Vercel license text and no separate NOTICE file.

## Current Compass integration observed

- `package.json` pins `streamdown` exactly at `2.5.0` and removes direct
  `react-markdown` / `remark-gfm` declarations.
- `Markdown.tsx` preserves Compass code language tags, localized copy buttons,
  links, raw-HTML behavior, and disables Streamdown's own controls/link modal.
- Only the latest active ordinary text block receives animation. Thinking,
  tools, skills, completed messages, and history remain static. A single
  lifecycle-aware activity Orb represents composing, thinking, or tool work;
  no Streamdown caret is configured.
- The shared renderer event bridge coalesces adjacent compatible assistant
  deltas once per animation frame and treats lifecycle events as ordering
  barriers.
- Reduced-motion keeps active content in streaming mode for incomplete-Markdown
  repair while disabling word animation and removing fade/filter/transform.
- `THIRD_PARTY_NOTICES.md` carries the Apache-2.0 attribution and points to the
  2.5.0 tag, and records the MIT attribution for `thinking-orbs`.

## Verification evidence

- `npm ls streamdown react react-dom --depth=1`: Streamdown 2.5.0 uses the
  deduplicated React/React DOM 19.2.7 installation.
- `npm run typecheck`: passed.
- `npm run test:unit`: 144/144 passed. A 5,000-delta burst collapsed to three
  lifecycle/store commits; the test measured about 0.124 ms from assistant-end
  dispatch to its authoritative text state.
- `npm run build`: passed. The latest renderer output was about 2.55 MB of main
  JavaScript and 220 KB of CSS before compression. This audit did not reconstruct
  an isolated pre-Streamdown bundle, so these are current sizes rather than a
  claimed before/after delta.
- Production sourcemap: Streamdown/Marked/Remend/rehype and `tailwind-merge` are
  present; Mermaid source is absent.
- `npm audit`: zero vulnerabilities across the current dependency tree.
- `npm run audit:providers:static`: 38 providers, 1,214 models, zero static
  failures.
- `npm run test:smoke`: passed in real Electron. A 53-delta burst produced one
  Markdown mutation batch and stabilized in about 23.7 ms; assistant-end became
  static in about 26.7 ms. Light/dark, reduced-motion incomplete Markdown,
  single-owner composing/tool activity, code controls, history remount, and
  narrow layout assertions passed.
- Local development endpoints returned HTTP 200 and `{ "ok": true }`.
- `git diff --check` passed; the Pi submodule remained clean.

## Recommendation

Keep Streamdown 2.5.0 pinned. Treat changes to streaming-mode repair,
`isAnimating`, renderer batching barriers, or the one-Orb lifecycle mapping as
regression-sensitive. Re-run typecheck, unit, build, smoke, audit, and diff
checks for every Streamdown upgrade.
