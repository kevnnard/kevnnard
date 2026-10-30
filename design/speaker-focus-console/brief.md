# Speaker focus console

Three production directions for the existing `/world` speaker close-up, inspired by the real gentle-stream TUI: title/style, block spectrum, state and keyboard footer. The schematic wall/speakers are original inline SVG context, not a captured GPU rendering. No private screenshot is shipped.

Use design/system.md zinc/emerald channels and system mono. Glass uses background #09090b at30% plus a4px backdrop blur; fine foreground borders at20%, no shadow/glow/distortion. Native buttons/sliders remain clear at44px targets. All demo bars/waves are illustrative, never claimed to be actual music measurements. The chosen implementation must use the Web Audio analyser of the actual local track, stop frame work when paused/hidden and respect reduced motion.

Space: play/pause. N: next. P: previous. +/-: volume. Esc: leave focus, keep playback. Do not intercept native slider/editable/button shortcuts or the terminal. Listening range uses semantic House→Initial view endpoints; geometry must ensure nearby exterior remains audible at minimum and the initial actual camera remains audible at maximum. Neither endpoint is a zero-gain cutoff at its target. Actual metres are not invented in the design.

## Directions
1. Wall console — recommended. Compact, centered, tall enough for the spectrum; settings sit beneath the transport.
2. Split console — live spectrum and transport beside always-visible volume/range.
3. Spectral ribbon — lower height and wider span, leaving more bare wall above/below.

## Token self-check
Colors: #09090b/#18181b/#27272a surfaces; #fafafa foreground; #d4d4d8 and #a1a1aa secondary/focus; #10b981 emerald grid accent. White/black alpha steps20/30/40/50/80; spectrum opacity80. No rose palette is copied from the external TUI. Typography only ui-monospace/SFMono-Regular/Menlo/Consolas/monospace, per system fallback. Radius4/6/8/12px. The console and original schematic use only the project token colors. No external assets, fonts, scripts or image URLs.
