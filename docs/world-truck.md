# The dream truck in /world

The owner's dream truck, a Ford F-150 Raptor, is parked nose out in the house's garage. The garage grew to hold it and works as a detailing bay. Click the truck to get a cinematic close-up and its card (odd/tasks/dream-truck.md, T1 and T2).

Ford and Raptor are trademarks of Ford Motor Company. This site has no affiliation with Ford.

## Where things live

| What | File |
| --- | --- |
| Model | `public/world/models/dream-truck.glb`, built by `scripts/prepare-truck.mjs` |
| Garage size, open door, roller door curtain | `src/lib/world/house.ts` (`HOUSE.garage`, `GARAGE_SIDE`, `garageDoorCurtain`) |
| Garage inside, door, nature clearing | `src/lib/world/garage.ts` |
| Truck scale, parking spot, click box, card copy | `src/lib/world/truck.ts` |
| Close-up camera and garage reveal | `src/lib/world/truck-shot.ts` |
| LED grid, side bars, lights, door timing | `src/lib/world/garage-lights.ts` |
| Truck in the scene | `src/components/world/Truck.tsx` |
| LEDs and lights in the scene | `src/components/world/GarageLights.tsx` |
| Card | `src/components/world/TruckCard.tsx`, `truck-card.css` |
| Credit (CC BY-NC 4.0, Outlaw Games™) | `public/world/credits.json` |

## The garage

| | Before | Now |
| --- | --- | --- |
| x | -3.1 to -1.25 | -3.8 to -1.25 |
| z | -2.45 to 0.55 | -2.75 to 2.85 |
| Wall height | 1.45 m | 1.95 m, the same as the main house |
| Door | 1.38 × 1.15 m, sectional, closed | 2.08 × 1.78 m roller door, open by day |
| Apron | z 0.55 to 2 | z 2.85 to 3.65, on the grass |

The garage now reaches past the pad, so it stands on its own plinth from the grass up. A short wall closes its right side where it runs past the main house's front. Its back is flush with the house. The left eave is 0.1 m, so it stays clear of the yard's nearest tree. `clearOfGarage` removes the tufts, flowers and bush that the seeded layout had put under the new garage and apron. No tree moves, and the island layout, the pad, Cherry's spots, the mailbox, the sign and the path stay where they were. `HOUSE_FOCUS` is pinned to its old x, so the home view and the cutaway are unchanged.

## The truck's scale

The model is authored at true scale: 5.9 m bumper to bumper, 1.97 m tall and 2.40 m wide at the mirrors. True scale cannot fit a house whose walls are 1.95 m tall. The truck is shown at 0.82, which is the largest scale the grown garage can take:

- Size at that scale: 4.9 m long, 1.62 m tall, 1.97 m at the mirrors.
- Door width: the mirrors clear the 2.08 m door by 5 cm on each side.
- Door head: 0.16 m above the roof.
- Depth: the nose stops 0.25 m before the door.

A scale step of 0.02 more no longer fits.

## Close-up

- **Eye:** 25° off the nose toward the left yard, 6.6 m out, 1.1 m above the garage floor. That is about bonnet height, so the shot is low.
- **Lens:** fov 34. The whole truck sits left of the card at 1100 to 1920 px wide.
- **Reveal:** while the shot plays, the garage's front wall (with its corner post, lantern and roller door), its left wall and its roof dissolve (`TRUCK_REVEAL`).

## Detailing bay

- **Ceiling grid:** a honeycomb LED grid hangs 1.88 m above the floor. It is 133 tubes plus a frame, in one draw with the side bars.
- **Side bars:** two low LED bars run along the side walls, 0.62 m above the floor and under the window sills.
- **Light colour:** daylight white, about 6000 K.
- **Spots:** two from the ceiling and two from the side bars, all decay 0 and no shadows. Each spot's cutoff stops short of the main room and the yard. Area lights are not used, for the same reason as in `lights.ts`.

| When | Lights | Door |
| --- | --- | --- |
| Truck close-up | Showroom level, at any hour | Up |
| Night, 18:00 to 05:59 | 0.45 | Rolls down |
| Day | Off | Up |
| Master power off | Off, like the display cases | Unchanged |

The lights ramp in about 0.8 s and the door rolls in about 1.5 s. Reduced motion jumps straight to the end.

## Rebuild the model

```sh
cp ~/Downloads/ford_f150_raptor.glb node_modules/.cache/world/dream-truck-source/ford-f150-raptor-original.glb
GLTF_TRANSFORM_CLI=$(cat /tmp/gltfcli-path) node scripts/prepare-truck.mjs
```

The command checks the source's sha256 before it builds. The output is deterministic. When the bytes change, update the `dream-truck.glb` entry in `credits.json`.
