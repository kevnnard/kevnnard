import { useEffect, useRef } from "react";
import {
  GALLERY_ORDER,
  type GalleryItemId,
} from "@/lib/world/display-cases.ts";
import "./collection-rail.css";

// Tabs in room order (GALLERY_ORDER, katana-wall-shelf T14): the katanas,
// the three cases as seen from the room, then the collection shelf (T15).

const collection: Record<
  GalleryItemId,
  { title: string; subtitle: string; detail: string; place: string }
> = {
  "football-helmet": {
    title: "Football helmet",
    subtitle: "Carneros DC · #32",
    detail:
      "Exodusks' Riddell SpeedFlex (CC BY 4.0), repainted in my team's gold and black horns with a smoked black eye shield; not my exact helmet.",
    place: "RIGHT",
  },
  "moto-helmet": {
    title: "Fox V1",
    subtitle: "F-A18 Sayak, red",
    detail:
      "senoaji's Fox X Supreme Helmet (CC BY 4.0) wearing photos of my Fox V1 Sayak; close, not the exact V1 shell.",
    place: "CENTER",
  },
  "jordan-1": {
    title: "Air Jordan 1",
    subtitle: "Black/sail stand-in",
    detail:
      "Credited Air Jordan 1 pair; black/sail is not the exact Black Toe.",
    place: "LEFT",
  },
  katana: {
    title: "Blossom Katana",
    subtitle: "Wall · katana stand",
    detail:
      "Mitchell Bekke's Blossom Katana (CC BY 4.0) on a lacquered wall shelf.",
    place: "WALL",
  },
  "collection-shelf": {
    title: "Collection shelf",
    subtitle: "My things · by the setup",
    detail:
      "My own shelf, rebuilt by hand: the football, cameras, awards, hardware boxes and books.",
    place: "SHELF",
  },
};

/**
 * The collection rail under an inspected case. Beside a story card
 * (collection-display-models T11) it folds into one compact row, so the
 * card and the turning model keep the attention.
 */
export default function CollectionRail({
  focused,
  onInspect,
  onReturn,
  compact = false,
}: {
  focused: GalleryItemId;
  onInspect: (id: GalleryItemId) => void;
  onReturn: () => void;
  compact?: boolean;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = focused;
  useEffect(() => {
    if (focused) {
      tabs.current[GALLERY_ORDER.indexOf(focused)]?.focus();
    }
  }, [focused]);
  const onKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? GALLERY_ORDER.length - 1
          : (index + delta + GALLERY_ORDER.length) % GALLERY_ORDER.length;
    onInspect(GALLERY_ORDER[next]);
    tabs.current[next]?.focus();
  };
  const tab = (id: GalleryItemId, index: number) => ({
    ref: (element: HTMLButtonElement | null) => {
      tabs.current[index] = element;
    },
    id: `collection-tab-${id}`,
    type: "button" as const,
    role: "tab",
    "aria-selected": active === id,
    tabIndex: active === id ? 0 : -1,
    onClick: () => onInspect(id),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) =>
      onKey(event, index),
  });
  return compact ? (
    <nav
      className="collection-rail collection-rail-compact"
      aria-label="Collection navigation"
    >
      <span className="collection-rail-mono collection-rail-count">
        05 OBJECTS
      </span>
      <div
        className="collection-rail-pills"
        role="tablist"
        aria-label="Collection objects"
      >
        {GALLERY_ORDER.map((id, index) => (
          <button key={id} {...tab(id, index)}>
            <span className="collection-rail-mono collection-rail-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            {collection[id].title}
          </button>
        ))}
      </div>
      <button type="button" className="collection-rail-back" onClick={onReturn}>
        ← Back to room
      </button>
    </nav>
  ) : (
    <section className="collection-rail" aria-label="Collection navigation">
      <div className="collection-rail-intro">
        <span className="collection-rail-mono">EXPLORE / 05 OBJECTS</span>
        <h2>The collection</h2>
        <p>Choose another object, or return to the sofa view.</p>
      </div>
      <div
        className="collection-rail-tabs"
        role="tablist"
        aria-label="Collection objects"
      >
        {GALLERY_ORDER.map((id, index) => (
          <button
            key={id}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`collection-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={active === id}
            aria-controls="collection-detail"
            tabIndex={active === id ? 0 : -1}
            onClick={() => onInspect(id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <span className="collection-rail-mono collection-rail-index">
              {String(index + 1).padStart(2, "0")} / {collection[id].place}
            </span>
            <strong>{collection[id].title}</strong>
            <small>{collection[id].subtitle}</small>
          </button>
        ))}
      </div>
      <div
        className="collection-rail-detail"
        id="collection-detail"
        role="tabpanel"
        aria-labelledby={`collection-tab-${active}`}
      >
        <span>{collection[active].detail}</span>
        <button type="button" onClick={onReturn}>
          ← Back to room
        </button>
      </div>
    </section>
  );
}
