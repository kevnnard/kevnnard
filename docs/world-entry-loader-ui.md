# World entry loader UI

The `/world` entry gate from `design/world-entry-loader/03-world-assembly.html` ("World assembly"). Feature: `odd/tasks/world-entry-loader.md`, T1 (S1, S2, S4).

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
| `phase` is `scene`, `assets` or `frame`, `error` is `null` | `progress`, rounded and clamped to 1–99. Enter is disabled ("Preparing your world…") |
| `phase` is `ready`, `error` is `null` | 100, all three steps done, "Enter world →" enabled |
| `error` is a string | Last percentage (1–99), an alert with the message, "Try again" when `onRetry` is given, a "Back to portfolio" link to `/`. Enter stays disabled |

Phase to status text: `scene` "Preparing the scene", `assets` "Loading models & materials", `frame` "Preparing the first frame", `ready` "Your world is ready".

Checklist rows are marked done by phase: Scene foundations when `assets` starts, Models & materials when `frame` starts, First frame at `ready`.

## Layout from artboard 03

- Left: an original line drawing of the house and desk adapted from the artboard paths, with an emerald stroke on a `#18181b` floor.
- Right: the "World assembly" eyebrow, the heading "Building a place / to look around.", the three-step checklist, the `NN / 100` count, a 3px bar and the Enter button.
- Header: "← Back to portfolio" and `KEVNNARD / WORLD`. Footer: the story line and "Sound follows your saved preference."
- The artboard's preview slider, Replay button and simulated script are not part of the component.

Each wire path uses `pathLength={1}`. The CSS sets `stroke-dashoffset: calc(1 - var(--world-entry-progress))`. The inline `--world-entry-progress` is the real percentage divided by 100, and the same variable scales the bar.

Tokens come from `design/system.md`: `#09090b`, `#18181b`, `#27272a`, `#a1a1aa`, `#d4d4d8`, `#fafafa`, the `#10b981` accent and `#7f1d1d` for the error border. Buttons and links have a 44px minimum height and a 6px radius. Focus rings are 3px `#d4d4d8` at 50%.

## Placement

`.world-entry-loader` uses `position: absolute; inset: 0; z-index: 50`. The parent mounts it inside the `position: relative` world viewport, above the HUD. All selectors start with `.world-entry-`, so no page or global styles change. The parent keeps the scene underneath `inert` until entry.

The root is a size container (`world-entry`). At 650px wide or less, the drawing stacks above the panel, Enter takes the full width and the brand label is hidden.

## Accessibility

- The root is `role="dialog"` with `aria-modal="true"`, labelled by the heading. There is no focus trap; the parent's `inert` scene does that job.
- The bar is `role="progressbar"` with `aria-valuenow` and `aria-valuetext` (for example "42 percent, Loading models & materials").
- Only the phase line is a polite `role="status"`, so a screen reader announces phase changes, not every number. The large count is `aria-hidden`.
- Errors render in `role="alert"`.
- Focus moves at most twice. On mount it goes to the heading, if nothing else has focus. At readiness it goes to Enter, if focus is still on the body or inside the loader. Percentage updates never move focus.
- Reduced motion: when the `reducedMotion` prop is set or `prefers-reduced-motion: reduce` matches, the drawing is complete and static. The bar and the count still show the real value without transitions.

## Verification limits

`tests/world/world-entry-loader.test.ts` checks the source and the stylesheet. It does not render a DOM. Rendering, focus behavior, screen reader output and the visual match with the artboard still need a browser check after the parent integrates the component.

## Minimum visual reveal

WorldApp supplies presentation state capped by real scene progress and a 2.5-second reveal (`world-load-presentation.ts`). This intentional animation delay was requested after fast cached loads made the diagram effectively invisible. Actual loading continues independently; 100% and entry wait for both. The loader component itself remains stateless with respect to progress timing; reduced motion still shows a static drawing. Errors surface immediately.
