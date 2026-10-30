# World entry loader

## Request
"ahora vamos a implementar como en bruno y cada trabajo de 3d un loader 1 a 100 bien bonito si quieres con desiign dame opcionens para ppoder generar ese loader por debajo cargamos dejamos todo listo para entrar al mundo que te parece ? buena idea no ? puede ser una opcion kevnnnard cargando letra a letras nose nuemors o generando en particulas algo sentcillo pero bien novedosos"

## Goal
Three lightweight, distinct entry directions for /world: letter-by-letter KEVNNARD, restrained particles and an assembling house. A calm transition from loading to a ready-to-enter state, using design/system.md zinc/emerald and system monospace. Keep the existing world, music preferences and static portfolio intact.

## Prototype boundary
These self-contained artboards simulate loading explicitly. Their counters are visual demonstrations, never production loading telemetry. No production changes or dependency installs in this design pass. Actual browser rendering is not available in this session.

## Implementation considerations, not implemented here
Production percentage must follow tracked loading milestones/resources and never claim 100% before critical scene assets and the first usable frame are ready. Current WorldScene onReady is called by Nature; that signal alone does not establish every nested Suspense/model is ready. Investigate the actual loaders before implementation. Network item completion is not byte progress or proof of GPU shader readiness. Do not wait for cross-origin YouTube/NestJS embeds, nor preload all five audio files. Offer Enter world after readiness (recommended), using that gesture for existing policy-compliant music startup and respecting stored pause. Report failures honestly with a retry route, not an indefinitely simulated counter. Motion remains decorative and has a reduced-motion alternative.

## Directions
1. Letterpress: strongest identity, most minimal visual cost.
2. Particle signature: the most distinctive, bounded small 2D particle field rather than an additional WebGL scene.
3. World assembly: architectural diagram and phase checklist, clearest explanation of what is preparing.
