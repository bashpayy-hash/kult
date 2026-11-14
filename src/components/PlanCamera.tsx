"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CategoryMark } from "./CategoryMark";
import type { MapCity, MapVenue } from "./CityMap";

export type PlanLabel = { t: string; x: number; y: number; a?: number };
export type PlanLandmark = { k: "tower" | "hotel" | "bazaar" | "cathedral" | "square"; t: string; x: number; y: number };
/** The detailed plan's layers and labels (src/lib/almatyPlan.generated.json). */
export type PlanLayers = {
  relief: string;
  base: string;
  detail: string;
  avenues: PlanLabel[];
  districts: PlanLabel[];
  landmarks: PlanLandmark[];
  contours: PlanLabel[];
  range: PlanLabel;
  /** Plan width in metres, for the live scale bar. */
  widthM: number;
};
export type CameraStrings = { zoomIn: string; zoomOut: string; whole: string; aria: string; close: string; open: string; north: string; m: string; km: string; hint: string; walk: string; walkHere: string };

type Cam = { k: number; cx: number; cy: number };
const K_MAX = 4.5;
/** Closer than this, buildings, small streets, street and place names are drawn. */
const K_NEAR = 1.55;

function clamp(c: Cam): Cam {
  const k = Math.min(K_MAX, Math.max(1, c.k));
  const half = 50 / k;
  return { k, cx: Math.min(100 - half, Math.max(half, c.cx)), cy: Math.min(100 - half, Math.max(half, c.cy)) };
}

/** Where the camera settles when the plate first comes into view: around the places. */
function framing(venues: MapVenue[]): Cam {
  if (!venues.length) return { k: 1, cx: 50, cy: 50 };
  const xs = venues.map((v) => v.left), ys = venues.map((v) => v.top);
  const w = Math.max(...xs) - Math.min(...xs) + 22, h = Math.max(...ys) - Math.min(...ys) + 22;
  return clamp({ k: Math.max(K_NEAR + 0.1, Math.min(3.2, 100 / w, 100 / h)), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 });
}

const NICE = [100, 200, 500, 1000, 2000, 5000];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The detailed city plan with a camera (14 Nov 2026; owner: «детальная и
 * реалистичная, концептуальная карта… с анимациями приближения», then «нужны
 * такие анимации, более плавные»). The camera is driven frame by frame:
 * every move is one curve, eased in and out, and a long flight rises a
 * little and comes down again, the way an aerial camera would, instead of
 * CSS transitions that ran labels and plate on separate clocks. Labels,
 * landmarks and places read the zoom from --k and scale back by it, so they
 * hold their size on the very same frame.
 */
