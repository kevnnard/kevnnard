# Design system — kevnnard

Synced read-only from project sources on 2026-10-27. Every entry names its source. Values that come from framework defaults (Tailwind v4 / shadcn) and are not declared in the repository are labeled as such.

Sources read:

- `src/styles/globals.css` — `@theme inline`, `:root`, `.dark`, keyframes, base layer
- `components.json` — shadcn `new-york`, base color `zinc`, CSS variables on
- `src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `separator.tsx`, `tooltip.tsx`
- `src/components/room/TimeDial.tsx`, `src/lib/room/day-cycle.ts` — existing time-of-day control (content and behavior reference)

## Colors

Tokens are HSL channels in source (`hsl(var(--token))`). Hex is the converted value for artboards.

### Dark theme (`.dark`, `src/styles/globals.css`) — used by the room artboards

| Token | Source value | Hex | Usage |
| --- | --- | --- | --- |
| `--background` | `240 10% 3.9%` | `#09090b` | Page and card background |
| `--foreground` | `0 0% 98%` | `#fafafa` | Body text |
| `--card` / `--popover` | `240 10% 3.9%` | `#09090b` | Card surface (same as background) |
| `--card-foreground` / `--popover-foreground` | `0 0% 98%` | `#fafafa` | Text on card |
| `--primary` | `0 0% 98%` | `#fafafa` | Primary button fill |
| `--primary-foreground` | `240 5.9% 10%` | `#18181b` | Text on primary |
| `--secondary` | `240 3.7% 15.9%` | `#27272a` | Secondary button fill |
| `--secondary-foreground` | `0 0% 98%` | `#fafafa` | Text on secondary |
| `--muted` | `240 3.7% 15.9%` | `#27272a` | Muted surface |
| `--muted-foreground` | `240 5% 64.9%` | `#a1a1aa` | Secondary text, descriptions |
| `--accent` | `240 3.7% 15.9%` | `#27272a` | Hover surface (ghost/outline) |
| `--accent-foreground` | `0 0% 98%` | `#fafafa` | Text on accent |
| `--destructive` | `0 62.8% 30.6%` | `#7f1d1d` | Destructive actions |
| `--destructive-foreground` | `0 0% 98%` | `#fafafa` | Text on destructive |
| `--border` / `--input` | `240 3.7% 15.9%` | `#27272a` | Borders, input borders |
| `--ring` | `240 4.9% 83.9%` | `#d4d4d8` | Focus ring |

### Light theme (`:root`, `src/styles/globals.css`)

| Token | Source value | Hex |
| --- | --- | --- |
| `--background` / `--card` / `--popover` | `0 0% 100%` | `#ffffff` |
| `--foreground` / `--card-foreground` / `--ring` | `240 10% 3.9%` | `#09090b` |
| `--primary` / `--secondary-foreground` / `--accent-foreground` | `240 5.9% 10%` | `#18181b` |
| `--primary-foreground` / `--destructive-foreground` | `0 0% 98%` | `#fafafa` |
| `--secondary` / `--muted` / `--accent` | `240 4.8% 95.9%` | `#f4f4f5` |
| `--muted-foreground` | `240 3.8% 46.1%` | `#71717a` |
| `--destructive` | `0 84.2% 60.2%` | `#ef4444` |
| `--border` / `--input` | `240 5.9% 90%` | `#e4e4e7` |

### Emerald grid accent (`src/styles/globals.css`)

One channel, `rgb(16, 185, 129)` (`#10b981`), used only at alpha in source.

| Token | Dark | Light | Usage |
| --- | --- | --- | --- |
| `--grid-line-strong` | `rgba(16,185,129,0.1)` | `rgba(16,185,129,0.12)` | Vertical guide at 20% |
| `--grid-line-soft` | `rgba(16,185,129,0.05)` | `rgba(16,185,129,0.08)` | Vertical guide at 75% |
| `--grid-line` | `rgba(16,185,129,0.08)` | `rgba(16,185,129,0.1)` | Horizontal guide at 30% |

The badge `success` variant (`src/components/ui/badge.tsx`) uses Tailwind `emerald-500` (framework palette, not declared in source) with focus rings at `/20` and `/40`; `TimeDial.tsx` uses `emerald-500/30` for pressed presets. Artboards use the grid channel `#10b981` as the single accent; at full alpha it is an accent for indicators and small labels (contrast 7.6:1 on `#09090b`).

### Fixed colors (`@theme inline`, `src/styles/globals.css`)

| Token | Value | Note |
| --- | --- | --- |
| `--color-darker` | `#121212` | Declared, usage not audited |
| `--color-ligth` | `#f8f8f8` | Name spelled `ligth` in source |
| `--color-mindnight` | `#4b4b4b` | Name spelled `mindnight` in source |

### Opacity steps found in sources

`0.05`, `0.08`, `0.1`, `0.12` (grid), `/20`, `/30`, `/40` (emerald rings and pressed state), `/50` (`ring/50`, `disabled:opacity-50`, `dark:hover:bg-input/50`), `/80` (`secondary/80`), `/90` (`primary/90`); `/30` also appears as `dark:bg-input/30`. Artboards apply only these steps to the tokens above.

### Not tokens (recorded, not used by artboards)

