import { useEffect, useRef } from "react";
import {
  DISPLAY_CASES,
  type DisplayItemId,
} from "@/lib/world/display-cases.ts";
import "./collection-rail.css";

// Looking toward +z reverses world-x on screen.
const VIEW_CASES = [...DISPLAY_CASES].reverse();

const collection: Record<
  DisplayItemId,
  { title: string; subtitle: string; detail: string }
> = {
  "football-helmet": {
    title: "Football helmet",
    subtitle: "Original SpeedFlex-inspired model",
    detail:
      "Built for this site with a tinted black eye shield, a black open-eye facemask and the owner's gold and black horns; inspired by the Riddell SpeedFlex, not an exact replica.",
  },
  "moto-helmet": {
    title: "Fox V1",
    subtitle: "Motocross-inspired stand-in",
    detail:
      "A credited off-road helmet in Fox-inspired red and black; not an exact Fox V1 replica.",
  },
  "jordan-1": {
    title: "Air Jordan 1",
    subtitle: "Black/sail stand-in",
    detail:
      "Credited Air Jordan 1 pair; black/sail is not the exact Black Toe.",
  },
};

export default function CollectionRail({
  focused,
  onInspect,
  onReturn,
}: {
  focused: DisplayItemId;
  onInspect: (id: DisplayItemId) => void;
  onReturn: () => void;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = focused;
  useEffect(() => {
    if (focused) {
      tabs.current[
        VIEW_CASES.findIndex((item) => item.id === focused)
      ]?.focus();
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
          ? VIEW_CASES.length - 1
          : (index + delta + VIEW_CASES.length) % VIEW_CASES.length;
    onInspect(VIEW_CASES[next].id);
    tabs.current[next]?.focus();
  };
  return (
    <section className="collection-rail" aria-label="Collection navigation">
      <div className="collection-rail-intro">
        <span className="collection-rail-mono">EXPLORE / 03 OBJECTS</span>
        <h2>The collection</h2>
        <p>Choose another case, or return to the sofa view.</p>
      </div>
      <div
        className="collection-rail-tabs"
        role="tablist"
        aria-label="Display cases"
      >
        {VIEW_CASES.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`collection-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            aria-controls="collection-detail"
            tabIndex={active === item.id ? 0 : -1}
            onClick={() => onInspect(item.id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <span className="collection-rail-mono collection-rail-index">
              {String(index + 1).padStart(2, "0")} /{" "}
              {(["LEFT", "CENTER", "RIGHT"] as const)[index]}
            </span>
            <strong>{collection[item.id].title}</strong>
            <small>{collection[item.id].subtitle}</small>
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
