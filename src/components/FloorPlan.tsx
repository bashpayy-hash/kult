"use client";

import type { PlanHall, PlanItem } from "@/lib/booking";

export type TableState = "idle" | "free" | "busy" | "unfit" | "selected";

/**
 * A hall drawn from plan units: tables are tappable boxes or circles, decor
 * (bar, kitchen, entrance, windows) is a dashed outline with its name.
 * Colour only marks state, the label and aria-label carry it too.
 */
export function FloorPlan({
  hall,
  items,
  stateOf,
  onSelect,
  describe,
}: {
  hall: PlanHall;
  items: PlanItem[];
  stateOf: (t: PlanItem) => TableState;
  onSelect?: (t: PlanItem) => void;
  describe: (t: PlanItem, s: TableState) => string;
}) {
  const pad = 2;
  const own = items.filter((i) => i.hall_id === hall.id);
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${hall.width + pad * 2} ${hall.height + pad * 2}`}
      className="block h-auto w-full select-none"
      role="group"
      aria-label={hall.name}
    >
      <rect x={0} y={0} width={hall.width} height={hall.height} rx={3} fill="#141210" stroke="#302d29" strokeWidth={0.4} />
      {own
        .filter((i) => i.kind === "decor")
        .map((d) => (
          <g key={d.id} aria-hidden="true">
            {d.shape === "round" ? (
              <ellipse cx={d.x + d.w / 2} cy={d.y + d.h / 2} rx={d.w / 2} ry={d.h / 2} fill="none" stroke="#55504a" strokeWidth={0.35} strokeDasharray="1.2 1" />
            ) : (
              <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={1.2} fill="#1b1917" stroke="#55504a" strokeWidth={0.35} strokeDasharray="1.2 1" />
            )}
            <text
              x={d.x + d.w / 2}
              y={d.y + d.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#aca599"
              fontSize={Math.min(3.2, Math.max(2.6, Math.min(d.w, d.h) * 0.42))}
              fontFamily="var(--font-ui)"
              transform={d.h > d.w * 1.6 ? `rotate(-90 ${d.x + d.w / 2} ${d.y + d.h / 2})` : undefined}
            >
              {d.label}
            </text>
          </g>
        ))}
      {own
        .filter((i) => i.kind === "table")
        .map((t) => {
          const s = stateOf(t);
          const interactive = !!onSelect && (s === "free" || s === "selected");
          // Every state keeps its number at ≥ 4.5:1 on its own fill; busy adds a
          // stroke-through, unfit a dashed edge, so colour is never the only cue.
          const fill = s === "selected" ? "#e9b562" : s === "free" ? "#2a2723" : s === "idle" ? "#211f1c" : "#1b1917";
          const stroke = s === "selected" ? "#e9b562" : s === "free" ? "#cfc8bc" : s === "idle" ? "#55504a" : "#302d29";
          const ink = s === "selected" ? "#0f0e0c" : s === "free" || s === "idle" ? "#f3eee6" : "#948d82";
          const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
          const size = Math.min(4.2, Math.max(2.2, Math.min(t.w, t.h) * 0.3));
          return (
            <g
              key={t.id}
              role={onSelect ? "button" : undefined}
              tabIndex={interactive ? 0 : -1}
              aria-label={describe(t, s)}
              aria-pressed={onSelect ? s === "selected" : undefined}
              aria-disabled={onSelect ? !interactive : undefined}
              className={interactive ? "cursor-pointer outline-none [&:focus-visible>.ring]:opacity-100" : ""}
              onClick={() => interactive && onSelect?.(t)}
              onKeyDown={(e) => {
                if (interactive && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect?.(t);
                }
              }}
                          >
              {t.shape === "round" ? (
                <>
                  <ellipse className="ring opacity-0" cx={cx} cy={cy} rx={t.w / 2 + 1.2} ry={t.h / 2 + 1.2} fill="none" stroke="#e9b562" strokeWidth={0.5} />
                  <ellipse cx={cx} cy={cy} rx={t.w / 2} ry={t.h / 2} fill={fill} stroke={stroke} strokeWidth={0.45} strokeDasharray={s === "unfit" ? "1 0.8" : undefined} />
                </>
              ) : (
                <>
                  <rect className="ring opacity-0" x={t.x - 1.2} y={t.y - 1.2} width={t.w + 2.4} height={t.h + 2.4} rx={2.6} fill="none" stroke="#e9b562" strokeWidth={0.5} />
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={1.6} fill={fill} stroke={stroke} strokeWidth={0.45} strokeDasharray={s === "unfit" ? "1 0.8" : undefined} />
                </>
              )}
              {s === "busy" ? (
                <line x1={t.x + t.w * 0.22} y1={t.y + t.h * 0.78} x2={t.x + t.w * 0.78} y2={t.y + t.h * 0.22} stroke="#948d82" strokeWidth={0.4} />
              ) : null}
              <text x={cx} y={Math.min(t.w, t.h) >= 10 ? cy - size * 0.22 : cy} textAnchor="middle" dominantBaseline="central" fill={ink} fontSize={size} fontWeight={600} fontFamily="var(--font-display)">
                {/^\d+$/.test(t.label) ? t.label : t.label.slice(0, 10)}
              </text>
              {/* Seats only where they are readable; the list under the plan and the aria-label always carry them. */}
              {Math.min(t.w, t.h) >= 10 ? (
                <text x={cx} y={cy + size * 0.9} textAnchor="middle" dominantBaseline="central" fill={ink} fontSize={size * 0.72} fontFamily="var(--font-ui)">
                  {t.seats_min === t.seats_max ? t.seats_max : `${t.seats_min}–${t.seats_max}`}
                </text>
              ) : null}
            </g>
          );
        })}
    </svg>
  );
}
