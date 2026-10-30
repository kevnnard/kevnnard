# World speaker music (S1-S5)

The two shelf speakers in `/world` play five local, generated lo-fi loops.
How far away you hear them depends on the listening range, which by
default covers the whole house. The audio files, generator, credits and
asset tests belong to T1 (`public/world/audio/`). This page covers playback
and controls (T2).

| Track | Genre | Loop |
| --- | --- | --- |
| Cafe Drift | Cafe lo-fi | 120.0 s |
| Ambient Focus | Ambient focus | 126.3 s |
| Velvet Jazz | Velvet jazz | 114.3 s |
| Soft Circuit | Soft chill electronic | 117.1 s |
| Midnight Code | Midnight lo-fi | 123.1 s |

## Controls

- **One click on a speaker** plays or pauses the music. The click waits
  280 ms (`CLICK_DELAY`) for a second click before it acts.
- **A double click on a speaker** focuses the speakers. It never plays or
  pauses as well: the second click cancels the pending toggle, and quick
  clicks after it are ignored. Touch screens and keyboards use the
  **Focus speakers** button.
- A speaker click only counts from inside the room, once the cutaway has
  removed the walls, and only if no setup part is in the way. This is the
  same rule the screens use. Drags never count. Each cabinet has a
  transparent hit box built from its own merged parts (`SPEAKER_BOXES`).
  The geometry itself is unchanged.
- **World buttons**: **Play music** / **Pause music** and **Focus speakers**.
  Focusing doesn't start playback.
- **Speaker close-up**: **Exit speakers** at the top left and the split
  console on the wall between the speakers (see "Console" below). It isn't
  a dialog. To leave, use Exit or Esc. The camera returns to its saved pose (instantly with reduced motion)
  and keyboard focus returns to Focus speakers. Leaving does not pause the
  music: it fades as the camera moves away.
- Previous and next wrap around the list. A new track starts at its loop
  start. If the music was paused, it stays paused.
- In the close-up, the header is inert and invisible. The clock and the lights
  panel are hidden through `world-terminal-focus` (visibility only), like the
  other close-ups, and stay mounted as direct children of the world
  container. The terminal, portrait and speaker close-ups never open
  together. Only the terminal reports camera arrival.

## Playback (`src/lib/world/speaker-music.ts`)

- **Music enabled on entry.** After **Enter world** and once the scene and listening range are ready,
  the saved music preference starts playback (enabled by default). A saved
  pause stays paused. If autoplay is blocked, a trusted gesture unlocks audio
  and a bounded fallback respects the gesture's own transport action. See
  [music entry](world-music-resume.md) and [saved settings](world-persistent-settings.md).
  The first playback request fetches `/world/audio/manifest.json` and checks it. Every listed id,
  title, genre, local `/world/audio/<id>.m4a` file, finite duration, loop
  inside the duration, size and sha256 must be present, or a readable error
  names the problem. Only then does it fetch and decode the current track.
  Opening the audio context inside the click, which Safari requires, fetches
  nothing and makes no sound.
- **Web Audio, not `<audio>`**: one `AudioBufferSourceNode` with `loop` set
  to the manifest's `loopStart` / `loopEnd` (1 s to duration − 1 s). If the
  decoded length differs from the manifest by more than 0.25 s, the track is
  refused rather than rescaled or played whole. The 1 s of wrapped audio on
  each side covers an AAC decoder's few frames of priming shift.
- At most two decoded buffers are kept: the current track and the previous one.
- Pause keeps the exact position inside the loop, and Play resumes from it.
  Starts fade in from zero over about 2 s; stops keep a short 0.12 s fade.
- Every action starts a new epoch, and switching tracks aborts the other
  fetches (`AbortController`). A fetch or decode that finishes after a pause,
  track change, hidden tab or unmount never starts a source. Unmounting stops
  the source, aborts requests and closes the context.
- A hidden tab stops the source but remembers that you want music. When the
  tab is visible again, playback resumes. If the browser keeps the context
  suspended, the bar reports it as blocked and asks for a new click.
- Errors (missing list, no Web Audio, undecodable AAC, blocked playback)
  appear as text. Public methods never reject.

## Console (speaker-focus-console T3)

The close-up's console follows the selected artboard
`design/speaker-focus-console/02-split-console.html`, rebuilt in React
(`SpeakerBar.tsx`, `speaker-bar.css`) with the tokens in `design/system.md`:
zinc glass at 30 % with a 4 px blur, a 20 % border, an emerald accent and
mono type. There is no solid fill, shadow or distortion.

- **Layout**: the spectrum, track, `01 / 05`, status and transport
  (**← P**, **Pause/Play Space**, **N →**) are on the left. **Volume** and
  **Listening range** are always visible on the right. On phones they stack.
  In every close-up the cabinets sit at 5–13 % and 87–95 % of the width, so
  the console stays within 70 vw, between them. On phones the cabinets fill
  the middle band of the height (47–53 %), so the stacked console ends
  above it. Every control is at least 44 px.
- **Spectrum**: the real FFT of a Web Audio `AnalyserNode` (512 points,
  48 log-spaced bars), not random or simulated bars. The analyser exists
  only after the first Play, in the existing graph: source → fade → volume
  → analyser → distance level → panner. The spectrum follows the volume but
  not the distance. A frame loop draws it at 20 Hz (clamped to 15–30 Hz),
  but only while the console is mounted, the music plays, the volume is
  above zero, the tab is visible and motion is allowed. Otherwise the bars
  rest at zero, and pausing, hiding the tab or unmounting cancels the loop.
  With reduced motion the status dot and text are the indicator.
