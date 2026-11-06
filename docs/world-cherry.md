# Cherry in /world

Cherry is the owner's Miniature Pinscher, who has been with him for more than 19 years. In /world she stands in the front yard every morning. Click her to get a cinematic close-up and her card (odd/tasks/dog-rig.md, T3).

## Where things live

| What | File |
| --- | --- |
| Model (rigged, `idle` + `run` clips) | `public/world/models/cherry.glb`, built by `scripts/prepare-dog.mjs` + `.py` |
| Hours, spots, day pick, fade, size, card copy | `src/lib/world/cherry.ts` |
| Close-up camera | `src/lib/world/cherry-shot.ts` |
| Dog in the scene (mixer, fade, click) | `src/components/world/Cherry.tsx` |
| Card | `src/components/world/CherryCard.tsx`, `cherry-card.css` |
| Credit (CC BY 4.0, 3D Creator) | `public/world/credits.json` |

## Behaviour

- **When:** from 06:00 to 11:59 on the world clock. She stays out while her close-up is open.
- **Where:** one of four spots on open grass: `mailbox`, `front-lawn`, `stones` and `corner`. Each in-world morning picks the next spot. The pick is deterministic per day and never repeats the previous morning's spot. She stays put for the whole visit.
- **Fade:** about 1 s in or out. If the spot changes, she fades out first and then moves. Reduced motion skips the fade and holds her still.
- **Size:** 0.28 m at the withers and 0.41 m to the ear tips, roughly her real size.

## Rebuild the model

```sh
GLTF_TRANSFORM_CLI=$(cat /tmp/gltfcli-path) node scripts/prepare-dog.mjs
```

The command checks the source zip's sha256 before it builds. The output is deterministic. When the bytes change, update the `cherry.glb` entry in `credits.json`. `DOG_SLEEP=1` brings back the dropped sleep clip, but only for a Blender preview (`dog.preview.glb` in the cache). That build never ships.

## Adding her photos and videos

When the owner sends them:

1. Put them under `public/world/`.
2. Fill `CHERRY_STORY.media` in `cherry.ts`. Each entry is a `CherryMedia`: `kind`, `src`, `alt`, and optionally `poster` and `focus`.
3. Render the slot in `CherryCard.tsx`. Today the slot is `null` and the card renders nothing for it.
