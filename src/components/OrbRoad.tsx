import { Orb, type OrbTone } from "./Orb";

/**
 * «Как это работает» as the arc of orbs from the owner's Wallet reference:
 * a gently curved ruler of ticks with an orb per step, the last one (the
 * outcome) larger. Pure SVG + markup, no JS; the arc is a circle segment
 * bulging left, so every step's x follows x(y).
 */
const ROW = 150;
const R = 560;
const X0 = 4;
const TONES: OrbTone[] = ["sage", "violet", "coral", "iris"];

export function OrbRoad({ steps }: { steps: { title: string; text: string }[] }) {
  const n = steps.length;
  const H = n * ROW;
  const cy = H / 2;
  const x = (y: number) => X0 + R - Math.sqrt(R * R - (y - cy) * (y - cy));

  const ticks: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
  const centres = steps.map((_, i) => ROW * (i + 0.5));
  for (let y = -60; y <= H + 60; y += 13) {
    const px = x(y);
    const dx = X0 + R - px, dy = cy - y;
    const len = Math.hypot(dx, dy);
    const major = centres.some((c) => Math.abs(c - y) < 6.5);
    const l = major ? 20 : 8;
    const edge = Math.min(1, Math.max(0, Math.min(y + 60, H + 60 - y) / 90));
    ticks.push({ x1: px, y1: y, x2: px + (dx / len) * l, y2: y + (dy / len) * l, o: (major ? 0.8 : 0.32) * edge });
  }

  return (
    <div className="relative" style={{ height: H }}>
      <svg
        aria-hidden="true"
        className="absolute left-0 top-0 overflow-visible"
        width={120}
        height={H}
        viewBox={`0 0 120 ${H}`}
      >
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#f4f2ee" strokeOpacity={t.o} strokeWidth={1.2} strokeLinecap="round" />
        ))}
      </svg>
      <ol className="contents">
        {steps.map((s, i) => {
          const last = i === n - 1;
          const size = last ? 88 : 56;
          return (
            <li
              key={s.title}
              className="reveal absolute right-0 flex items-center gap-4 md:gap-6"
              style={{ top: centres[i], left: x(centres[i]) + 30, transform: "translateY(-50%)" }}
            >
              <Orb tone={TONES[i % TONES.length]} size={size} />
              <div className="min-w-0 max-w-[30rem]">
                <h3 className={last ? "text-[32px] md:text-[40px]" : "text-[26px] md:text-[30px]"}>{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-snug text-ink-2 md:text-[16px]">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
