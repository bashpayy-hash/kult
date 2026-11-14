"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
export type CameraStrings = { zoomIn: string; zoomOut: string; whole: string; aria: string; close: string; open: string; north: string; m: string; km: string; hint: string };

type Cam = { k: number; cx: number; cy: number };
const K_MAX = 4.5;
/** Closer than this, buildings, small streets and street names are drawn. */
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

/**
 * The detailed city plan with a camera (14 Nov 2026, owner: «детальная и
 * реалистичная, концептуальная карта в стиле всего сайта с анимациями
 * приближения»). Three printed layers (relief, base, detail) and the labels
 * sit in one box that only moves by transform; labels, landmarks and places
 * scale back by 1/k so they keep their size. The approach: when the plate
 * first comes into view the camera glides from the whole city down to the
 * quarter with the places; a place tapped flies the camera to it.
 */
export function PlanCamera({ city, layers, active, setActive, focus, setFocus, s }: { city: MapCity; layers: PlanLayers; active: number | null; setActive: (n: number | null) => void; focus: number | null; setFocus: (n: number | null) => void; s: CameraStrings }) {
  const view = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Cam>({ k: 1, cx: 50, cy: 50 });
  const [moving, setMoving] = useState<"" | "glide" | "approach">("");
  const [dragging, setDragging] = useState(false);
  const [wantDetail, setWantDetail] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ cam: Cam; x: number; y: number; dist: number; moved: boolean } | null>(null);
  const reduce = useRef(false);

  const go = useCallback((next: Cam, how: "glide" | "approach" = "glide") => {
    setMoving(reduce.current ? "" : how);
    setCam(clamp(next));
  }, []);

  // The detail layer (≈400 KB) loads the first time the camera comes close, then stays.
  if (!wantDetail && cam.k >= K_NEAR - 0.25) setWantDetail(true);

  // The approach, once, when half the plate is on screen.
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = view.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const target = framing(city.venues);
        if (reduce.current) setCam(target);
        else window.setTimeout(() => go(target, "approach"), 350);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [city.venues, go]);

  const zoomAt = (factor: number, px?: number, py?: number) => {
    const c = cam;
    const k = Math.min(K_MAX, Math.max(1, c.k * factor));
    if (px === undefined || py === undefined) return go({ ...c, k });
    // Keep the point under the finger where it is.
    const mx = c.cx + (px - 50) / c.k, my = c.cy + (py - 50) / c.k;
    go({ k, cx: mx - (px - 50) / k, cy: my - (py - 50) / k });
  };
  const toPct = (e: { clientX: number; clientY: number }) => {
    const r = view.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    pointers.current.set(e.pointerId, toPct(e));
    if (cam.k <= 1.01 && e.pointerType === "touch" && pointers.current.size < 2) return; // let the page scroll
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    gesture.current = { cam, x: mid.x, y: mid.y, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, moved: false };
    setDragging(true);
    setMoving("");
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
      setCam(clamp({ k, cx: mx - (mid.x - 50) / k, cy: my - (mid.y - 50) / k }));
    } else {
      const p = pts[0];
      if (Math.abs(p.x - g.x) + Math.abs(p.y - g.y) > 0.6) g.moved = true;
      setCam(clamp({ k: g.cam.k, cx: g.cam.cx - (p.x - g.x) / g.cam.k, cy: g.cam.cy - (p.y - g.y) / g.cam.k }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
    } else if (gesture.current) {
      const p = [...pointers.current.values()][0];
      gesture.current = { cam, x: p.x, y: p.y, dist: 0, moved: true };
    }
  };

  // Trackpad pinch arrives as ctrl+wheel; a plain wheel still scrolls the page.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100, py = ((e.clientY - r.top) / r.height) * 100;
      setMoving("");
      setCam((c) => {
        const k = Math.min(K_MAX, Math.max(1, c.k * Math.exp(-e.deltaY * 0.01)));
        const mx = c.cx + (px - 50) / c.k, my = c.cy + (py - 50) / c.k;
        return clamp({ k, cx: mx - (px - 50) / k, cy: my - (py - 50) / k });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const flyTo = (v: MapVenue) => {
    setFocus(v.n);
    setActive(v.n);
  };
  // A place chosen here or in the list beside the plate: fly to it.
  useEffect(() => {
    const v = city.venues.find((x) => x.n === focus);
    if (!v) return;
    setMoving(reduce.current ? "" : "glide");
    setCam((c) => clamp({ k: Math.max(c.k, 3), cx: v.left, cy: v.top }));
  }, [focus, city.venues]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = 8 / cam.k;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => go({ ...cam, cx: cam.cx - step }),
      ArrowRight: () => go({ ...cam, cx: cam.cx + step }),
      ArrowUp: () => go({ ...cam, cy: cam.cy - step }),
      ArrowDown: () => go({ ...cam, cy: cam.cy + step }),
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
  const mPerPct = layers.widthM / 100 / cam.k;
  const len = NICE.reduce((best, n) => (Math.abs(n / mPerPct - 20) < Math.abs(best / mPerPct - 20) ? n : best), NICE[0]);
  const near = cam.k >= K_NEAR;
  const inv = `scale(${1 / cam.k})`;
  const focused = city.venues.find((v) => v.n === focus);

  const card = (v: MapVenue, wide = false) => (
    <div className={`sheet-in ${wide ? "w-full" : "w-[15.5rem]"} border border-paper-ink bg-paper px-4 pb-3.5 pt-3 text-paper-ink`}>
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
          className={`plan-view relative w-full select-none overflow-hidden outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-paper-ink)] ${dragging ? "cursor-grabbing" : cam.k > 1.01 ? "cursor-grab" : ""}`}
          style={{ aspectRatio: String(city.aspect), touchAction: cam.k > 1.01 ? "none" : "pan-y" }}
          data-near={near ? "" : undefined}
        >
          <div
            className={`plan-cam absolute inset-0 ${moving ? `plan-${moving}` : ""}`}
            style={{ transform: `translate(${50 - cam.cx * cam.k}%, ${50 - cam.cy * cam.k}%) scale(${cam.k})` }}
            onTransitionEnd={() => setMoving("")}
          >
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

            {city.venues.map((v) => (
              <Link
                key={v.n}
                href={v.href}
                aria-label={`${v.n}. ${v.name}`}
                onMouseEnter={() => setActive(v.n)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(v.n)}
                onBlur={() => setActive(null)}
                onClick={(e) => {
                  // First tap flies to the place and opens its card; the card links on.
                  if (focus === v.n) return;
                  e.preventDefault();
                  flyTo(v);
                }}
                className="plan-pin group absolute grid h-11 w-11 place-items-center outline-none"
                style={{ left: `${v.left}%`, top: `${v.top}%`, transform: `translate(-50%, -50%) ${inv}`, zIndex: active === v.n || focus === v.n ? 3 : 2, ["--n" as string]: v.n - 1 }}
              >
                <span
                  className={`num grid h-6 min-w-6 place-items-center px-1 text-[12px] leading-none transition-colors duration-150 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--color-paper-ink)] ${active === v.n || focus === v.n ? "bg-accent text-paper-ink" : "bg-paper-ink text-paper"}`}
                >
                  {v.n}
                </span>
              </Link>
            ))}

            {focused ? (
              <div className="plan-card absolute z-10 max-sm:hidden" style={{ left: `${focused.left}%`, top: `${focused.top}%`, transform: `translate(-50%, calc(-100% - 22px)) ${inv}`, transformOrigin: "50% 100%" }}>
                {card(focused)}
              </div>
            ) : null}
          </div>

          {/* On a phone the card docks to the plate's bottom edge instead of the pin. */}
          {focused ? <div className="absolute inset-x-2 bottom-2 z-10 sm:hidden">{card(focused, true)}</div> : null}

          {/* Fixed furniture: north, the city name, the zoom controls. */}
          <div aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2 text-paper-ink">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em]">{city.name}</span>
            <svg viewBox="0 0 14 20" className="h-4 w-3"><path d="M7 1l5 16-5-4-5 4z" fill="currentColor" /><path d="M7 1v12" stroke="#e9d7b5" strokeWidth="0.8" /></svg>
            <span className="text-[11px] font-semibold">{s.north}</span>
          </div>
          <div className="absolute right-2 top-2 flex flex-col border border-paper-ink bg-paper text-paper-ink">
            <button type="button" onClick={() => zoomAt(1.6)} disabled={cam.k >= K_MAX - 0.01} aria-label={s.zoomIn} className="grid h-11 w-11 place-items-center hover:bg-[#f3ead6] disabled:text-paper-line">
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M1 7h12M7 1v12" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <button type="button" onClick={() => zoomAt(1 / 1.6)} disabled={cam.k <= 1.01} aria-label={s.zoomOut} className="grid h-11 w-11 place-items-center border-t border-paper-line hover:bg-[#f3ead6] disabled:text-paper-line">
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M1 7h12" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <button type="button" onClick={() => { setFocus(null); go({ k: 1, cx: 50, cy: 50 }); }} disabled={cam.k <= 1.01} aria-label={s.whole} className="grid h-11 w-11 place-items-center border-t border-paper-line hover:bg-[#f3ead6] disabled:text-paper-line">
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <span aria-hidden="true" className="block h-[5px] border-x border-b border-ink-3 transition-[width] duration-300" style={{ width: `${(len / mPerPct) * 0.01 * 100}%`, maxWidth: "40%" }} />
        <span className="num">{len >= 1000 ? `${len / 1000} ${s.km}` : `${len} ${s.m}`}</span>
        <span className="hidden sm:inline">{s.hint}</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="link-quiet ml-auto text-ink-3">
          © OpenStreetMap · AWS Terrain Tiles
        </a>
      </figcaption>
      <p className="sr-only" aria-live="polite">{focused ? `${focused.n}. ${focused.name}` : ""}</p>
    </figure>
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
