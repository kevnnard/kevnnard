import { useEffect, useRef } from "react";
import type { DeskProduct } from "@/lib/world/desk-products.ts";
import "./katana-story.css";
import "./product-card.css";

/**
 * The side card beside an inspected desk thing (keyboard-card T1), in the
 * katana card's lo-fi console look and footprint, so the camera frames the
 * thing left of it. No product photo: the 3D model is the visual. The desk
 * is not part of the collection, so there is no rail: "Back to room" leaves.
 * The shop link opens in a new tab; until the owner gives it, a disabled
 * "Link coming soon" stands in.
 */
export default function ProductCard({
  product,
  onReturn,
}: {
  product: DeskProduct;
  onReturn: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  // Keyboard focus lands on the card as it opens, so Tab reaches the link.
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const { link } = product;
  return (
    <article
      className="katana-story product-card"
      aria-labelledby="product-card-title"
    >
      <p className="katana-story-kicker">{product.kicker}</p>
      <h2 id="product-card-title">{product.title}</h2>
      <p className="product-card-line">{product.line}</p>
      {product.specs.length > 0 && (
        <ul className="product-card-specs" aria-label="Specs">
          {product.specs.map((spec) => (
            <li key={spec}>{spec}</li>
          ))}
        </ul>
      )}
      <div className="katana-story-actions product-card-actions">
        <button ref={back} type="button" onClick={onReturn}>
          Back to room
        </button>
        {link.url ? (
          <a
            className="product-card-link"
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
          <button type="button" className="product-card-link" disabled>
            Link coming soon
          </button>
        )}
      </div>
    </article>
  );
}
