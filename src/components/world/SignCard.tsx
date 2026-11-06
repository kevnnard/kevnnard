import { type AnimationEvent, useEffect, useRef } from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import {
  type SignProfile,
  type SignStatus,
  signCopy,
} from "@/lib/world/garden-sign.ts";
import "./case-story.css";
import "./sign-card.css";

/**
 * The garden sign's compact card (garden-sign T2, 01 wooden board), beside
 * its close-up: the case-story card family (case-story.css supplies the
 * panel, kicker, actions, focus rings, card motion and the footprint the
 * camera frames the sign left of). The status beside GARDEN SIGN, the name
 * and role, the availability pill, the site's one-line summary, the core
 * stack and the external links (new tab). A quick notice, not the
 * portfolio: See my portfolio closes it and opens the desk terminal. Email
 * and city render only once the owner gives them. Back to garden takes
 * focus as the card opens; leaving, it is inert.
 */
export default function SignCard({
  profile,
  status,
  onClose,
  onPortfolio,
  state,
  onMotionEnd,
}: {
  profile: SignProfile;
  status: SignStatus;
  onClose: () => void;
  /** Leaves the sign for the desk terminal. */
  onPortfolio: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const copy = signCopy(status);
  const initials = profile.name
    .split(" ")
    .map((word) => word[0])
    .join("");

  return (
    <article
      className="case-story sign-card"
      aria-labelledby="sign-card-title"
      data-status={status}
      data-state={state}
      inert={state === "leaving"}
      onAnimationEnd={onMotionEnd}
    >
      <p className="case-story-kicker sign-card-kicker">
        <span>GARDEN SIGN</span>
        <span className="sign-card-status">{copy.kicker}</span>
      </p>
      <div className="sign-card-profile">
        <span className="sign-card-avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h2 id="sign-card-title">{profile.name}</h2>
          <p className="case-story-sub">
            {profile.handle} · {profile.role}
          </p>
        </div>
      </div>
      <p className="sign-card-pill">{copy.availability}</p>
      <p className="sign-card-summary">{profile.summary}</p>
      {profile.city && (
        <p className="sign-card-city">Based in {profile.city}</p>
      )}
      <section
        className="case-story-block sign-card-stack"
        aria-labelledby="sign-card-stack"
      >
        <h3 id="sign-card-stack">Core stack</h3>
        <ul className="sign-card-chips">
          {profile.stack.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      </section>
      <div className="sign-card-links">
        {profile.links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${link.label} (opens in a new tab)`}
          >
            {link.label}
          </a>
        ))}
        {profile.email && <a href={`mailto:${profile.email}`}>Email</a>}
      </div>
      <div className="case-story-actions sign-card-actions">
        <button
          type="button"
          className="sign-card-portfolio"
          onClick={onPortfolio}
        >
          See my portfolio
        </button>
        <button ref={back} type="button" onClick={onClose}>
          Back to garden
        </button>
      </div>
    </article>
  );
}