- `TimeDial.tsx` literal sky colors `#3f7dcc`, `#0b1024`, `#ffc56e`, `#dfe8ff`, `zinc-*` utilities, `emerald-400`.
- `tooltip.tsx` uses Tailwind `gray-900/800/700/600`, not theme tokens.

## Typography

No font family is declared in the sources (no `--font-*` in `globals.css`, no font imports). The site inherits the Tailwind default sans stack.

| Role | Artboard value | Source |
| --- | --- | --- |
| Sans (fallback) | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` | Artboard fallback, not a project token |
| Mono (fallback) | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Artboard fallback; `font-mono` used in `TimeDial.tsx` |
| `text-xs` | 12px / 16px | Badge, tooltip, TimeDial presets (Tailwind default) |
| `text-sm` | 14px / 20px | Button, card description (Tailwind default) |
| `font-medium` | 500 | Button, badge |
| `font-semibold` | 600 | Card title |
| `tabular-nums` | — | Time readout in `TimeDial.tsx` |
| `uppercase tracking-widest` | 0.1em | TimeDial label |

## Spacing

Tailwind default scale, 4px per step (framework default). Steps used by components:

| Step | px | Where |
| --- | --- | --- |
| `0.5` | 2 | Badge `py-0.5` |
| `1` | 4 | Badge gap |
| `1.5` | 6 | Card header gap, small button gap |
| `2` | 8 | Button gap, badge `px-2` |
| `3` | 12 | Small button `px-3`, TimeDial padding |
| `4` | 16 | Button `px-4` |
| `6` | 24 | Card padding and gap, large button `px-6` |

Control heights: `h-8` 32px (sm), `h-9` 36px (default, icon `size-9`), `h-10` 40px (lg).

## Radius (`src/styles/globals.css`)

| Token | Value |
| --- | --- |
| `--radius` | `0.5rem` (8px) |
| `--radius-sm` | `calc(var(--radius) - 4px)` = 4px |
| `--radius-md` | `calc(var(--radius) - 2px)` = 6px — buttons, badges |
| `--radius-lg` | `var(--radius)` = 8px |
| `--radius-xl` | `calc(var(--radius) + 4px)` = 12px — card |

## Shadows

Named in components, values are Tailwind v4 defaults (not declared in source): `shadow-xs` (button, `0 1px 2px 0 rgb(0 0 0 / 0.05)`), `shadow-sm` (card), `shadow-lg` (tooltip). Artboards do not use shadows.

## Motion (`src/styles/globals.css`)

| Token | Value |
| --- | --- |
| `--animate-accordion-down/up` | 0.2s ease-out |
| `--animate-scroll-x` | 25s linear infinite |
| `--animate-shimmer` | 2s linear infinite |
| `--animate-float` | 3s ease-in-out infinite, translateY(-4px) |
| `.pause-animation` | `animation-play-state: paused` |

Button `transition-all` uses the Tailwind default (150ms). Any artboard motion must stop under `prefers-reduced-motion: reduce`.

## Page background (`src/styles/globals.css`, base layer)

`body` uses `bg-background text-foreground` plus three fixed 1px emerald guide lines: vertical gradients at 20% (`--grid-line-vertical-1`) and 75% (`--grid-line-vertical-2`), horizontal gradient at 30% (`--grid-line-horizontal`), each fading `transparent → line → transparent`.

## Components

### Button (`src/components/ui/button.tsx`)

- Base: inline-flex, gap 8px, `rounded-md` (6px), `text-sm font-medium`, `disabled:opacity-50`.
- Focus: `focus-visible:border-ring ring-ring/50 ring-[3px]` — 3px ring `#d4d4d8` at 50%.
- Variants: `default` primary fill, hover `/90`; `secondary` `#27272a`, hover `/80`; `outline` border, dark `bg-input/30`, hover `bg-input/50`; `ghost` hover `accent/50`; `destructive`; `link`.
- Sizes: default `h-9 px-4`, `sm` `h-8 px-3`, `lg` `h-10 px-6`, `icon` 36×36.

### Badge (`src/components/ui/badge.tsx`)

- `rounded-md border px-2 py-0.5 text-xs font-medium`, same 3px focus ring.
- Variants: `default`, `secondary`, `destructive`, `success` (emerald), `outline`.
- `success` uses `text-white` on emerald in source (about 2.5:1, below AA for small text). `system.html` renders it with `#18181b` text instead, and the artboards do not use it.

### Card (`src/components/ui/card.tsx`)

- `bg-card border rounded-xl py-6 shadow-sm`, gap 24px; header/content/footer `px-6`.
- Title `font-semibold leading-none`; description `text-sm text-muted-foreground`.

### Separator (`src/components/ui/separator.tsx`)

- `bg-border`, 1px, horizontal or vertical.

### Time of day control (`src/components/room/TimeDial.tsx`, `src/lib/room/day-cycle.ts`)

- Native range is the accessible path (`0–24`, step `0.25` h, `aria-valuetext` "HH:MM, phase"); clock face adds wheel and drag; preset buttons use `aria-pressed`.
- Phases: dawn 05:00–07:00, day 07:00–16:30, sunset 16:30–19:30, night otherwise.
- Presets: Day 13:00, Sunset 17:30, Night 23:00.
- Dial geometry: noon at top, midnight at bottom, clockwise.