- **Keys** (only during the close-up): Space plays or pauses, `n` next,
  `p` previous, `+`/`=` and `-` change the volume by 5 %, and Esc leaves.
  Fields, sliders, selects, editable text and frames keep all their keys
  (the sliders keep their arrows). Buttons keep Space. Modifier keys and
  key repeats are ignored. The keydown event is read as is, never copied.
- **Volume**: 0–100 %, 50 % by default. It is a gain separate from the
  distance fade, clamped to 0..1; non-finite values are ignored.
- **Listening range** (`src/lib/world/speaker-range.ts`): from **House** to
  **Initial view**, Initial view (100 %) by default. Both ends are measured:
  - House: the farthest point of the house footprint from the pair, from
    the ground to the ridge. The footprint covers the roof overhang, porch
    and driveway, so it includes the near exterior. This is 5.9 m.
  - Initial view: the pair's distance from the guide's home pose
    (`guidePose`) for the view the scene opened with. That is 28.8 m at
    1440 × 900 and 40.5 m at 375 × 812. It is not the canvas's first
    camera at (20, 14, 20), which is 31.7 m away.
  - The range is measured once, when the scene is ready. Later camera
    moves and resizes don't change it.
  - The fade is speaker.ts's own curve, stretched so that the chosen reach
    sits at half level. Everything inside the reach hears at least half,
    and it goes silent past 1.6 × the reach. At Initial view the starting
    camera hears the music at half level. At House every corner of the
    house does.
  - Changing the range re-levels the music at once from the last listener
    position, even if the camera doesn't move. Labels show the endpoint
    names and the measured metres only.
- Volume, range and explicit play/pause intent survive reloads in validated
  localStorage records. Setting volume or range never creates the audio
  context or fetches anything.

## Space (`src/lib/world/speaker.ts`)

- The pair is a single source at the midpoint between the two cabinets
  (x −0.90, y 1.83, z −1.28), facing into the room. An equal-power
  `PannerNode` handles only panning (`rolloffFactor` 0).
- Distance is the only attenuation: without a listening range, a smooth
  fade from full level within 1.5 m of the line between the cabinets to
  silence at 6 m (`SPEAKER_AUDIO`, `speakerGain`, unchanged). The console's
  range stretches the same curve. Changes are smoothed over 80 ms. It doesn't depend on the night
  lights or the master switch.
- The listener follows the camera's position, forward and up, updated from
  rendered frames only, and only when the camera has moved. The scene never
  renders extra frames for audio.

## Speaker close-up (`speakerFocus`)

The camera faces the cabinets at their height, centred between them, from
inside the room and clear of the desk and chair. It fits both cabinets within
90 % of the view: 1.9 m away at 1920 × 1080 and 2.1 m at 1440 × 900, with
the guide's 35° lens.

**Phones see the speakers through a wider lens.** From inside the house, a
35° lens can't fit both cabinets on a portrait phone (measured: best
achievable 117 % of the view at 375 × 812). Narrow views back up to 3.5 m and
then widen the lens only as much as the cabinets need: 63.8° at 375 × 812
and 390 × 844, capped at 68°. The speakers, house and guide are unchanged.

The lens that was active before entry is saved once and restored exactly on
Exit, unmount or any switch, whether 35° or something else. Resizing in the
close-up refits the pose and lens. The terminal and portrait close-ups always
use the original lens.

## Checks

`tests/world/speaker-focus.test.ts` covers:

- Hit boxes against the merged parts.
- The distance curve.
- Real three.js cameras fitting both cabinets at 375 × 812, 390 × 844,
  1440 × 900 and 1920 × 1080, with no house obstacle in the way.
- Minimal lens widening, the cap and lens restoration.
- Click arbitration on a fake clock.
- The close-up wiring.

`tests/world/speaker-music.test.ts` runs the real manifest and a fake
`AudioContext`/`fetch`, checking:

- No request before an action.
- The declared loop bounds for each real track.
- Pause offset and resume.
- Next while paused.
- Rapid switches, and pause during decode.
- Dispose.
- The two-buffer cache.
- Errors.
- Panning and level.
- Visibility handling.
- The console graph order, volume clamping, re-levelling on a range change
  from the last listener, the analyser read only while a source sounds
  (zeros when paused, hidden or muted), and the settings kept across
  dispose with no context or request.

`tests/world/speaker-range.test.ts` checks both range ends against the
house footprint and the guide's home pose at 1440 × 900 and 375 × 812,
audibility inside each end and silence beyond, and the legacy fade at the
legacy reach. `tests/world/speaker-console.test.ts` checks the keys (with
an event whose fields are inherited getters), the bars from analyser bins,
and the frame loop's rate, single pending frame and cancel on stop.

## Limits

There is no browser, GPU or listening check yet. The tests use fakes, so
they don't show that a real browser decodes the AAC files, that the loops
sound seamless, that panning and the fade feel right, or that Safari's
unlock works. The console's look on the wall, the live spectrum, the keys in
a real browser and the console's clearance from the cabinets also still need
a check in a browser. On phones, the wider lens and the music's level at 3.5 m
(about 55 %) also need a look. Please check at
`http://localhost:4321/world`.
