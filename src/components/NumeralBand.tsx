import type { ReactNode } from "react";

/**
 * Kraftco 1972, done the way the cover does it (DNA visual_effects.text_effects):
 * a Didone numeral repeated many times, each copy a few units lower, its
 * colour stepping from navy-blue to red, so the figures smear into vertical
 * columns between the top figure and the bottom one. Drawn in SVG because
 * the figures are live data and image models garble digits. Text never
 * sits on the figures: it has the plain navy half to itself (≥ 13:1).
 */
const STEPS = 42;
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
// Measured on the Kraftco cover (design/dna/measure-kraftco1972.json):
// ground #090B1C, navy #191C40, plum #662B35 / #3F151E, reds #772019 #A02E22.
const BLUE = [38, 49, 138];
const PLUM = [102, 43, 53];
const RED = [160, 46, 34];
const ramp = (t: number) => (t < 0.5 ? mix(BLUE, PLUM, t * 2) : mix(PLUM, RED, (t - 0.5) * 2));

export function NumeralBand({ numerals, children, className = "" }: { numerals: [string, string]; children: ReactNode; className?: string }) {
  const [top, bottom] = numerals;
  const y0 = 270, y1 = 860;
  // Upper half: the top figure smears down; lower half: the bottom figure
  // smears up to meet it. Solid figures are drawn last so both stay legible.
  const mid = (y0 + y1) / 2;
  const copies = Array.from({ length: STEPS }, (_, i) => {
    const t = i / (STEPS - 1);
    const [r, g, b] = ramp(t);
    const upper = t < 0.5;
    return { y: upper ? y0 + (mid - y0) * (t * 2) : mid + (y1 - mid) * ((t - 0.5) * 2), text: upper ? top : bottom, fill: `rgb(${r} ${g} ${b})` };
  });
  return (
    <section className={`relative overflow-hidden bg-[#090b1c] ${className}`}>
      <div className="relative h-[300px] md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[55%]">
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 900 900" preserveAspectRatio="xMidYMid meet">
          {copies.map((c, i) => (
            // Filled copies, each outlined in the ground colour: overprinted
            // they build solid columns striped with fine lines, as on the cover.
            <text key={i} x="450" y={c.y} textAnchor="middle" fontFamily="var(--font-numerals)" fontSize="300" fill={c.fill} stroke="#090b1c" strokeOpacity="0.55" strokeWidth="1.6">
              {c.text}
            </text>
          ))}
          <text x="450" y={y0} textAnchor="middle" fontFamily="var(--font-numerals)" fontSize="300" fill="rgb(38 49 138)">
            {top}
          </text>
          <text x="450" y={y1} textAnchor="middle" fontFamily="var(--font-numerals)" fontSize="300" fill="rgb(160 46 34)">
            {bottom}
          </text>
        </svg>
      </div>
      <div className="px-edge relative py-10 md:py-24">
        <div className="md:max-w-[40%]">{children}</div>
      </div>
    </section>
  );
}
