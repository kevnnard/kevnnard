// Desk things worth buying (keyboard-card T1, T2): the side card beside the
// inspected desk item. Specs are the owner's confirmed model as listed on
// Amazon; the "why" is owner-approved prose (keyboard-card L2). No product
// photos or third-party requests: the 3D model is the visual.

/** One labelled figure, as in the stats strip. */
export interface ProductStat {
  label: string;
  value: string;
}

export interface DeskProduct {
  kicker: string;
  title: string;
  /** One short line in the owner's words. */
  subtitle: string;
  /** The strip under the title: three short cells. */
  stats: readonly ProductStat[];
  /** The switch inside, how it feels and how it sounds, in plain words. */
  switch: {
    name: string;
    type: string;
    feel: string;
    sound: string;
    specs: readonly ProductStat[];
  };
  /** The keycaps, one chip each; a swatch for the coloured ones. */
  keycaps: readonly { label: string; swatch?: string }[];
  /** Why the owner chose it, in his voice. */
  why: string;
  link: {
    label: string;
    /** null until the owner gives it: the card shows "Link coming soon". */
    url: string | null;
    /** Only an affiliate link adds rel="sponsored". */
    affiliate: boolean;
  };
}

export const DESK_PRODUCTS: { keyboard: DeskProduct } = {
  // The owner's keyboard (confirmed by the owner); a plain product link.
  // Facts from the Amazon listing for his SKU, B0CMX8SLF6 ("NuPhy Air75 V2
  // ... Black Gateron Moss Switch", read 2026-11-05): 75%, 84 keys,
  // Bluetooth 5.1 / 2.4G / USB-C, PBT keycaps, and the switch table "Moss
  // (Tactile, 60gf) Pre-travel: 1.7±0.4mm / Total travel: 3.0±0.2mm,
  // Operating force: 60±15gf, Stem: POM / Top: PC / Bottom: PA66, Spring:
  // 16.5mm single-stage, factory lubed, long-pole stem". Its review summary
  // calls the sound "gentle"; the plain-words sound line is ours. Colours
  // as the scene's board (keyboard-faithful L2, the listing's main photo).
  keyboard: {
    kicker: "DESK · KEYBOARD",
    title: "NuPhy Air75 V2",
    subtitle: "The keyboard I write every line on.",
    stats: [
      { label: "Layout", value: "75% · 84 keys" },
      { label: "Profile", value: "Low-profile" },
      { label: "Connection", value: "Bluetooth / 2.4G / USB-C" },
    ],
    switch: {
      name: "Gateron Moss",
      type: "Low-profile tactile",
      feel: "A soft, rounded bump right at the top of the press, then a smooth run to the bottom: you feel each key land without having to bottom out.",
      sound:
        "Muted and rounded: a soft, low thock rather than a click, quiet enough for a call or a sleeping house.",
      specs: [
        { label: "Force", value: "60 gf" },
        { label: "Pre-travel", value: "1.7 mm" },
        { label: "Total travel", value: "3.0 mm" },
        { label: "Stem", value: "Long-pole POM, lubed" },
      ],
    },
    keycaps: [
      { label: "Low-profile PBT" },
      { label: "Black colourway", swatch: "#1c1c21" },
      { label: "Mint Esc", swatch: "#7fd6bb" },
      { label: "Coral Enter", swatch: "#f0715f" },
      { label: "Yellow space bar", swatch: "#f2c94c" },
    ],
    why: "It is thin enough to type on for hours without a wrist rest, and wireless, so the desk stays clean. One switch takes it from the Mac to the Linux box. And that quiet, tactile thock keeps me in flow when I am coding late at night.",
    link: {
      label: "View on Amazon",
      url: "https://www.amazon.com/dp/B0CMX8SLF6",
      affiliate: false,
    },
  },
};
