# Compass Logo Motion Spec

## Source and structure

- Source raster: `../icon.png`
- Source size/mode: 512 × 512, RGBA, transparent background
- Visible bounds: `(42, 38)–(470, 466)`
- Foreground colors: graphite `#111111`, direction red `#D94632`; remaining colors are antialiasing samples
- Semantic parts:
  - `#mark-base`: the graphite architectural C / workspace frame
  - `#mark-direction`: the red directional stroke / compass needle
- Geometry level: existing two-part polygonal vector, equivalent to complexity level 2. The hard corners and straight runs are intentional brand geometry, so raster tracing or additional curve points would make the asset less editable without improving its silhouette.

## Motion brief

- Personality: **precise, steady, guiding**
- Brand axes: low-to-medium energy, serious tone. Compass serves hearing-care professionals; motion should communicate reliable direction rather than entertainment.
- Primary context: a 1200 ms showcase reveal that lands on a static final frame.
- Product context: a compact 760 ms title-bar reveal on first mount, followed by a 180 ms hover micro-interaction.
- Reveal pattern: staged assembly. The graphite frame establishes the workspace first; the red direction stroke follows on a shallow upward arc and settles last.
- Deliberate exclusions: no squash, bounce, random rotation, continuous idle loop, or geometry deformation.

## Principles applied

- **Staging:** graphite structure first, red direction stroke second.
- **Anticipation:** a short low-opacity hold and slight inset before the main reveal.
- **Slow In / Slow Out:** one professional easing family; no linear entrance segments.
- **Timing:** the title-bar version stays below 800 ms; the showcase allows a deliberate 1200 ms read.
- **Follow Through / Overlap:** the red stroke starts before the base fully settles and completes after it.
- **Arcs:** the red stroke arrives with a restrained two-axis path rather than a diagonal straight-line slide.
- **Solid Drawing:** only opacity, clip-path, and rigid transforms are animated; the verified final geometry is never deformed.
- **Appeal:** the movement echoes the logo's own “frame + direction” meaning.

## Main timeline (shared 1200 ms clock)

| Time | Phase | Base | Direction stroke | Principle |
|---:|---|---|---|---|
| 0–240 ms | Anticipation (20%) | hidden, inset from left | hidden below/right | Anticipation, Staging |
| 240–840 ms | Action (50%) | left-to-right mask reveal; settles by 760 ms | begins at 430 ms and travels on a shallow arc | Timing, Arcs, Slow In/Out |
| 840–1200 ms | Follow-through (30%) | static final pose | final 2 px correction and red emphasis fade | Follow Through, Appeal |

The final pose at 1200 ms is exactly the static SVG. The two parts do not share identical start or end times.

## Motion tokens

```css
--p2m-duration: 1200ms;
--p2m-ease-enter: cubic-bezier(0, 0, 0.2, 1);
--p2m-ease-settle: cubic-bezier(0.4, 0, 0.2, 1);
--p2m-ease-narrative: cubic-bezier(0.34, 0, 0.14, 1);
--p2m-squash: 0;
--p2m-overshoot: 1;
```

Keyframes use literal cubic-bezier values so Chromium does not silently fall back to linear timing.

## Atomic motions

1. **Guide:** the red direction stroke shifts 3 px up/right and returns on hover/focus.
2. **Focus:** a restrained red opacity pulse on the direction stroke only.
3. **Press:** the complete mark scales uniformly to 0.96 and returns; no squash.

## Tunable controls

- Replay restarts the shared clock deterministically.
- Slow mode uses 0.25× playback.
- Speed slider ranges from 0.25× to 1.5× and updates animations already running.
- `?t=<ms>`, `?static=1`, `window.__p2mReady`, and reduced-motion finalization are required QA hooks.

## QA record

### Geometry

- Accepted on iteration 01; no geometry refinement was necessary.
- IoU: **0.9961**
- Source-only pixels: **270**
- Render-only pixels: **5**
- Visual verdict: centers, visible bounds, corners, negative space, and color blocks match the source. Residuals are confined to browser-versus-source antialiasing.
- Smoothness verdict: pass. The mark contains intentional straight polygon edges and hard corners; there are no raster-traced curves or noisy knots to audit.
- Evidence: `outputs/fit_iterations/01_existing_vector_overlay.png`, `outputs/overlay_progress_strip.png`, `outputs/final_render.png`.

### Motion

- Deterministic frames captured at 0, 240, 430, 600, 760, 912, and 1200 ms.
- Strip verdict: staging is readable, the two actors overlap without moving in lockstep, the red direction stroke follows a restrained arc, and no frame clips the mark.
- Easing probe at 500 ms: computed direction translation `(11.9911, 8.5104)` versus linear reference `(18.4928, 20.1449)`, a **13.3279 px** difference. Literal non-linear easing is applied.
- There is no stroke draw, self-intersection reveal, or split-fill handoff, so an ink-delta continuity sweep is not applicable.
- Same-pipeline Final Frame Contract: **0 mean diff, 0 max diff, 0 different pixels** between `?t=1200` and `?static=1`.
- Cross-pipeline advisory diff against the 512 px Chrome render: mean absolute diff **3.169**, with **2.86%** of pixels off by 25+ after rescaling; visual geometry and color placement match.
- Reduced motion: the title-bar version creates zero animations and renders both parts at opacity 1 immediately.
- Evidence: `outputs/motion_strip.png`, `outputs/motion_qa_report.json`, `outputs/motion_probe.json`, `html_render.png`, `outputs/titlebar_integration_report.json`.
