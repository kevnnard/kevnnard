# Garden sign
Redesign the "OPEN TO WORK" garden sign in /world: show availability and the owner's role, rotate a few messages on its face, and make it clickable for a cinematic close-up with a profile and contact card. Designs first (gentle-design), then implementation.

## Specs
S1. "quiero que para el letreo de open work con gentel design disnem,os un mejor carteal para poder mostrar mejor algo ahi es posible ?"
S2. Owner's choices (multi-select): "Disponibilidad + tu rol", "Que se pueda hacer clic", "Algo que cambie solo".

S3. "pues creo que 1 por que igual mi monitor piricpal meustra cosas que soy como mi prfalio projectos ecpereica etc aqui es como mas compacto rapido avisos cosas asi seria el 1 o que crees ??" (chooses 01-wooden-board; the sign is a quick, compact notice; the monitor holds the full portfolio).

## Tasks
T1 [S1, S2] DONE — Three design directions under design/garden-sign/ (sign face + its click card), on the canvas for the owner to choose.
T2 [S1-S3] DONE (gentle-ai-worker; not committed, visual check pending) — Implement 01-wooden-board: painted board with name/role, status lantern (green open / amber busy, BACK SOON), flip-tile rotating line; click = cinematic close-up + a COMPACT card (availability, role, one-line summary, core stack chips, LinkedIn/GitHub/CV EN/ES, "See my portfolio" -> monitor); no "Now" block; email and city hidden until the owner gives them.

## Log
L4. T2 implemented (docs/world-garden-sign.md): GARDEN_SIGN.status ("open" | "busy") replaces the free text and its fitting; garden-sign.ts holds the copy, the 3 s flip timing (0.3 s fold, 9 s with no flip under reduced motion), the 2048x928 face layout, the lantern glow (night gate + master power, light always mounted) and SIGN_PROFILE (summary and CV links from portfolioBuffers().about, LinkedIn and GitHub from CONTACT_LINKS, core chips from Skills.astro, email and city null). sign-shot.ts: target (1.74, 0.47, 2.70), 2.3 m, 6 deg down, 24 deg toward the lantern side (clears the bush at 1.71, 4.57), fov 28; "sign" is a DeskItemId. SignCard: See my portfolio runs WorldApp's enter (terminal). docs/world.md still documents GARDEN_SIGN.text (outside T2's edit surface).
L3. Owner chose 01-wooden-board (S3); 02 and 03 are alternatives. Parent agreed and set the card compact (drop the "Now" roles block, add "See my portfolio" to the monitor); "Based in" message and Email action omitted until provided.
L1. Today: a plank board in the front garden (src/lib/world/garden.ts GARDEN_SIGN: text "OPEN TO WORK", board #fff4e3, ink #2b211c, accent #b9675a; Garden.tsx), not interactive. Role, contact and stack must come from the site's existing copy (no invented facts); unknown items stay labelled for the owner to fill.
L2. T1 designs: design/garden-sign/ with 01-wooden-board.html (painted plank, status lantern, flip-tile line), 02-neon-ticker.html (neon OPEN, amber LED ticker) and 03-eink-kiosk.html (e-ink kiosk, status pill, cross-fade). Each shows the sign in the garden (day/night, Open to work/Busy) and the click close-up with the side card. Sources: role/summary from src/components/page/AboutMe.astro and Main.astro, current roles from src/utils/experience.json, core stack from src/components/page/Skills.astro, LinkedIn/GitHub and CV links from Footer.astro and AboutMe.astro (via src/lib/world/terminal-content.ts). Not in site copy, marked "to fill": email and home city. Busy copy uses "BACK SOON" (the GARDEN_SIGN doc comment). No direction chosen yet.
L5. Owner: "Soy de Bogota Dc kevnnard.labs@gmail.com" -> SIGN_PROFILE.email "kevnnard.labs@gmail.com", city "Bogotá, Colombia", fourth flip line "Based in Bogotá" (tests updated RED 3 fail -> GREEN 1228 pass).
