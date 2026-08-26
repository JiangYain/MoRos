# Moros UI Color System

Moros uses a cool-neutral palette with one restrained vermilion accent. The interface should feel quiet, precise, and clinical without becoming sterile. Warm-gray fills are excluded because they introduce a yellow cast and make stacked surfaces look muddy.

The system has two complete themes. `System` follows the operating-system preference; `Light` and `Dark` are explicit user overrides stored locally.

## Light palette

| Token | Hex | Role |
|---|---:|---|
| `--color-bg` | `#FFFFFF` | Main canvas and input surfaces |
| `--color-sidebar` | `#EDF0F2` | App chrome and navigation |
| `--color-surface` | `#F3F5F6` | Grouped content and code previews |
| `--color-surface-hover` | `#E7EAED` | Hover feedback |
| `--color-surface-active` | `#DCE1E5` | Selected and pressed states |
| `--color-text-primary` | `#151719` | Primary text and icons |
| `--color-text-secondary` | `#4C545C` | Body text and normal controls |
| `--color-text-tertiary` | `#68727C` | Metadata, timestamps and placeholders |
| `--color-border` | `#D5D9DE` | Hairline separators |
| `--color-border-strong` | `#B8BEC5` | Control and floating-surface boundaries |
| `--color-border-focus` | `#717B85` | Focus and resize affordances |
| `--color-accent` | `#C74634` | Vermilion brand accent |
| `--color-accent-soft` | `#FFF0ED` | Low-emphasis accent surface |
| `--color-success` | `#0F7653` | Ready and connected states |
| `--color-warning` | `#8B5700` | Caution states |
| `--color-danger` | `#B83B31` | Destructive and error states |

## Dark palette

| Token | Hex | Role |
|---|---:|---|
| `--color-bg` | `#151719` | Main canvas |
| `--color-sidebar` | `#101214` | Recessed app chrome |
| `--color-surface` | `#1D2024` | Grouped content |
| `--color-surface-hover` | `#272B30` | Hover feedback |
| `--color-surface-active` | `#32383E` | Selected and pressed states |
| `--color-text-primary` | `#F2F4F5` | Primary text and icons |
| `--color-text-secondary` | `#C1C7CD` | Body text and controls |
| `--color-text-tertiary` | `#9AA3AC` | Metadata and placeholders |
| `--color-border` | `#343A40` | Hairline separators |
| `--color-border-strong` | `#4A525A` | Control boundaries |
| `--color-border-focus` | `#8D98A4` | Focus affordances |
| `--color-accent` | `#F17A66` | Dark-theme vermilion accent |
| `--color-accent-soft` | `#35201C` | Low-emphasis accent surface |

## Accessibility contract

1. Primary, secondary and tertiary text tokens must retain at least WCAG AA contrast against their intended canvas. Do not use opacity to weaken text.
2. Focus is never color alone: interactive controls retain a visible two-pixel focus outline.
3. Theme changes must update `color-scheme` so native controls and scrollbars match the active theme.
4. Status colors always appear with a label, icon or shape; red and green are not the sole signal.
5. Respect `prefers-reduced-motion`; listening, progress and disclosure animations collapse to near-zero duration.

## Usage rules

1. Gray is structural, never decorative. Use `surface`, `surface-hover` and `surface-active` according to interaction state.
2. Borders carry hierarchy before shadows. Shadows are reserved for menus, dialogs and overlays.
3. Vermilion is scarce: progress, focus, permission state and destructive emphasis only.
4. Do not introduce component-local neutral hex values or hard-coded white overlays. Add a semantic token here first.
5. Dark mode is a semantic-token substitution, not a blanket inversion; provider logos, images and the vermilion accent retain their identity.
