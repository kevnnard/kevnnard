# The garage in /world: coming soon

The house's garage is closed, with a "Coming soon" sign on its roller door. Click the door to get a cinematic close-up and a short card (odd/tasks/dream-truck.md, T4).

The garage once held the owner's dream truck (T1 to T3). The truck, its model, its build script, its CC BY-NC 4.0 credit and the garage's showroom lights were removed in T4. The grown garage stayed.

## Where things live

| What | File |
| --- | --- |
| Garage size, door opening, roller door curtain | `src/lib/world/house.ts` (`HOUSE.garage`, `GARAGE_SIDE`, `garageDoorCurtain`) |
| Garage inside, door, nature clearing | `src/lib/world/garage.ts` |
| Door face, sign, night glow, click box, card copy | `src/lib/world/truck.ts` |
| Close-up camera | `src/lib/world/truck-shot.ts` |
| Cinematic move shared by every close-up | `src/lib/world/cinematic.ts` |
| Door state and timing | `src/lib/world/garage-lights.ts` |
| Sign painted on the door | `src/components/world/House.tsx` |
| Click target | `src/components/world/Truck.tsx` |
| Card | `src/components/world/TruckCard.tsx`, `truck-card.css` |

The internal inspect id is still `"truck"`, so the camera, cards and tests keep their wiring. Users only see "Garage" and "Coming soon".

## The garage

| | Original | Now |
| --- | --- | --- |
| x | -3.1 to -1.25 | -3.8 to -1.25 |
| z | -2.45 to 0.55 | -2.75 to 2.85 |
| Wall height | 1.45 m | 1.95 m, the same as the main house |
| Door | 1.38 × 1.15 m, sectional | 2.08 × 1.78 m roller door, always down |
| Apron | z 0.55 to 2 | z 2.85 to 3.65, on the grass |

The garage reaches past the pad, so it stands on its own plinth from the grass up. `clearOfGarage` keeps tufts, flowers and bushes off the garage and its apron. No tree moved. `HOUSE_FOCUS` is pinned to its old x, so the home view and the cutaway are unchanged.

## The sign

- A 0.9 × 0.24 m plate centred on the door, 1.2 m above the floor, just proud of the slats.
- Painted on a canvas in the site's tokens (design/system.md): `#09090b` plate, an emerald `#10b981` hairline, "COMING SOON" in `#fafafa` monospace.
- At night the lettering glows softly (emissive 0.45) next to the garage lantern. It is off by day and when the master power is off (`comingSoonGlow`).
- It belongs to the garage front's cutaway group, so it fades with the wall and the door.

## The close-up and the card

- The shot looks at the middle of the door from 5.5 m out in the front yard, 15 degrees off its left and 4 degrees down, with a 34 degree lens. Nothing dissolves.
- It uses the shared cinematic move: it starts from wherever the camera is, takes 3.8 s in and 3 s out, and reduced motion cuts straight to the shot. With the card open, the shot slides so the door stays left of the card.
- The card is in the same family as Cherry's and the sign's. It has the kicker "GARAGE", the title "Coming soon", one line ("Something special will park here soon.") and "Back to room", which gets focus when the card opens.
