# World entry loader UI

The `/world` entry gate from `design/world-loader-refresh/06-blueprint-home.html` ("Blueprint Home", artboard 06). It replaces the earlier "World assembly" layout from `design/world-entry-loader/03-world-assembly.html`. Feature: `odd/tasks/world-entry-loader.md`, T1 (S1, S2, S4, L17).

Files: `src/components/world/WorldEntryLoader.tsx` (default export) and `src/components/world/world-entry-loader.css`.

## Contract

```ts
<WorldEntryLoader
  state={state}            // WorldLoadState from src/lib/world/world-loading.ts
  onEnter={() => {}}       // called from the Enter click only
  onRetry={() => {}}       // optional; shows "Try again" on error
  reducedMotion={boolean}
/>
```

The component is stateless. It has no timers and no simulated progress. Everything shown comes from `state`.

| Input | Shown |
| --- | --- |
| `phase` is `scene`, `assets` or `frame`, `error` is `null` | `progress`, rounded and clamped to 1–99. Status dot pulses with "Not ready". Enter is disabled ("Preparing your world…") |
| `phase` is `ready`, `error` is `null` | 100, all four milestones on, ink turns white, windows light up, warm glow appears, status "Ready to enter", "Enter world →" enabled |
| `error` is a string | Last percentage (1–99), status "Could not load", an alert with the message, "Try again" when `onRetry` is given, a "Back to portfolio" link to `/`. Enter stays disabled ("World unavailable") |

Phase line under the percentage: `scene` "Nature and sky", `assets` "Ground and surfaces", `frame` "Living interior", `ready` "Ready to enter". On error it reads "The world could not be prepared".

## Layout from artboard 06

- Header: a titleblock with "← Back to portfolio", the sheet reference "Kevnnard · world entry · sheet 01" and the heading "Drawing the house". On the right, the large percentage and the phase line.
- Sheet: an original isometric SVG blueprint of the house (`.world-entry-blueprint`, `viewBox="0 0 720 440"`) on an emerald 48px grid that fades out radially.
- Footer: four milestone ticks, a status dot with "Not ready" / "Ready to enter", the about copy ("A small house in the forest." plus the walk-through line), the error alert when present, and the Enter world button.
- The artboard's preview controls and simulated script are not part of the component.

### Blueprint ink

The drawing has 10 ink orders (`data-order="0"` to `"9"`): ground plate, front face, side face, structure, roofline, garage and siding, porch and door, windows, chimney, dimension lines. Every ink path (`.world-entry-ink`) uses `pathLength={1}` and `stroke-dasharray: 1`.

The component sets `--world-entry-order-t` to `percent / 100 * 10`. Each order sets `--ink-order`, and the CSS draws it with `stroke-dashoffset: calc(1 - clamp(0, t - order, 1))`. So orders ink one after another, and each one is driven by the real percentage, not by a clock. `--world-entry-progress` (`percent / 100`) is still set on the root.

### Readiness

When `ready` is true the root gets `.world-entry-ready`. The ink turns `#fafafa`, the two `.world-entry-window` polygons fill with white at 0.9 and the `.world-entry-glow` polygon fills with emerald at 0.12. Each fill fades in over 1.4s. Milestone ticks turn on at 24, 49, 74 and 99 percent.

Tokens come from `design/system.md`: `#09090b`, `#18181b`, `#27272a`, `#a1a1aa`, `#d4d4d8`, `#fafafa`, the `#10b981` accent and `#7f1d1d` for the error border and dot. The artboard's off-token grays are replaced by `#a1a1aa` at reduced stroke opacity for faint ink and dimension lines. Buttons and links have a 44px minimum height and a 6px radius. Focus rings are 3px `#d4d4d8` at 50%.

## Placement

`.world-entry-loader` uses `position: absolute; inset: 0; z-index: 50`. The parent mounts it inside the `position: relative` world viewport, above the HUD. All selectors start with `.world-entry-`, so no page or global styles change. The parent keeps the scene underneath `inert` until entry.

The root is a size container (`world-entry`). At 720px wide or less, the header stacks, the readout aligns left, the drawing shrinks to 260px high, the milestones use two columns and Enter takes the full width. The drawing sheet is a plain `div`, because `src/pages/world.astro` already provides the page `<main>`.

## Accessibility

- The root is `role="dialog"` with `aria-modal="true"`, labelled by the heading. There is no focus trap; the parent's `inert` scene does that job.
- The readout is `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` (for example "42 percent, Ground and surfaces").
- The phase line and the footer status are `role="status"`, so a screen reader announces phase and readiness changes, not every number. The large percentage is `aria-hidden`. The blueprint is one `role="img"` with a label, and the milestone ticks are `aria-hidden`.
- Errors render in `role="alert"`.
- Enter is `disabled` until ready, and its click handler is only attached when ready.
- Focus moves at most twice. On mount it goes to the heading, if nothing else has focus. At readiness it goes to Enter, if focus is still on the body or inside the loader. Percentage updates never move focus.
- Reduced motion: when the `reducedMotion` prop is set or `prefers-reduced-motion: reduce` matches, all ink is drawn and static (`stroke-dashoffset: 0`). Ink, glow, windows, status dot and milestone ticks have no transitions or animations. The percentage and milestones still show the real value.

## Verification limits

`tests/world/world-entry-loader.test.ts` checks the source and the stylesheet. It does not render a DOM. Rendering, focus behavior, screen reader output and the visual match with artboard 06 still need a browser check.

## Minimum visual reveal

WorldApp supplies presentation state capped by real scene progress and a 2.5-second reveal (`world-load-presentation.ts`). This intentional animation delay was requested after fast cached loads made the diagram effectively invisible. Actual loading continues independently; 100% and entry wait for both. The loader component itself remains stateless with respect to progress timing; reduced motion still shows a static drawing. Errors surface immediately.
