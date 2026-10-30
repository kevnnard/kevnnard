import type { ReactNode } from "react";
import type { GuideSectionId } from "@/lib/world/world-guide.ts";

// Original schematic drawings of this world's own house, desk, screens and
// speakers for the guide (S2), in design/system.md's tokens. Drawings, not
// screenshots: nothing here is rendered by the GPU or copied from elsewhere.
const INK = "#09090b";
const PANEL = "#18181b";
const LINE = "#27272a";
const MUTED = "#a1a1aa";
const SOFT = "#d4d4d8";
const ACCENT = "#10b981";

const ground = <ellipse cx="210" cy="292" rx="186" ry="22" fill={INK} />;

function House({ children }: { children?: ReactNode }) {
  return (
    <g>
      <path
        d="m70 128 140-82 140 82v136l-140 34-140-34Z"
        fill={PANEL}
        stroke={MUTED}
      />
      <path d="m52 134 158-104 158 104-158-70Z" fill={LINE} stroke={SOFT} />
      <path d="M70 230l140 30 140-30" stroke={LINE} />
      {children}
    </g>
  );
}

const DRAWINGS: Record<GuideSectionId, ReactNode> = {
  home: (
    <>
      {ground}
      <House>
        <rect x="118" y="196" width="184" height="10" rx="2" fill={MUTED} />
        <rect
          x="154"
          y="132"
          width="112"
          height="58"
          rx="8"
          fill={INK}
          stroke={SOFT}
        />
        <path
          d="M168 150h56m-56 12h38m-38 12h70"
          stroke={ACCENT}
          strokeWidth="4"
        />
        <rect
          x="276"
          y="128"
          width="22"
          height="40"
          rx="3"
          fill={INK}
          stroke={MUTED}
        />
        <rect x="120" y="150" width="20" height="30" rx="3" fill={INK} />
        <rect x="300" y="150" width="20" height="30" rx="3" fill={INK} />
        <circle cx="130" cy="168" r="5" stroke={ACCENT} />
        <circle cx="310" cy="168" r="5" stroke={ACCENT} />
        <path d="M150 206v40m120-40v40" stroke={MUTED} strokeWidth="3" />
      </House>
    </>
  ),
  controls: (
    <>
      {ground}
      <g opacity="0.75">
        <House />
      </g>
      <path
        d="M58 236c40 46 264 46 304 0"
        stroke={ACCENT}
        strokeWidth="3"
        strokeDasharray="6 8"
      />
      <path d="m350 226 14 8-12 12" stroke={ACCENT} strokeWidth="3" />
      <path d="m70 226-14 8 12 12" stroke={ACCENT} strokeWidth="3" />
      <path
        d="m300 86 0 46 12-10 9 20 8-4-9-19h16Z"
        fill={SOFT}
        stroke={INK}
        strokeWidth="2"
      />
      <path
        d="M74 70c12 0 18 10 18 22M92 70c-12 0-18 10-18 22"
        stroke={MUTED}
      />
      <circle cx="74" cy="98" r="9" fill={SOFT} />
      <circle cx="102" cy="72" r="9" fill={SOFT} />
      <path d="m80 92 16-14" stroke={ACCENT} strokeWidth="2" />
    </>
  ),
  terminal: (
    <>
      <path
        d="M40 76q170-34 340 0v134q-170-30-340 0Z"
        fill={INK}
        stroke={SOFT}
      />
      <path d="M70 102h96" stroke={ACCENT} strokeWidth="5" />
      <path
        d="M70 124h64m-64 18h80m-64 18h56m-72 18h88"
        stroke={MUTED}
        strokeWidth="4"
      />
      {["A", "P", "E", "C"].map((key, index) => (
        <g key={key} transform={`translate(${220 + index * 36} 112)`}>
          <rect width="28" height="28" rx="5" fill={PANEL} stroke={LINE} />
          <text
            x="14"
            y="19"
            fill={SOFT}
            fontFamily="ui-monospace, monospace"
            fontSize="13"
            textAnchor="middle"
          >
            {key}
          </text>
        </g>
      ))}
      <path d="M232 168h104" stroke={MUTED} strokeWidth="4" />
      <path d="M200 206v42m20-42v42" stroke={MUTED} strokeWidth="4" />
      <rect x="150" y="248" width="120" height="8" rx="4" fill={LINE} />
      <rect x="96" y="268" width="228" height="14" rx="4" fill={PANEL} />
    </>
  ),
  video: (
    <>
      <rect
        x="142"
        y="28"
        width="136"
        height="236"
        rx="10"
        fill={INK}
        stroke={SOFT}
      />
      <rect x="156" y="44" width="108" height="66" rx="4" fill={PANEL} />
      <path d="m200 62 24 15-24 15Z" fill={ACCENT} />
      <path
        d="M158 130h70m-70 16h100m-100 16h86m-86 16h96m-96 16h64m-64 16h92"
        stroke={MUTED}
        strokeWidth="4"
      />
      <path d="M210 264v24" stroke={MUTED} strokeWidth="4" />
      <rect x="170" y="286" width="80" height="8" rx="4" fill={LINE} />
    </>
  ),
  lofi: (
    <>
      <rect x="60" y="210" width="300" height="12" rx="3" fill={MUTED} />
      {[110, 262].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y="110"
            width="48"
            height="100"
            rx="6"
            fill={INK}
            stroke={SOFT}
          />
          <circle cx={x + 24} cy="136" r="9" stroke={MUTED} />
          <circle cx={x + 24} cy="176" r="17" stroke={MUTED} />
          <circle cx={x + 24} cy="176" r="5" fill={LINE} />
        </g>
      ))}
      <path
        d="M96 132q-16 28 0 56m-14-70q-26 42 0 84"
        stroke={ACCENT}
        strokeWidth="3"
      />
      <path
        d="M324 132q16 28 0 56m14-70q26 42 0 84"
        stroke={ACCENT}
        strokeWidth="3"
      />
      <path d="M196 92V58l30-8v34" stroke={SOFT} strokeWidth="3" />
      <circle cx="190" cy="92" r="7" fill={SOFT} />
      <circle cx="220" cy="84" r="7" fill={SOFT} />
      <rect x="150" y="248" width="120" height="30" rx="8" fill={PANEL} />
      <path
        d="m178 256 0 14-10-7Zm28 0v14m8-14v14m28-14 10 7-10 7Z"
        fill={ACCENT}
        stroke={ACCENT}
      />
    </>
  ),
  credits: (
    <>
      <rect
        x="96"
        y="40"
        width="228"
        height="236"
        rx="6"
        fill={PANEL}
        stroke={SOFT}
      />
      <path
        d="M96 118h228M96 196h228M210 40v236"
        stroke={LINE}
        strokeWidth="4"
      />
      <path d="M140 108V72l26-6v34" stroke={ACCENT} strokeWidth="3" />
      <circle cx="134" cy="108" r="6" fill={ACCENT} />
      <circle cx="160" cy="100" r="6" fill={ACCENT} />
      <path d="M250 108h36l-6-28h-24Z" fill={INK} stroke={MUTED} />
      <path d="M268 80V64" stroke={MUTED} />
      <rect x="120" y="150" width="30" height="40" fill={INK} stroke={MUTED} />
      <rect x="154" y="160" width="30" height="30" fill={LINE} />
      <rect x="236" y="138" width="18" height="52" fill={INK} stroke={MUTED} />
      <rect x="258" y="144" width="18" height="46" fill={LINE} />
      <rect x="280" y="134" width="18" height="56" fill={INK} stroke={MUTED} />
      <circle cx="150" cy="236" r="18" fill={INK} stroke={SOFT} />
      <path d="m150 224 4 8 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1Z" fill={ACCENT} />
      <rect
        x="240"
        y="222"
        width="56"
        height="34"
        rx="3"
        fill={INK}
        stroke={MUTED}
      />
    </>
  ),
};

/** The section's original drawing, named for assistive technology. */
export function WorldGuideIllustration({
  section,
  label,
}: {
  section: GuideSectionId;
  label: string;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 420 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="world-guide-art"
    >
      {DRAWINGS[section]}
    </svg>
  );
}
