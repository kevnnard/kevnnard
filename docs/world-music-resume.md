# World music: gentle entry and resume

Task: `odd/tasks/world-persistent-settings.md` T2 (S2). When the visitor
left the music on, coming back to `/world` should bring it in softly.

## Fades (`src/lib/world/speaker-music.ts`)

| Moment | Fade | Source |
| --- | --- | --- |
| Any start: first play, a new track, back from a hidden tab | from gain 0 up to 1, time constant 0.5 s (about 98 % at 2 s) | `START_FADE = 2` |
| Pause, track change, hidden tab | to 0 in about 0.12 s, then the source stops | `STOP_FADE = 0.12` |
| Dispose | immediate stop | unchanged |

Stops keep the short fade on purpose. A track change never overlaps two
sources for two seconds. Everything else is unchanged: buffers, aborts,
epochs, and the volume → analyser → distance → panner graph.

`getWanted()` reads the visitor's transport intent and changes nothing.
It is true after play, and a hidden tab keeps it true. It is false after
pause, a failed or blocked start, and dispose. `MUSIC_BLOCKED` is the
existing message for a start that the autoplay policy blocked.

## Resume (`src/lib/world/speaker-resume.ts`)

`bindMusicResume(music, target)` returns a cleanup. WorldApp calls it once
the world is ready, the listening limits are known and music is left on,
after the volume and reach are applied.

1. **One startup attempt.** It plays unless a start is already under way
   (joined, never restarted) or the player was explicitly paused.
2. **Blocked: wait for a gesture.** It retries only a start whose error is
   `MUSIC_BLOCKED` while nothing is wanted. List, decode and Web Audio
   errors are never retried.
   - On a trusted `pointerdown` or `keydown`, it calls `unlock()` inside the
     event, which resumes the context as Safari requires.
   - On a trusted `click` or `keyup`, it schedules one decision
     `CLICK_DELAY + 120` ms later.
3. **The decision re-checks first.** A Play music click, Space in the
   console or a speaker click (toggled by the click arbiter after
   `CLICK_DELAY`) may already have started the music, or a pause may have
   happened. In either case the decision does nothing, so the same gesture
   is never doubled or turned into a pause.
4. **Never intrusive.** Listeners are capture-phase and passive. They never
   call `preventDefault` or `stopPropagation` and change no shortcuts.
   There are no retry timers or loops and no muted-autoplay trick.
5. **Cleanup** removes the listeners and cancels the pending decision. It
   does not dispose the player; WorldApp's unmount still does that.

Only events with `isTrusted` count by default. The third argument
(`trusted`, `timers`) exists for tests, because Node cannot create trusted
events.

## Tests

- `tests/world/speaker-music.test.ts`: the start fade rises from zero over
  2 s on first start, track change and tab re-entry. Stops stay at 0.12 s.
  It also covers `getWanted` and the blocked message.
- `tests/world/speaker-resume.test.ts`: the real `SpeakerMusic` on a fake
  context. It covers allowed autoplay, blocked → gesture, synthetic events
  refused, no retry of other errors, joining a loading start, explicit
  pause, same-gesture Play/Space/speaker click, cleanup, dispose and hidden
  tabs.

Not verified here: real browser autoplay policies, audible fades and Safari
gesture timing. These need a browser session (T4).
