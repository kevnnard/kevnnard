// Desk things worth buying (keyboard-card T1): the side card beside the
// inspected desk item. Only what the owner confirmed is written here. No
// product photos or third-party requests: the 3D model is the visual.

export interface DeskProduct {
  kicker: string;
  title: string;
  /** One short line in the owner's words. */
  line: string;
  specs: readonly string[];
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
  keyboard: {
    kicker: "DESK · KEYBOARD",
    title: "NuPhy Air75 V2",
    line: "The keyboard I write every line on.",
    specs: [
      "75% low-profile, 84 keys",
      "Wireless: Bluetooth, 2.4G, USB-C",
      "Aluminium frame, RGB backlight",
    ],
    link: {
      label: "View on Amazon",
      url: "https://www.amazon.com/dp/B0CMX8SLF6",
      affiliate: false,
    },
  },
};
