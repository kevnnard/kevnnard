# World compact HUD

The Menu, the back link and the lighting panel share one trigger style: the compact day controller (`src/components/room/TimeController.tsx`, `CompactConsole`). Feature: `odd/tasks/world-game-menu.md`, T2 (S1, S5).

## Shared trigger: `world-hud-trigger`

`src/components/world/world-hud.css` declares one class for a native `<button>`, `<summary>` or `<a>`:

| Property | Value | Compact console source |
| --- | --- | --- |
| Border | `1px solid #27272a` | `border border-zinc-800` |
| Radius | `12px` | `rounded-xl` |
| Background | `rgba(9, 9, 11, 0.9)`, `blur(8px)` | `bg-zinc-950/90 backdrop-blur` |
| Text | `#fafafa`, system mono, `12px/16px`, tabular numbers | `font-mono text-xs text-zinc-50 tabular-nums` |
| Padding, gap | `12px 16px`, `10px` | `py-3 pl-4`, `gap-2.5` |
| Focus | `2px solid #d4d4d8`, offset `2px` | `outline-zinc-300` |

- No shadow and no pill radius.
- `min-height: 44px` keeps the touch target while the visual stays small.
- The `<summary>` marker is hidden.
- The file only styles `.world-hud-trigger` and its states. Menu and overlay layout stay in their own stylesheets.

`ScenePanel.tsx` imports the file. The menu worker adds the class to `.world-menu-trigger` and `.world-portfolio-link`. Rules in `world-menu.css` that set a shadow, an opaque background or other padding have the same specificity, so the parent removes them or they override the shared look depending on import order.

## Lighting disclosure

The whole header row of `ScenePanel` is one native button inside the panel heading:

```html
<h2 class="sp-head">
  <button type="button" aria-expanded aria-controls="…-cards" class="world-hud-trigger sp-trigger">
    dot · Scene · 3/5 lights on · ▾
  </button>
</h2>
```

- Click, Enter or Space anywhere on the row toggles the cards. The separate Show/Hide button is gone, so there is no button inside a button.
- The section is not a click target, so using a slider, color, switch, Reset or Power never toggles the panel.
- Inside the panel the trigger has no border or background of its own. The panel is the card surface, like the clock's `<section>` around its `<summary>`. Its focus ring is inset so the panel's `overflow: hidden` cannot clip it.
- Closed, the panel is `width: max-content`, so it shrinks to the header row. Open (`data-open="true"`), it is the original 21rem (336px) console. The chevron turns when open.

Unchanged behavior:

- Light cards, sliders, colors, switches, Reset lights and Power off/on.
- The night gate from 18:00 to 05:59 (`nightLightsOn`), the master switch and the status announcements.
- The lift above the day controller. It still measures the parent and the `Time of day` section with the open 21rem (336px) width, so the closed panel never changes the lift.
- `ScenePanel` and `TimeController` are still direct children of the world container.

## Verification

- `tests/world/compact-hud.test.ts` checks the shared class, the one-button header, the closed and open widths, and the kept lift measurement.
- `tests/world/scene-panel.test.ts` allows `world-hud-trigger` and the closed width.
- These are source checks. A browser is still needed for a visual check.

Menu, Back to portfolio and Scene share the compact clock’s 21rem desktop
width even with shorter labels. Scene retains that width when expanded.
Widths are constrained to the available space on smaller screens; the existing
clock-overlap measurement uses 336px to match the card.
