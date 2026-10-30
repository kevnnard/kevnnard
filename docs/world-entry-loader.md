# World assembly entry

`/world` uses `design/world-entry-loader/03-world-assembly.html`, not the exploratory combined particle direction. The architectural drawing sits beside the heading, three preparation steps, real progress and an explicit **Enter world** action. On narrow viewports the drawing stacks above the text. There is no prototype slider or timed counter in production.

## Entry and controls

The scene stays mounted behind the opaque loader. Visual assembly lasts at least **2.5 seconds**, including cached loads. Presentation progress never exceeds real preparation progress; **Enter world** requires both real scene readiness and completion of that reveal. This is an intentional presentation delay, not network telemetry or an artificial download wait. Errors bypass the delay. The animation frame loop is cancelled on state changes and unmount. Canvas interaction and its accessibility subtree are inert until entry. The world header is hidden/inert; the clock and ScenePanel remain direct world children, mounted once ready, but hidden/inert until entry. Their state and the user's stored preferences are not reset. Enter moves keyboard focus to the world menu.

The entry action is ignored until the scene reports readiness with no error. It synchronously unlocks the existing audio context only when saved music intent is enabled. The existing resume binding starts only after entry, scene readiness and measured listening range. A saved explicit pause remains paused. Enter does not toggle or overwrite any preference.

A failed scene replaces the entry overlay with the existing static-portfolio fallback plus **Try again**. Retry reloads the page; it does not clear localStorage. A browser without WebGL keeps the existing fallback instead of loading Three.

## Readiness

`WorldScene.onProgress` supplies `WorldLoadState`; the UI has no independent fake resource counter. `world-load-presentation.ts` caps the displayed progress by elapsed reveal time without modifying scene readiness. See `world-loading-readiness.md` for the tracked resource groups, compilation/frame barrier and lifecycle checks. Progress describes completed preparation units, not downloaded byte percentage. Cached loads may advance immediately. A pending resource never becomes ready just because time passes. External video/documentation embeds, credits and the entire music playlist are not entry prerequisites.

## Verification limits

Source-level tests cover gate wiring, rendering structure and styles. Scene lifecycle tests use deterministic ports where no GPU is available. They do not establish the actual visual match, frame output, keyboard focus in a browser, Safari autoplay, audible playback or mobile layout. Browser/GPU/audio acceptance remains a human check at `http://localhost:4321/world`; the existing preview server is not restarted by this change.

## Smooth entry

After **Enter world**, the existing scene fades in over 1.4 seconds while the loader veil fades out over 0.9 seconds. A restrained emerald radial glow resolves over 1.6 seconds; HUD opacity settles over 1.1 seconds. Camera, renderer, frame barrier and settings are not restarted. There are no transition timers, JavaScript animation callbacks, new WebGL passes, particle systems, transforms or fullscreen blur. The veil becomes inert/aria-hidden immediately and visibility-hidden at completion, so its retained markup cannot capture input or screen-reader focus. Reduced motion reveals the world immediately without the decorative glow. The existing 2-second music fade begins through the existing entry/resume path only when saved music intent is enabled; a saved pause stays paused.
