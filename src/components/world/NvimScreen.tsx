import { useThree } from "@react-three/fiber";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from "three";
import type { Vec3 } from "@/lib/world/camera.ts";
import {
  EDITOR_ROWS,
  type EditorEnv,
  type EditorState,
  editorStatus,
  isEditorKey,
  leavesEditor,
  nvimContent,
} from "@/lib/world/nvim-editor.ts";
import {
  NVIM_COLORS as C,
  highlight,
  PREVIEW_LAYOUT as L,
  PREVIEW_EXCERPTS,
  PREVIEW_ROWS,
  PREVIEW_TICK_MS,
  type PreviewFrame,
  previewFrame,
  previewKey,
  previewStill,
  previewTop,
  statusParts,
} from "@/lib/world/nvim-preview.ts";
import { portfolioBuffers } from "@/lib/world/terminal-content.ts";
import { MONO } from "@/lib/world/terminal-layout.ts";
import experience from "@/utils/experience.json";
import projects from "@/utils/projects.json";
import "./nvim-screen.css";

/** The easter eggs' material: the homepage's own JSON and copy. */
export const NVIM_CONTENT = nvimContent(
  portfolioBuffers({ projects, experience }).about,
);

/** Texture pixels per page pixel: legible from the room, cheap to upload. */
const RESOLUTION = 1.5;

const basename = (file: string) => file.slice(file.lastIndexOf("/") + 1);

