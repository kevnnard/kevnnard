import { type AnimationEvent, useEffect, useRef } from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import type { DeskProduct } from "@/lib/world/desk-products.ts";
import "./case-story.css";
import "./product-card.css";

/** An original outlined low-profile keycap, the head's emblem. */
function Keycap() {
  return (
    <svg
      className="product-card-keycap"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 40 L14 22 H50 L56 40 Z" />
      <path d="M8 40 V46 H56 V40" />
      <path className="legend" d="M26 31 H38" />
    </svg>
  );
}

/** An original drawn trace of a soft, rounded keystroke (not a recording). */
function SoftWave() {
  return (
    <svg
      className="product-card-wave"
      viewBox="0 0 120 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 12 H18 C24 12 26 4 31 4 C36 4 37 20 42 20 C46 20 47 8 51 8 C55 8 55 16 59 16 C62 16 63 11 66 12 H120" />
    </svg>
  );
}

/**
 * The side card beside an inspected desk thing (keyboard-card T1, T2), laid
 * out like the football helmet's and the coffee's story cards
 * (case-story.css) in the same footprint, so the camera frames the board
 * left of it: the name and an emblem up top, a stats strip, the switch with
 * its feel and sound, the keycaps as chips and why the owner chose it. No
 * product photo: the 3D model is the visual. The desk is not part of the
 * collection, so there is no rail: "Back to room" leaves, and takes focus
 * as the card opens. The shop link opens in a new tab; until the owner
 * gives it, a disabled "Link coming soon" stands in. It fades in and out
 * like the scene panel (card-motion T1); leaving, it is inert, so it lets
 * go of focus.
 */
export default function ProductCard({
  product,
  onReturn,
  state,
  onMotionEnd,
}: {
  product: DeskProduct;
  onReturn: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  // Keyboard focus lands on the card as it opens, so Tab reaches the link.
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const { link, switch: sw } = product;
  return (
    <article
      className="case-story product-card"
      aria-labelledby="product-card-title"
      data-state={state}
      inert={state === "leaving"}
      onAnimationEnd={onMotionEnd}
    >
      <p className="case-story-kicker">{product.kicker}</p>
      <div className="case-story-head">
        <div>
          <h2 id="product-card-title">{product.title}</h2>
          <p className="case-story-sub">{product.subtitle}</p>
        </div>
        <Keycap />
      </div>
      <dl className="product-card-stats">
        {product.stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <section
        className="case-story-block product-card-switch"
        aria-labelledby="product-card-switch"
      >
        <h3 id="product-card-switch">Switches &amp; sound</h3>
        <p className="product-card-switch-name">
          <b>{sw.name}</b> · {sw.type}
        </p>
        <dl className="product-card-figures">
          {sw.specs.map((spec) => (
            <div key={spec.label}>
              <dt>{spec.label}</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </dl>
        <p className="product-card-feel">{sw.feel}</p>
        <div className="product-card-sound">
          <SoftWave />
          <p>
            <span>Sound</span>
            {sw.sound}
          </p>
        </div>
      </section>
      <section
        className="case-story-block product-card-caps"
        aria-labelledby="product-card-caps"
      >
        <h3 id="product-card-caps">Keycaps</h3>
        <ul className="product-card-chips">
          {product.keycaps.map((cap) => (
            <li key={cap.label}>
              {cap.swatch && (
                <span
                  className="swatch"
                  style={{ background: cap.swatch }}
                  aria-hidden="true"
                />
              )}
              {cap.label}
            </li>
          ))}
        </ul>
      </section>
      <section className="product-card-why" aria-labelledby="product-card-why">
        <h3 id="product-card-why">Why I chose it</h3>
        <p>{product.why}</p>
      </section>
      <div className="case-story-actions">
        {link.url ? (
          <a
            href={link.url}
            target="_blank"
            rel={
              link.affiliate
                ? "sponsored noopener noreferrer"
                : "noopener noreferrer"
            }
            aria-label={`${link.label} (opens in a new tab)`}
          >
            {link.label}
          </a>
        ) : (
          <button type="button" className="product-card-soon" disabled>
            Link coming soon
          </button>
        )}
        <button ref={back} type="button" onClick={onReturn}>
          Back to room
        </button>
      </div>
    </article>
  );
}
