# Grounded walking camera

The `/room` overview is now a low walk in front of the house instead of an aerial orbit.
The user chose "Paseo a baja altura (recomendado)": "Mirás desde cerca del suelo y te
movés dentro de una zona acotada alrededor de la casa, sin atravesarla." After the first
version left an empty foreground, the zone was narrowed to a few steps just outside the
yard, facing the open cutaway, so the forest can stand close around it.

The PC and TV focus views, the room meshes and transforms, the terminal, the shared clock
and the time controllers are unchanged.

## Behavior

| Rule | Value | Source |
|------|-------|--------|
| Eye height | 2 units above the grass (y 1.85) | `EYE_HEIGHT`, `LEVELS.terrainTop` |
| Look range | 0.2 rad down to 1.45 rad up (about 83°) | `WALK.minPitch`, `WALK.maxPitch` |
| Walk area | Disc of radius 3, centered 16.5 units from the room center on the open −x/+z diagonal, so 13.5–19.5 units from it and outside the yard | `VIEW_ZONE` |
| Solids | Room, wing walls, door and windows, posts, wing roof, door canopy, carport roof | `ROOM_BOUNDS`, `PARTS`, `ROOF` |
| Clearance | 0.45 units from every solid | `WALK.bodyRadius` |
| Start | Fixed spot 18.5 units out on the same diagonal (−13.08, 13.05), facing the room cutaway | `VIEW_ZONE.home`, `homePose` |

- The camera height never changes: looking up or down only turns the view, so the camera
  can't go under the ground.
- A part blocks walking when its top is above waist height. Hedges, patio furniture and
  paving sit below the eye, so the camera passes over them.
- The walk area is conservative. The open room, the space under the door canopy and the
  carport count as solid, so walking never enters the house or clips the room's furniture.
- The look target sits 0.25 units ahead of the camera, closer than the clearance, so the
  target never enters a solid either. Both stay within `walkReach(WALK_AREA)` (about 19.7)
  of the world origin. No house solid is near the zone today; the blocker logic still
  applies if the zone changes.
- `VIEW_ZONE` in `src/lib/room/forest-view.ts` is the single definition of the zone. The
  walk area and the forest's `WALK_DISC` both read it, and the forest keeps every trunk
  base 1.2 units and every whole debris footprint 0.5 units outside it. The camera doesn't
  collide with scenery.
- The start position never depends on the screen. Only the aim does: on wide screens the
  camera looks left of the room by up to 35% of the half field of view, so the room sits
  right of center (NDC x −0.03 to 0.68 at 16:9) and the forest frames the left. Narrow
  screens look straight at the room center and crop its sides (portrait 9:16 spans NDC
  −1.09 to 1.05). Until the user moves, the aim follows resizes.
- PC/TV focus still uses `focusView` and `setLookAt`. Those cameras are inside the room and
  are not limited by the walk area. Stepping back returns to the last walk pose.

## Controls

| Input | Action |
|-------|--------|
| Drag (mouse, pen or one finger) | Look around |
| Wheel or two-finger pinch | Step forward or back, at most 0.6 units per event |
| W/S or ↑/↓ | Walk forward or back |
| A/D | Step left or right |
| ←/→ | Turn |
| Page Up/Page Down | Look up or down |

- Keys only work while the 3D view has focus. Tab to it, or click or tap it. Typing in the
  terminal or using any other control never moves the camera.
- In walk mode the canvas is focusable, has the `application` role, shows a focus outline
  and references the visible help text with `aria-describedby`.
- Pointer lock is not used, so touch and mouse work the same way.
- Held keys and pointers are released on blur, when the tab is hidden, when a focus view
  opens, and when the reduced-motion preference changes. The camera has no inertia.
- The canvas still renders on demand. Frames are requested only while a key is held, a
  pointer or wheel event arrives, or a scripted transition runs. Each frame step is capped
  at 0.1 s, and the first frame after a key press doesn't move, so resuming never jumps.

## Collision

`moveWithin` splits each move into sub-steps no longer than half the clearance. Each
sub-step tries the full move, then each axis alone, so the camera slides along walls and
the disc edge. Any input, including huge or non-finite values, moves at most one disc
diameter and never tunnels through a wall. An invalid start is moved just outside the
nearest blocker, or to a known clear spawn point.

## Code

| Piece | Path | Role |
|-------|------|------|
| Walk math | `src/lib/room/walk-camera.ts` | Pure area, collision, pose, home and view helpers. |
| Input | `src/components/room/WalkCameraControls.tsx` | Canvas listeners, keyboard frame loop, help text. |
| Scene | `src/components/room/RoomScene.tsx` | Builds the home pose and runs focus transitions with `CameraControls`, whose user input is disabled. |
| Shared zone | `src/lib/room/forest-view.ts` | `VIEW_ZONE`, view-frame placement and the room sight corridor shared with the forest. |
| Tests | `tests/room/walk-camera.test.ts`, `tests/room/forest-walk-seam.test.ts`, `tests/room/forest-view.test.ts` | Area, home framing with a real `PerspectiveCamera`, look limits, a direction and magnitude collision matrix (including a synthetic walled area), frame clamping, shared-zone identity and projected scenery composition. |

`overviewView`, `fitView` and `orbitLimits` in `camera.ts` are unchanged and still tested.
The scene no longer uses `orbitLimits` or `TARGET_BOUNDS`.

## Not verified

The browser hasn't been used. No GPU or browser evidence exists for appearance, start
composition, drag, touch or pinch feel, focus outline, help text placement on phones,
frame cost, or the animated transitions between focus and walk. Those transitions use
`CameraControls` interpolation and are not collision-checked.
