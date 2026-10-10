/* ============================================================
   The illustrated map.

   A direct port of the `mapSVG()` routine in `Karighar Redesign.html`:
   the same seeded building scatter, the same blocks, parks and road
   network, so the drawing is pixel-identical to the prototype.

   It serves two jobs in the real app:
   - the thumbnail (`kind="mini"`) next to a saved address;
   - the fallback behind the map screens when Google Maps has no key or
     fails to load, so those screens still read as designed.

   Server-safe: deterministic, no hooks, no "use client".
   ============================================================ */

/** The prototype's mulberry32 PRNG — same seed, same skyline. */
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDINGS = (() => {
  const r = rng(11);
  return Array.from({ length: 40 }, () => {
    const x = r() * 380;
    const y = r() * 400;
    const w = 9 + r() * 18;
    const h = 9 + r() * 16;
    return { x: x | 0, y: y | 0, w: w | 0, h: h | 0 };
  });
})();

/** The pro's route in to the customer, shared by the path and the marker. */
const ROUTE = "M312 332 C300 292 290 272 252 270 S202 232 192 192 S152 152 124 150";

export type MapPin = { x: number; y: number; label: string; on?: boolean };

/** The five price pins the redesign shows on the nearby-pros map. */
export const DEFAULT_PINS: MapPin[] = [
  { x: 70, y: 205, label: "Rs 800" },
  { x: 218, y: 120, label: "Rs 1,200" },
  { x: 258, y: 232, label: "Rs 750", on: true },
  { x: 118, y: 330, label: "Rs 950" },
  { x: 330, y: 330, label: "Rs 1,100" },
];

function Base() {
  return (
    <>
      <rect className="mp-base" x="-20" y="-20" width="430" height="450" />
      <path className="mb" d="M150 -10 L245 -10 L232 78 L158 96 Z" />
      <path className="mb" d="M285 118 L400 96 L400 236 L300 228 Z" />
      <path className="mb" d="M-10 290 L120 300 L140 420 L-10 420 Z" />
      <path className="mp" d="M-10 158 L78 182 L66 242 L-10 232 Z" />
      <path className="mp" d="M296 300 L400 322 L400 420 L310 420 Z" />
      <path className="mp" d="M170 300 L240 312 L236 372 L178 362 Z" />
      {BUILDINGS.map((b, i) => (
        <rect key={i} className="mg" x={b.x} y={b.y} width={b.w} height={b.h} rx="2" />
      ))}
      <g className="mr">
        <path d="M-10 118 C80 108 140 132 230 92 S370 62 410 42" />
        <path d="M92 -10 L138 420" />
        <path d="M-10 250 L410 300" />
        <path d="M252 -10 C240 120 304 220 262 420" />
        <circle cx="120" cy="150" r="30" />
      </g>
      <g className="mr2">
        <path d="M182 206 L400 184" />
        <path d="M200 300 L228 420" />
        <path d="M-10 332 L152 362" />
        <path d="M20 40 L160 60" />
        <path d="M300 60 L330 180" />
      </g>
    </>
  );
}

function PricePin({ x, y, label, on }: MapPin) {
  return (
    <g className={on ? "pin on" : "pin"} transform={`translate(${x} ${y})`}>
      <rect x="-33" y="-15" width="66" height="30" rx="15" />
      <text y="4.5">{label}</text>
    </g>
  );
}

function HomePin({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g className="home-m" transform={`translate(${x} ${y})`}>
      <path className="pinp" d="M0 2C-11-10-11-24 0-24S11-10 0 2Z" />
      <circle className="ring" cy="-16" r="4" />
      {label && (
        <>
          <rect className="lbl-bg" x="-24" y="8" width="48" height="20" rx="10" />
          <text y="22">{label}</text>
        </>
      )}
    </g>
  );
}

export function MapArt({
  kind,
  pins = DEFAULT_PINS,
  animate = true,
}: {
  kind: "nearby" | "track" | "mini";
  pins?: MapPin[];
  /** Runs the pro marker along the route. Off for a static/placeholder map. */
  animate?: boolean;
}) {
  const viewBox = kind === "mini" ? "90 90 210 210" : "0 0 390 410";
  return (
    <svg
      className="mp-svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <Base />

      {kind === "nearby" && (
        <>
          <circle className="you" cx="150" cy="268" r="8" />
          {pins.map((p) => (
            <PricePin key={`${p.x}-${p.y}-${p.label}`} {...p} />
          ))}
        </>
      )}

      {kind === "track" && (
        <>
          <path className="route-bg" d={ROUTE} />
          <path id="kg-route" className="route" d={ROUTE} />
          <HomePin x={124} y={150} label="Home" />
          <g className="pro-m" transform={animate ? undefined : "translate(252 270)"}>
            <circle className="pulse" r="12" />
            <circle className="core" r="9" />
            {animate && (
              <animateMotion dur="16s" repeatCount="indefinite">
                <mpath href="#kg-route" />
              </animateMotion>
            )}
          </g>
        </>
      )}

      {kind === "mini" && <HomePin x={195} y={200} />}
    </svg>
  );
}
