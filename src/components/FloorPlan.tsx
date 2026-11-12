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
      <rect x={0} y={0} width={hall.width} height={hall.height} rx={3} fill="#111113" stroke="#2a2a2e" strokeWidth={0.4} />
      {own
        .filter((i) => i.kind === "decor")
        .map((d) => (
          <g key={d.id} aria-hidden="true">
            {d.shape === "round" ? (
              <ellipse cx={d.x + d.w / 2} cy={d.y + d.h / 2} rx={d.w / 2} ry={d.h / 2} fill="none" stroke="#3a3a40" strokeWidth={0.35} strokeDasharray="1.2 1" />
            ) : (
              <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={1.2} fill="#17171a" stroke="#3a3a40" strokeWidth={0.35} strokeDasharray="1.2 1" />
            )}
            <text
              x={d.x + d.w / 2}
              y={d.y + d.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#6f6c67"
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
          const fill = s === "selected" ? "#c9bcff" : s === "free" ? "#26262b" : s === "idle" ? "#1f1f23" : "#16161a";
          const stroke = s === "selected" ? "#c9bcff" : s === "free" ? "#c4c1bb" : s === "idle" ? "#4a4a50" : "#2a2a2e";
          const ink = s === "selected" ? "#0a0a0b" : s === "free" || s === "idle" ? "#f4f2ee" : "#5d5b57";
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
              opacity={s === "unfit" ? 0.45 : 1}
            >
              {t.shape === "round" ? (
                <>
                  <ellipse className="ring opacity-0" cx={cx} cy={cy} rx={t.w / 2 + 1.2} ry={t.h / 2 + 1.2} fill="none" stroke="#c9bcff" strokeWidth={0.5} />
                  <ellipse cx={cx} cy={cy} rx={t.w / 2} ry={t.h / 2} fill={fill} stroke={stroke} strokeWidth={0.45} />
                </>
              ) : (
                <>
                  <rect className="ring opacity-0" x={t.x - 1.2} y={t.y - 1.2} width={t.w + 2.4} height={t.h + 2.4} rx={2.6} fill="none" stroke="#c9bcff" strokeWidth={0.5} />
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={1.6} fill={fill} stroke={stroke} strokeWidth={0.45} />
                </>
              )}
              {s === "busy" ? (
                <line x1={t.x + t.w * 0.22} y1={t.y + t.h * 0.78} x2={t.x + t.w * 0.78} y2={t.y + t.h * 0.22} stroke="#3a3a40" strokeWidth={0.4} />
              ) : null}
              <text x={cx} y={cy - size * 0.18} textAnchor="middle" dominantBaseline="central" fill={ink} fontSize={size} fontWeight={600} fontFamily="var(--font-display)">
                {/^\d+$/.test(t.label) ? t.label : t.label.slice(0, 10)}
              </text>
              <text x={cx} y={cy + size * 0.85} textAnchor="middle" dominantBaseline="central" fill={ink} opacity={0.7} fontSize={size * 0.55} fontFamily="var(--font-ui)">
                {t.seats_min === t.seats_max ? t.seats_max : `${t.seats_min}–${t.seats_max}`}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
