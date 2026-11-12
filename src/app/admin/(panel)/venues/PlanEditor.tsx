"use client";

import { useActionState, useRef, useState } from "react";
import { savePlan } from "../../actions";
import { FormError, SubmitButton } from "@/components/form";
import type { PlanHall, PlanItem } from "@/lib/booking";
import type { FormState } from "@/lib/types";

const PRESETS: { label: string; item: Omit<PlanItem, "id" | "hall_id" | "x" | "y"> }[] = [
  { label: "Стол на 2", item: { kind: "table", label: "", shape: "round", w: 10, h: 10, seats_min: 1, seats_max: 2 } },
  { label: "Стол на 4", item: { kind: "table", label: "", shape: "rect", w: 18, h: 12, seats_min: 2, seats_max: 4 } },
  { label: "Большой стол", item: { kind: "table", label: "", shape: "rect", w: 30, h: 14, seats_min: 4, seats_max: 8 } },
  { label: "Подпись: бар, вход, окна", item: { kind: "decor", label: "Бар", shape: "rect", w: 26, h: 8, seats_min: 1, seats_max: 1 } },
];

const snap = (n: number) => Math.round(n * 2) / 2;

/**
 * Drag tables around a hall, resize with the corner handle, set seats and
 * labels on the side. Nothing is stored until «Сохранить план».
 */
