import type { ReactNode } from "react";

/**
 * Kraftco 1972 annual report cover, as a band (owner's reference, 12 Nov
 * 2026: «Enormous translucent date numerals overlay vertical bands and
 * concentric line textures in midnight blue, rust red, and violet»).
 * Drawn in SVG, not generated: the numerals are live data (today's date,
 * the pilot's numbers) and image models garble digits. Plum instead of
 * violet, so the old lilac look does not come back.
 */
export function NumeralBand({ numerals, children, className = "" }: { numerals: [string, string]; children: ReactNode; className?: string }) {
  const rings = Array.from({ length: 18 }, (_, i) => 40 + i * 26);
  // Text never sits on the numerals: it has the plain midnight half to
  // itself (phones: graphic on top, text below), so contrast stays ≥ 12:1.
  return (
    <section className={`relative overflow-hidden bg-[#181d3a] ${className}`}>
      <div className="relative h-[220px] md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[58%]">
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="540 0 900 560" preserveAspectRatio="xMinYMid slice">
          {/* vertical bands */}
          <rect x="610" y="0" width="150" height="560" fill="#a8401c" />
          <rect x="760" y="0" width="56" height="560" fill="#5c3a5e" />
          <rect x="1040" y="0" width="230" height="560" fill="#11152b" />
          <rect x="1270" y="0" width="40" height="560" fill="#a8401c" opacity="0.85" />
          {/* concentric line texture */}
          <g fill="none" stroke="#f2e0be" strokeWidth="1.1" opacity="0.18">
            {rings.map((r) => (
              <circle key={r} cx="1120" cy="300" r={r} />
            ))}
          </g>
          {/* enormous translucent numerals, two layers offset like overprinting */}
          <text x="560" y="500" fontFamily="var(--font-display)" fontWeight="700" fontSize="470" letterSpacing="-30" fill="#e0603a" fillOpacity="0.55">
            {numerals[0]}
          </text>
          <text x="900" y="470" fontFamily="var(--font-display)" fontWeight="700" fontSize="470" letterSpacing="-30" fill="#f2e0be" fillOpacity="0.16">
            {numerals[1]}
          </text>
        </svg>
      </div>
      <div className="px-edge relative py-10 md:py-20">
        <div className="md:max-w-[38%]">{children}</div>
      </div>
    </section>
  );
}