export function PlanCamera({ city, layers, active, setActive, focus, setFocus, onWalk, s }: { city: MapCity; layers: PlanLayers; active: number | null; setActive: (n: number | null) => void; focus: number | null; setFocus: (n: number | null) => void; onWalk?: (n?: number) => void; s: CameraStrings }) {
  const view = useRef<HTMLDivElement>(null);
  const camEl = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam>({ k: 1, cx: 50, cy: 50 });
  const raf = useRef(0);
  const [ui, setUi] = useState<Cam>({ k: 1, cx: 50, cy: 50 });
  const [dragging, setDragging] = useState(false);
  const [wantDetail, setWantDetail] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ cam: Cam; x: number; y: number; dist: number } | null>(null);
  const reduce = useRef(false);

  /** Puts the camera on the page: one transform, one custom property. */
  const apply = useCallback((c: Cam, commit = false) => {
    cam.current = c;
    const el = camEl.current, v = view.current;
    if (el) el.style.transform = `translate(${50 - c.cx * c.k}%, ${50 - c.cy * c.k}%) scale(${c.k})`;
    if (v) {
      v.style.setProperty("--k", String(c.k));
      v.toggleAttribute("data-near", c.k >= K_NEAR);
    }
    if (c.k >= K_NEAR - 0.25) setWantDetail(true);
    if (commit) setUi(c);
  }, []);

  /** One eased flight; a far one climbs (zooms out) on the way and settles down. */
  const fly = useCallback((to: Cam, ms = 1100) => {
    cancelAnimationFrame(raf.current);
    const target = clamp(to);
    if (reduce.current) return apply(target, true);
    const from = cam.current;
    const travel = Math.hypot(target.cx - from.cx, target.cy - from.cy) * Math.min(from.k, target.k) / 100;
    const climb = Math.min(0.55, travel * 0.45);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e - climb * Math.sin(Math.PI * e));
      apply(clamp({ k, cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e }), t === 1);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [apply]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // The approach, once, when half the plate is on screen: 2.6 s from the whole city to the places.
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    apply(cam.current);
    const el = view.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        window.setTimeout(() => fly(framing(city.venues), 2600), 250);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [city.venues, fly, apply]);

  // A place chosen here or in the list beside the plate: fly to it.
  useEffect(() => {
    const v = city.venues.find((x) => x.n === focus);
    if (!v) return;
    const k = Math.max(cam.current.k, 3);
    // On phones the card docks over the plate's lower half: the place lands in its upper third.
    const docked = window.matchMedia("(max-width: 639.98px)").matches;
    fly({ k, cx: v.left, cy: v.top + (docked ? 20 / k : 0) }, 1300);
  }, [focus, city.venues, fly]);

  const zoomAt = (factor: number, px = 50, py = 50) => {
    const c = cam.current;
    const k = Math.min(K_MAX, Math.max(1, c.k * factor));
    const mx = c.cx + (px - 50) / c.k, my = c.cy + (py - 50) / c.k;
    fly({ k, cx: mx - (px - 50) / k, cy: my - (py - 50) / k }, 650);
  };
  const toPct = (e: { clientX: number; clientY: number }) => {
    const r = view.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    pointers.current.set(e.pointerId, toPct(e));
    if (cam.current.k <= 1.01 && e.pointerType === "touch" && pointers.current.size < 2) return; // let the page scroll
    cancelAnimationFrame(raf.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    gesture.current = { cam: cam.current, x: mid.x, y: mid.y, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, toPct(e));
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length > 1 && g.dist > 0) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const k = Math.min(K_MAX, Math.max(1, g.cam.k * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.dist)));
      const mx = g.cam.cx + (g.x - 50) / g.cam.k, my = g.cam.cy + (g.y - 50) / g.cam.k;
      apply(clamp({ k, cx: mx - (mid.x - 50) / k, cy: my - (mid.y - 50) / k }));
    } else {
      const p = pts[0];
      apply(clamp({ k: g.cam.k, cx: g.cam.cx - (p.x - g.x) / g.cam.k, cy: g.cam.cy - (p.y - g.y) / g.cam.k }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
      setUi(cam.current);
    } else if (gesture.current) {
      const p = [...pointers.current.values()][0];
      gesture.current = { cam: cam.current, x: p.x, y: p.y, dist: 0 };
    }
  };

  // Trackpad pinch arrives as ctrl+wheel; a plain wheel still scrolls the page.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    let settle = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      cancelAnimationFrame(raf.current);
      const r = el.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100, py = ((e.clientY - r.top) / r.height) * 100;
      const c = cam.current;
      const k = Math.min(K_MAX, Math.max(1, c.k * Math.exp(-e.deltaY * 0.01)));
      const mx = c.cx + (px - 50) / c.k, my = c.cy + (py - 50) / c.k;
      apply(clamp({ k, cx: mx - (px - 50) / k, cy: my - (py - 50) / k }));
      window.clearTimeout(settle);
      settle = window.setTimeout(() => setUi(cam.current), 120);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply]);

  const onKey = (e: React.KeyboardEvent) => {
    const c = cam.current, step = 8 / c.k;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => fly({ ...c, cx: c.cx - step }, 400),
      ArrowRight: () => fly({ ...c, cx: c.cx + step }, 400),
      ArrowUp: () => fly({ ...c, cy: c.cy - step }, 400),
      ArrowDown: () => fly({ ...c, cy: c.cy + step }, 400),
      "+": () => zoomAt(1.6),
      "=": () => zoomAt(1.6),
      "-": () => zoomAt(1 / 1.6),
      Escape: () => setFocus(null),
    };
    if (e.target !== e.currentTarget || !keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };

  // A live scale bar: the nicest round length that spans about a fifth of the view.
  const mPerPct = layers.widthM / 100 / ui.k;
  const len = NICE.reduce((best, n) => (Math.abs(n / mPerPct - 20) < Math.abs(best / mPerPct - 20) ? n : best), NICE[0]);
  const inv = "scale(calc(1 / var(--k)))";
  const focused = city.venues.find((v) => v.n === focus);

  const card = (v: MapVenue, wide = false) => (
    <div className={`sheet-in ${wide ? "w-full" : "w-[16rem]"} border border-paper-ink bg-paper px-4 pb-3.5 pt-3 text-paper-ink`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-paper-ink-3">{v.category}</p>
          <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">{v.name}</p>
        </div>
        <button type="button" onClick={() => setFocus(null)} aria-label={s.close} className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center text-paper-ink-2 hover:text-paper-ink">
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-paper-line pt-2.5">
        {v.slot ? (
          <Link href={v.slot.href} className="group/s">
            <span className="numerals block text-[26px] leading-none">{v.slot.label}</span>
            <span className="block text-[12px] text-paper-ink-3 group-hover/s:text-paper-ink">{v.slot.day}</span>
          </Link>
        ) : <span />}
        <Link href={v.href} className="btn btn-ink btn-sm">{s.open}</Link>
      </div>
      {onWalk ? (
        <button type="button" onClick={() => onWalk(v.n)} className="mt-2.5 flex min-h-9 w-full items-center gap-2 border-t border-paper-line pt-2 text-left text-[13px] font-semibold text-paper-ink-2 hover:text-paper-ink">
          <WalkIcon /> {s.walkHere}
        </button>
      ) : null}
    </div>
  );

  return (
    <figure className="min-w-0">
      <div className="bg-paper p-2 sm:p-2.5">
        <div
          ref={view}
          tabIndex={0}
          role="group"
          aria-roledescription="map"
          aria-label={s.aria}
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("a,button")) return;
            const p = toPct(e);
            zoomAt(1.8, p.x, p.y);
          }}
          className={`plan-view relative w-full select-none overflow-hidden outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-paper-ink)] ${dragging ? "cursor-grabbing" : ui.k > 1.01 ? "cursor-grab" : ""}`}
          style={{ aspectRatio: String(city.aspect), touchAction: ui.k > 1.01 ? "none" : "pan-y", ["--k" as string]: 1 }}
        >
          <div ref={camEl} className="plan-cam absolute inset-0">
            <img src={layers.relief} alt="" className="absolute inset-0 h-full w-full" loading="lazy" decoding="async" draggable={false} />
            <img src={layers.base} alt="" className="absolute inset-0 h-full w-full" loading="lazy" decoding="async" draggable={false} />
            {wantDetail ? <img src={layers.detail} alt="" className="plan-near absolute inset-0 h-full w-full" decoding="async" draggable={false} /> : null}

            <div aria-hidden="true">
              {layers.districts.map((d) => (
                <span key={d.t} className="plan-label plan-far plan-district" style={{ left: `${d.x}%`, top: `${d.y}%`, transform: `translate(-50%, -50%) ${inv}` }}>
                  {d.t}
                </span>
              ))}
              <span className="plan-label plan-range" style={{ left: `${layers.range.x}%`, top: `${layers.range.y}%`, transform: `translate(-50%, -50%) rotate(${layers.range.a ?? 0}deg) ${inv}` }}>
                {layers.range.t}
              </span>
              {layers.avenues.map((a) => (
                <span key={a.t} className="plan-label plan-near plan-avenue" style={{ left: `${a.x}%`, top: `${a.y}%`, transform: `translate(-50%, -50%) rotate(${a.a ?? 0}deg) ${inv}` }}>
                  {a.t}
                </span>
              ))}
              {layers.contours.map((c) => (
                <span key={c.t} className="plan-label plan-near plan-contour" style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translate(-50%, -50%) rotate(${c.a ?? 0}deg) ${inv}` }}>
                  {c.t}
                </span>
              ))}
              {layers.landmarks.map((l) => (
                <span key={l.k} className="plan-landmark" style={{ left: `${l.x}%`, top: `${l.y}%`, transform: `translate(-50%, -100%) ${inv}` }}>
                  <Landmark k={l.k} />
                  <span className="plan-label plan-near plan-landmark-name">{l.t}</span>
                </span>
              ))}
            </div>

            {city.venues.map((v) => {
              const on = active === v.n || focus === v.n;
              return (
                <Link
                  key={v.n}
                  href={v.href}
                  aria-label={`${v.name}, ${v.category}`}
                  onMouseEnter={() => setActive(v.n)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(v.n)}
                  onBlur={() => setActive(null)}
                  onClick={(e) => {
                    // First tap flies to the place and opens its card; the card links on.
                    if (focus === v.n) return;
                    e.preventDefault();
                    setFocus(v.n);
                    setActive(v.n);
                  }}
                  className="plan-pin group absolute grid h-11 w-11 place-items-center outline-none"
                  style={{ left: `${v.left}%`, top: `${v.top}%`, transform: `translate(-50%, -50%) ${inv}`, zIndex: on ? 3 : 2 }}
                >
                  {/* A printed stamp: an ink disc with the category, a hairline ring around it. */}
                  <span className={`plan-stamp grid h-8 w-8 place-items-center rounded-full ${on ? "is-on" : ""} group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--color-paper-ink)]`}>
                    <CategoryMark kind={v.kind} className="h-[18px] w-[18px]" />
                  </span>
                  <span className={`plan-label plan-venue ${on ? "is-on" : "plan-near"}`}>{v.name}</span>
                </Link>
              );
            })}

            {focused ? (
              <div className="plan-card absolute z-10 max-sm:hidden" style={{ left: `${focused.left}%`, top: `${focused.top}%`, transform: `translate(-50%, calc(-100% - 26px)) ${inv}`, transformOrigin: "50% 100%" }}>
                {card(focused)}
              </div>
            ) : null}
          </div>

          {/* On a phone the card docks to the plate's bottom edge instead of the pin. */}
          {focused ? <div className="absolute inset-x-2 bottom-2 z-10 sm:hidden">{card(focused, true)}</div> : null}

          {/* Fixed furniture: north, the city name, the zoom controls, the walk. */}
          <div aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2 text-paper-ink">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em]">{city.name}</span>
            <svg viewBox="0 0 14 20" className="h-4 w-3"><path d="M7 1l5 16-5-4-5 4z" fill="currentColor" /><path d="M7 1v12" stroke="#e9d7b5" strokeWidth="0.8" /></svg>
            <span className="text-[11px] font-semibold">{s.north}</span>
          </div>
          <div className="absolute right-2 top-2 flex flex-col border border-paper-ink bg-paper text-paper-ink">
            <button type="button" onClick={() => zoomAt(1.6)} disabled={ui.k >= K_MAX - 0.01} aria-label={s.zoomIn} className="grid h-11 w-11 place-items-center hover:bg-[#f3ead6] disabled:text-paper-line">
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M1 7h12M7 1v12" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <button type="button" onClick={() => zoomAt(1 / 1.6)} disabled={ui.k <= 1.01} aria-label={s.zoomOut} className="grid h-11 w-11 place-items-center border-t border-paper-line hover:bg-[#f3ead6] disabled:text-paper-line">
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M1 7h12" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <button type="button" onClick={() => { setFocus(null); fly({ k: 1, cx: 50, cy: 50 }, 1200); }} disabled={ui.k <= 1.01} aria-label={s.whole} className="grid h-11 w-11 place-items-center border-t border-paper-line hover:bg-[#f3ead6] disabled:text-paper-line">
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </div>
          {onWalk ? (
            <button type="button" onClick={() => onWalk()} className={`absolute left-2 flex min-h-11 items-center gap-2 border border-paper-ink bg-paper-ink px-3.5 text-[14px] font-semibold text-paper hover:bg-[#3a2a22] ${focused ? "bottom-2 max-sm:hidden" : "bottom-2"}`}>
              <WalkIcon /> {s.walk}
            </button>
          ) : null}
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <span aria-hidden="true" className="block h-[5px] border-x border-b border-ink-3 transition-[width] duration-300" style={{ width: `${len / mPerPct}%`, maxWidth: "40%" }} />
        <span className="num">{len >= 1000 ? `${len / 1000} ${s.km}` : `${len} ${s.m}`}</span>
        <span className="hidden sm:inline">{s.hint}</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="link-quiet ml-auto text-ink-3">
          © OpenStreetMap · AWS Terrain Tiles
        </a>
      </figcaption>
      <p className="sr-only" aria-live="polite">{focused ? focused.name : ""}</p>
    </figure>
  );
}