export function PlanEditor({ venueId, initialHalls, initialItems }: { venueId: string; initialHalls: PlanHall[]; initialItems: PlanItem[] }) {
  // The page always passes at least one hall (a fresh one has a server-made id).
  const [halls, setHalls] = useState<PlanHall[]>(initialHalls);
  const [items, setItems] = useState<PlanItem[]>(initialItems);
  const [hallId, setHallId] = useState(halls[0].id);
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(async (p, fd) => {
    const r = await savePlan(p, fd);
    if (r.ok) setDirty(false);
    return r;
  }, {});
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "size"; dx: number; dy: number } | null>(null);

  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const own = items.filter((i) => i.hall_id === hall.id);
  const selected = items.find((i) => i.id === sel) ?? null;

  const touch = () => setDirty(true);
  const update = (id: string, patch: Partial<PlanItem>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    touch();
  };
  const toPlan = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const onDown = (e: React.PointerEvent, it: PlanItem, mode: "move" | "size") => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toPlan(e);
    drag.current = { id: it.id, mode, dx: p.x - it.x, dy: p.y - it.y };
    setSel(it.id);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const it = items.find((x) => x.id === d.id);
    if (!it) return;
    const p = toPlan(e);
    if (d.mode === "move") {
      update(it.id, {
        x: Math.min(hall.width - it.w, Math.max(0, snap(p.x - d.dx))),
        y: Math.min(hall.height - it.h, Math.max(0, snap(p.y - d.dy))),
      });
    } else {
      update(it.id, {
        w: Math.max(4, Math.min(hall.width - it.x, snap(p.x - it.x))),
        h: Math.max(4, Math.min(hall.height - it.y, snap(p.y - it.y))),
      });
    }
  };
  const onUp = () => (drag.current = null);

  const add = (preset: (typeof PRESETS)[number]["item"]) => {
    const tables = items.filter((i) => i.kind === "table").map((i) => Number(i.label)).filter(Number.isFinite);
    const next = preset.kind === "table" ? String((tables.length ? Math.max(...tables) : 0) + 1) : preset.label;
    const it: PlanItem = { ...preset, id: crypto.randomUUID(), hall_id: hall.id, label: next, x: snap((hall.width - preset.w) / 2), y: snap((hall.height - preset.h) / 2) };
    setItems((xs) => [...xs, it]);
    setSel(it.id);
    touch();
  };

  const updateHall = (patch: Partial<PlanHall>) => {
    setHalls((hs) => hs.map((h) => (h.id === hall.id ? { ...h, ...patch } : h)));
    touch();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {halls.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-pressed={h.id === hall.id}
            onClick={() => {
              setHallId(h.id);
              setSel(null);
            }}
            className={`btn btn-sm ${h.id === hall.id ? "bg-ink text-canvas" : "btn-soft"}`}
          >
            {h.name || "Без названия"}
          </button>
        ))}
        <button
          type="button"
          className="link-quiet text-[14px]"
          onClick={() => {
            const h = { id: crypto.randomUUID(), name: `Зал ${halls.length + 1}`, name_kk: null, width: 100, height: 64 };
            setHalls((hs) => [...hs, h]);
            setHallId(h.id);
            setSel(null);
            touch();
          }}
        >
          Добавить зал
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn btn-soft btn-sm" onClick={() => add(p.item)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="rounded-[var(--radius-inner)] border border-line bg-canvas p-2">
          <svg
            ref={svg}
            viewBox={`-2 -2 ${hall.width + 4} ${hall.height + 4}`}
            className="block h-auto w-full touch-none select-none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            onPointerDown={() => setSel(null)}
            aria-label={`План: ${hall.name}`}
          >
            <defs>
              <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M5 0 L0 0 0 5" fill="none" stroke="#3a2c25" strokeWidth="0.2" />
              </pattern>
            </defs>
            <rect x={0} y={0} width={hall.width} height={hall.height} rx={3} fill="url(#grid)" stroke="#4a382e" strokeWidth={0.4} />
            {own.map((it) => {
              const on = it.id === sel;
              const decor = it.kind === "decor";
              const stroke = on ? "#d1b475" : decor ? "#6d4c2e" : "#e9d7b5";
              const fill = decor ? "#261b17" : on ? "#3a2c25" : "#33261f";
              return (
                <g key={it.id} onPointerDown={(e) => onDown(e, it, "move")} className="cursor-move">
                  {it.shape === "round" ? (
                    <ellipse cx={it.x + it.w / 2} cy={it.y + it.h / 2} rx={it.w / 2} ry={it.h / 2} fill={fill} stroke={stroke} strokeWidth={0.45} strokeDasharray={decor ? "1.2 1" : undefined} />
                  ) : (
                    <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={1.6} fill={fill} stroke={stroke} strokeWidth={0.45} strokeDasharray={decor ? "1.2 1" : undefined} />
                  )}
                  <text x={it.x + it.w / 2} y={it.y + it.h / 2} textAnchor="middle" dominantBaseline="central" fill={decor ? "#c9b48f" : "#f3ead6"} fontSize={Math.min(4, Math.max(1.8, Math.min(it.w, it.h) * 0.32))} fontFamily="var(--font-ui)" pointerEvents="none">
                    {decor ? it.label : `${it.label} · ${it.seats_min === it.seats_max ? it.seats_max : `${it.seats_min}–${it.seats_max}`}`}
                  </text>
                  {on ? (
                    <rect x={it.x + it.w - 1.6} y={it.y + it.h - 1.6} width={3.2} height={3.2} rx={0.6} fill="#d1b475" className="cursor-nwse-resize" onPointerDown={(e) => onDown(e, it, "size")} />
                  ) : null}
                </g>
              );
            })}
          </svg>
          <p className="px-2 pb-1 pt-2 text-[13px] text-ink-3">Перетаскивайте столы. Угол выбранного стола меняет размер.</p>
        </div>

        <div className="flex flex-col gap-4 rounded-[var(--radius-inner)] bg-raised p-4">
          {selected ? (
            <>
              <p className="label">{selected.kind === "table" ? "Стол" : "Подпись"}</p>
              <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                {selected.kind === "table" ? "Номер или название" : "Текст"}
                <input className="field" value={selected.label} maxLength={24} onChange={(e) => update(selected.id, { label: e.target.value })} />
              </label>
              {selected.kind === "table" ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                    Мест от
                    <input className="field" type="number" min={1} max={50} value={selected.seats_min} onChange={(e) => update(selected.id, { seats_min: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                    до
                    <input className="field" type="number" min={1} max={50} value={selected.seats_max} onChange={(e) => update(selected.id, { seats_max: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {(["rect", "round"] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={selected.shape === s} onClick={() => update(selected.id, { shape: s })} className={`btn btn-sm ${selected.shape === s ? "bg-ink text-canvas" : "btn-soft"}`}>
                    {s === "rect" ? "Прямоугольный" : "Круглый"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                <button
                  type="button"
                  className="link-quiet text-[14px]"
                  onClick={() => {
                    const copy = { ...selected, id: crypto.randomUUID(), x: Math.min(hall.width - selected.w, selected.x + 4), y: Math.min(hall.height - selected.h, selected.y + 4) };
                    if (copy.kind === "table" && /^\d+$/.test(copy.label)) {
                      const nums = items.filter((i) => i.kind === "table").map((i) => Number(i.label)).filter(Number.isFinite);
                      copy.label = String(Math.max(...nums) + 1);
                    }
                    setItems((xs) => [...xs, copy]);
                    setSel(copy.id);
                    touch();
                  }}
                >
                  Дублировать
                </button>
                <button
                  type="button"
                  className="link-quiet text-[14px] text-danger"
                  onClick={() => {
                    setItems((xs) => xs.filter((x) => x.id !== selected.id));
                    setSel(null);
                    touch();
                  }}
                >
                  Удалить
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="label">Зал</p>
              <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                Название (рус)
                <input className="field" value={hall.name} maxLength={60} onChange={(e) => updateHall({ name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                Название (қаз)
                <input className="field" value={hall.name_kk ?? ""} maxLength={60} onChange={(e) => updateHall({ name_kk: e.target.value || null })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                  Ширина
                  <input className="field" type="number" min={20} max={400} value={hall.width} onChange={(e) => updateHall({ width: Math.max(20, Number(e.target.value) || 100) })} />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
                  Глубина
                  <input className="field" type="number" min={20} max={400} value={hall.height} onChange={(e) => updateHall({ height: Math.max(20, Number(e.target.value) || 64) })} />
                </label>
              </div>
              <p className="text-[13px] text-ink-3">Столов в зале: {own.filter((i) => i.kind === "table").length}. Нажмите на стол, чтобы изменить его.</p>
              {halls.length > 1 ? (
                <button
                  type="button"
                  className="link-quiet self-start text-[14px] text-danger"
                  onClick={() => {
                    if (!confirm("Удалить зал вместе со столами?")) return;
                    setItems((xs) => xs.filter((x) => x.hall_id !== hall.id));
                    setHalls((hs) => hs.filter((h) => h.id !== hall.id));
                    setHallId(halls.find((h) => h.id !== hall.id)!.id);
                    touch();
                  }}
                >
                  Удалить зал
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <form action={action} className="flex flex-wrap items-center gap-4">
        <input type="hidden" name="venue_id" value={venueId} />
        <input type="hidden" name="plan" value={JSON.stringify({ halls, items })} />
        <SubmitButton className="btn btn-primary btn-sm">Сохранить план</SubmitButton>
        {dirty ? <span className="text-[14px] text-ink-3">Есть несохранённые изменения</span> : state.ok ? <span role="status" className="text-[14px] text-success">{state.message}</span> : null}
        <FormError error={state.error} />
      </form>
    </div>
  );
}
