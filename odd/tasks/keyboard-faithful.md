# Faithful NuPhy Air75 V2
Rebuild the desk keyboard in /world so it matches the owner's real NuPhy Air75 V2: exact 84-key 75% layout and widths, legends on every cap from a texture atlas, the real case, caps and side light bar.

## Specs
S1. "el teclado si me gusta pero sasbes que no me gusta el modelo deberia ser fiel alreal podemos crearle la tetura con la uv real eso lo sacas facil de la web mucho que se tarda else worker del tecaldo yy puede ser mejor la verdad"
S2. "aja y como que te trabaas que pedo ?" (wants speed).

## Tasks
T1 [S1] DONE — Procedural rebuild from official references (nuphy.com Air75 V2 page and photos): exact layout/widths, legend atlas texture mapped per cap UV, case, colours, side light bar; keep the card, hitbox and camera from keyboard-card T1 working.

## Log
L2. Done by mw4gr94t-m-ybsr: keyboard-layout.ts (84 caps, real widths, legends, atlas cells), black V2 colours from the Amazon B0CMX8SLF6 main photo (mint Esc, coral Enter, yellow space, grey mods), short side bars by the Esc row, prebaked legend atlas public/world/keyboard/keyboard-legends.webp (2048x768, 19,944 B) on a one-draw decal; 9,454 tris. Also applied the coffee CoffeeHitbox and CoffeeMug lines in Setup.tsx. nuphy.com blocked by a bot check. Parent re-ran: 1000 pass / 0 fail / 1 skip, Biome, git diff --check. Not seen live: legend legibility, decal z-fighting.
L1. The product card is committed (f91f6b4). Sketchfab has only "NuPhy Air 75 Scan" by orels1 (uid 9422575c30974e3ba542ea8e1e8e0275, CC BY, ~1M faces photogrammetry, 8k texture): rejected as a source (soft caps, needs full retopology); a clean procedural rebuild with a legend atlas is sharper and lighter. Official reference: https://nuphy.com/products/air75-v2 (as in stylized-house L47).