export function WalkIcon() {
  return (
    <svg viewBox="0 0 16 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="2.8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8 6.5l-2.5 3.5 2 2.5-1.5 6M8 6.5l1.5 4 3 1M7.5 12.5l3 2 1 4" />
    </svg>
  );
}

/** Landmarks as small printed pictograms, one ink, one weight. */
function Landmark({ k }: { k: PlanLandmark["k"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 20 24" className="mx-auto block h-6 w-5 text-paper-ink" aria-hidden="true">
      {k === "tower" ? (
        <g {...common}><path d="M10 1v22M6 23l4-14 4 14M7.5 9h5M8 5.5h4" /><circle cx="10" cy="7" r="1.6" fill="currentColor" /></g>
      ) : k === "hotel" ? (
        <g {...common}><path d="M5 23V7h10v16M5 11h10M5 15h10M5 19h10M9 7v16" /><path d="M4 7l1.5-3 1.5 2 1.5-3 1.5 3 1.5-3 1.5 3 1.5-2L16 7" /></g>
      ) : k === "bazaar" ? (
        <g {...common}><path d="M2 12l8-7 8 7M4 12v10h12V12M2 12h16M7 22v-6h6v6" /></g>
      ) : k === "cathedral" ? (
        <g {...common}><path d="M4 23V13h12v10M7 13V9h6v4M10 9V6" /><path d="M8.5 9c0-2 1.5-3 1.5-3s1.5 1 1.5 3M10 4v-3M9 2h2" /></g>
      ) : (
        <g {...common}><path d="M10 2v18M7 20h6M5 23h10" /><circle cx="10" cy="3.5" r="1.5" fill="currentColor" /></g>
      )}
    </svg>
  );
}