/**
 * Paints one preview frame edge to edge: bufferline, numbered buffer with
 * highlighted code and the cursor, lualine-like statusline, command line.
 */
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  frame: PreviewFrame,
) {
  const { width: W, height: H } = L;
  ctx.setTransform(RESOLUTION, 0, 0, RESOLUTION, 0, 0);
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Bufferline: one tab per excerpt, the current one lit.
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, L.tabline);
  ctx.font = `${L.font}px ${MONO}`;
  let x = 0;
  for (const [i, excerpt] of PREVIEW_EXCERPTS.entries()) {
    const label = ` ${basename(excerpt.file)} `;
    const w = ctx.measureText(label).width + 12;
    if (i === frame.excerpt) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(x, 0, w, L.tabline);
      ctx.fillStyle = C.accent;
      ctx.fillRect(x, 0, w, 2);
    }
    ctx.fillStyle = i === frame.excerpt ? C.fg : C.muted;
    ctx.fillText(label, x + 6, L.tabline / 2);
    x += w;
    if (x > W) break;
  }

  // Buffer.
  const top = previewTop(frame);
  const advance = ctx.measureText("M").width;
  const y0 = L.tabline + 4;
  for (let r = 0; r < PREVIEW_ROWS; r++) {
    const row = top + r;
    const y = y0 + r * L.lineHeight + L.lineHeight / 2;
    const current = row === frame.cursor.row;
    if (current) {
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, y - L.lineHeight / 2, W, L.lineHeight);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = current ? C.accent : C.line;
    if (row < frame.lines.length) {
      ctx.fillStyle = current ? C.accent : C.comment;
      ctx.fillText(String(row + 1), L.gutter - 10, y);
    } else {
      ctx.fillStyle = C.line;
      ctx.fillText("~", 12, y);
    }
    ctx.textAlign = "left";
    if (row >= frame.lines.length) continue;
    let cx = L.gutter;
    for (const token of highlight(frame.lines[row])) {
      ctx.fillStyle = C[token.kind];
      ctx.fillText(token.text, cx, y);
      cx += token.text.length * advance;
    }
    if (current) {
      const at = L.gutter + frame.cursor.col * advance;
      if (frame.mode === "INSERT") {
        ctx.fillStyle = C.fg;
        ctx.fillRect(at, y - L.lineHeight / 2 + 2, 2, L.lineHeight - 4);
      } else if (frame.mode === "NORMAL") {
        ctx.fillStyle = C.fg;
        ctx.fillRect(at, y - L.lineHeight / 2 + 1, advance, L.lineHeight - 2);
        ctx.fillStyle = C.bg;
        ctx.fillText(frame.lines[row][frame.cursor.col] ?? " ", at, y);
      }
    }
  }

  // Statusline: mode, branch, file | filetype, line:col.
  const status = statusParts(frame);
  const sy = H - L.command - L.status;
  const mid = sy + L.status / 2;
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, sy, W, L.status);
  ctx.font = `bold ${L.font}px ${MONO}`;
  const modeWidth = ctx.measureText(` ${status.mode} `).width + 8;
  ctx.fillStyle =
    frame.mode === "NORMAL"
      ? C.accent
      : frame.mode === "INSERT"
        ? C.fg
        : C.plain;
  ctx.fillRect(0, sy, modeWidth, L.status);
  ctx.fillStyle = C.bg;
  ctx.fillText(` ${status.mode} `, 4, mid);
  ctx.font = `${L.font}px ${MONO}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(` ${status.branch}`, modeWidth + 4, mid);
  const branchEnd =
    modeWidth + 4 + ctx.measureText(` ${status.branch}`).width + 12;
  ctx.fillStyle = C.fg;
  ctx.fillText(basename(status.file), branchEnd, mid);
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.fillText(`${status.filetype}  ${status.position} `, W - 4, mid);

  // Command line or message.
  ctx.textAlign = "left";
  ctx.fillStyle = frame.command ? C.fg : C.muted;
  ctx.fillText(frame.command || frame.message, 6, H - L.command / 2, W - 12);
}

const noRaycast = () => undefined;

/**
 * The idle Neovim on the portrait screen (portrait-neovim T1): a canvas
 * texture on the screen plane, like the ultrawide's terminal. It redraws
 * on a PREVIEW_TICK_MS clock, and uploads only when the frame changed,
 * while `animate` holds and the tab is visible; otherwise it rests on its
 * last frame. Reduced motion shows one still frame. It never takes the
 * pointer: PortraitScreen's hit area does.
 */
export function NvimPreview({
  position,
  rotationY,
  size,
  visible,
  animate,
  reducedMotion,
}: {
  position: Vec3;
  rotationY: number;
  size: readonly [number, number];
  visible: boolean;
  animate: boolean;
  reducedMotion: boolean;
}) {
  const { invalidate } = useThree();
  const { material, context } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(L.width * RESOLUTION);
    canvas.height = Math.round(L.height * RESOLUTION);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: texture });
    return { material, context: canvas.getContext("2d") };
  }, []);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );

  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Play time only advances while animating, so the loop resumes in place.
  const clock = useRef({ elapsed: 0, key: "" });
  useLayoutEffect(() => {
    if (!context || !material.map) return;
    const map = material.map;
    const draw = (frame: PreviewFrame) => {
      const key = previewKey(frame);
      if (key === clock.current.key) return;
      clock.current.key = key;
      drawPreview(context, frame);
      map.needsUpdate = true;
      invalidate();
    };
    if (reducedMotion) {
      draw(previewStill());
      return;
    }
    draw(previewFrame(clock.current.elapsed));
    if (!animate || hidden || !visible) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      clock.current.elapsed += now - last;
      last = now;
      draw(previewFrame(clock.current.elapsed));
    }, PREVIEW_TICK_MS);
    return () => clearInterval(timer);
  }, [context, material, animate, hidden, visible, reducedMotion, invalidate]);

  return (
    <mesh
      position={position}
      rotation={[0, rotationY, 0]}
      material={material}
      visible={visible}
      raycast={noRaycast}
    >
      <planeGeometry args={[size[0], size[1]]} />
    </mesh>
  );
}

/** Browser frames per second, sampled while the editor is open. */
function useFps() {
  const fps = useRef(0);
  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      frames += 1;
      if (now - since >= 1000) {
        fps.current = (frames * 1000) / (now - since);
        frames = 0;
        since = now;
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return fps;
}

/** What the live region says: the mode, then the latest output. */
function announcement(state: EditorState) {
  const mode = `${editorStatus(state).mode} mode.`;
  if (state.panel)
    return `${mode} ${state.panel.title}: ${state.panel.lines.join(" ")} Press Esc to close.`;
  if (state.picker)
    return `${mode} Telescope, ${state.picker.results.length} results${state.picker.results[0] ? `, first: ${state.picker.results[state.picker.selected]?.label}` : ""}.`;
  return state.message ? `${mode} ${state.message}` : mode;
}

/**
 * The entered portrait's Neovim (portrait-neovim T2): the pure editor
 * (nvim-editor.ts) drawn as DOM on the page. It takes the keyboard while
 * focused; its keys stop here so the room never sees them, except a plain
 * NORMAL-mode Esc, which bubbles to WorldApp and leaves the close-up as
 * before. A polite live region announces the mode and every output.
 */
export function NvimEditor({
  state,
  active,
  onKey,
}: {
  state: EditorState;
  /** The page takes input: focus moves here. */
  active: boolean;
  onKey: (key: string, env: EditorEnv) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const fps = useFps();
  useEffect(() => {
    if (!active) return;
    // After WorldApp focuses its Exit button for the close-up.
    const id = requestAnimationFrame(() =>
      root.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!isEditorKey(state, event.key)) return;
    if (event.key === "Escape" && leavesEditor(state)) return;
    event.preventDefault();
    event.stopPropagation();
    onKey(event.key, { fps: fps.current });
  };

  const status = editorStatus(state);
  const rows = state.lines.slice(state.top, state.top + EDITOR_ROWS);
  const from = Math.min(state.anchor, state.row);
  const to = Math.max(state.anchor, state.row);
  return (
    <div
      ref={root}
      className="nvim"
      data-mode={state.mode}
      role="application"
      aria-roledescription="Neovim editor"
      aria-label={`Neovim, ${state.file}`}
      aria-describedby="nvim-keys"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <p className="nvim-winbar">
        {state.file}
        {state.modified ? " [+]" : ""}
      </p>
      <div className="nvim-buffer" aria-hidden="true">
        {rows.map((line, i) => {
          const row = state.top + i;
          const current = row === state.row;
          return (
            <div
              key={row}
              className="nvim-line"
              data-current={current || undefined}
              data-selected={
                (state.mode === "visual" && row >= from && row <= to) ||
                undefined
              }
            >
              <span className="nvim-number">{row + 1}</span>
              <span className="nvim-text">
                {highlight(line).map((token, j) => (
                  <span key={j} className={`nvim-tk-${token.kind}`}>
                    {token.text}
                  </span>
                ))}
                {current &&
                  state.mode !== "command" &&
                  state.mode !== "picker" && (
                    <span
                      className="nvim-cursor"
                      style={{ left: `${state.col}ch` }}
                    >
                      {state.mode === "insert" ? "" : (line[state.col] ?? " ")}
                    </span>
                  )}
              </span>
            </div>
          );
        })}
        {Array.from(
          { length: Math.max(0, EDITOR_ROWS - rows.length) },
          (_, i) => (
            <div key={`~${i}`} className="nvim-line nvim-empty">
              <span className="nvim-number">~</span>
            </div>
          ),
        )}
      </div>
      <p className="nvim-status" aria-hidden="true">
        <span className="nvim-mode">{status.mode}</span>
        <span className="nvim-branch">{status.branch}</span>
        <span className="nvim-file">{status.file}</span>
        <span className="nvim-right">
          {status.filetype} {status.position}
        </span>
      </p>
      <p
        className="nvim-command"
        data-error={state.error || undefined}
        aria-hidden="true"
      >
        {state.mode === "command" ? `:${state.command}` : state.message}
      </p>
      {state.panel && (
        <section className="nvim-float" aria-hidden="true">
          <h3>{state.panel.title}</h3>
          <pre>{state.panel.lines.join("\n")}</pre>
          <p>Esc or q to close</p>
        </section>
      )}
      {state.picker && (
        <section className="nvim-float nvim-picker" aria-hidden="true">
          <h3>Telescope</h3>
          <p className="nvim-prompt">&gt; {state.picker.query}</p>
          <ul>
            {state.picker.results.map((item, i) => (
              <li
                key={item.label}
                data-selected={i === state.picker?.selected || undefined}
              >
                <span>{item.label}</span>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
          <p>Type to filter, arrows to move, Enter to open</p>
        </section>
      )}
      <p id="nvim-keys" className="nvim-sr">
        Vim keys: i to type, Esc for NORMAL mode, colon for commands, :help
        lists them. Esc in NORMAL mode returns to the room.
      </p>
      <p className="nvim-sr" aria-live="polite">
        {announcement(state)}
      </p>
    </div>
  );
}
