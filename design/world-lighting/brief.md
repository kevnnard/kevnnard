# World lighting settings — brief

Feature: `odd/tasks/stylized-house.md` (S17). Design only; no production code.

## User request (verbatim)

> vale podemos integrar lucesd para que solo se pprendan en la noche tipo 6:00 pm hasta las 5:59 am es posible ? detras del televisor en mi stupe mira como lo hace bruno pero adiconal ponngamos laparas laterales en la mesa del setupp estas colores se van a pponer configurar creemo con genntel degsign a la dechea de la pannnntal un panel de configracion parecido al de modificar el dia pero ppdoemos ncocngurdad la eschean y irtemoa agregando mas configracionnes rright /

## Interpreted requirements

- Night-only gate on simulated time from the day controller: lights may be on when the hour is >= 18:00 or < 06:00; always off from 06:00 through 17:59.
- Lights: TV backlight (behind the TV), setup backlight (behind the monitor, Bruno Simon style), left and right desk lamps on the setup desk.
- Each light: enabled switch, color, intensity. Daytime shows a visible "off · daytime" state; disabled lights stay off at night.
- Right-hand scene settings panel visually close to `design/day-cycle-controller/03-compact-console.html`; lower-left day controller stays.
- Built to grow: new scene settings are added as sections. No future options are shown as working controls.
- Collapse, responsive mobile layout, keyboard access.

## Artboards

| File | Layout | Tradeoff |
| --- | --- | --- |
| `01-compact-accordion.html` | Console chassis, collapsible sections, one light open at a time | Closest to the time console, smallest; one light visible at a time |
| `02-rail-detail.html` | Section rail + light list + full editor | Scales best with more sections; widest, one extra navigation level |
| `03-grouped-cards.html` | Cards per room zone, all controls visible | Fastest color matching; tallest, furthest from console look |

## Conventions

- UI colors and fonts use only `design/system.md` tokens. Light swatch colors (`#7c6cff`, `#22d3ee`, `#ffb36b`) are editable scene data, not theme colors.
- The room is a schematic SVG outline, not the live 3D render.
- Each artboard has boundary previews at 17:59, 18:00, 05:59 and 06:00, and a "Copy as prompt" button with the chosen values.
