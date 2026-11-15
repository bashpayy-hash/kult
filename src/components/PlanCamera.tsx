"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CategoryMark } from "./CategoryMark";
import type { MapCity, MapVenue } from "./CityMap";

export type PlanLabel = { t: string; x: number; y: number; a?: number };
export type PlanLandmark = { k: "tower" | "hotel" | "bazaar" | "cathedral" | "square"; t: string; x: number; y: number };
/** The plan as WebP tiles at several widths (scripts/render-map-tiles.mjs). */
export type TileSet = { url: string; tile: number; levels: { id: string; w: number; h: number; cols: number; rows: number; near: boolean }[] };
/** The detailed plan's layers and labels (src/lib/almatyPlan.generated.json). */
export type PlanLayers = {
  tiles: TileSet;
  avenues: PlanLabel[];
  districts: PlanLabel[];
  landmarks: PlanLandmark[];
  contours: PlanLabel[];
  range: PlanLabel;
  /** Plan width in metres, for the live scale bar. */
  widthM: number;
};
export type CameraStrings = { zoomIn: string; zoomOut: string; whole: string; aria: string; close: string; open: string; north: string; m: string; km: string; hint: string; twoFingers: string };

type Tile = { key: string; src: string; left: number; top: number; w: number; h: number };
/**
 * The tiles the view needs: the smallest level as sharp as the screen (a
 * phone counts as 2× at most), only those that overlap the view.
 */
function tilesFor(set: TileSet, c: Cam, near: boolean, plateCssW: number, dpr: number): { base: Tile[]; top: Tile[] } {
  const need = plateCssW * dpr * c.k;
  const pick = (ls: TileSet["levels"]) => ls.find((l) => l.w >= need * 0.8) ?? ls[ls.length - 1];
  const of = (L: TileSet["levels"][number]) => {
    const x0 = (c.cx - 50 / c.k) / 100, x1 = (c.cx + 50 / c.k) / 100, y0 = (c.cy - 50 / c.k) / 100, y1 = (c.cy + 50 / c.k) / 100;
    const out: Tile[] = [];
    for (let r = Math.max(0, Math.floor((y0 * L.h) / set.tile)); r <= Math.min(L.rows - 1, Math.floor((y1 * L.h - 1) / set.tile)); r++)
      for (let q = Math.max(0, Math.floor((x0 * L.w) / set.tile)); q <= Math.min(L.cols - 1, Math.floor((x1 * L.w - 1) / set.tile)); q++)
        out.push({ key: `${L.id}-${r}-${q}`, src: `${set.url}${L.id}-${r}-${q}.webp`, left: ((q * set.tile) / L.w) * 100, top: ((r * set.tile) / L.h) * 100, w: (set.tile / L.w) * 100, h: (Math.min(set.tile, L.h - r * set.tile) / L.h) * 100 });
    return out;
  };
  const bases = set.levels.filter((l) => !l.near), nears = set.levels.filter((l) => l.near);
  // The whole city at the smallest width is always there, so nothing is ever blank.
  const base = of(bases[0]);
  if (!near) {
    const b = pick(bases);
    return { base, top: b === bases[0] ? [] : of(b) };
  }
  const n = pick(nears);
  // The first close level stays under a sharper one while that one loads.
  return { base, top: n === nears[0] ? of(n) : [...of(nears[0]), ...of(n)] };
}

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
export function PlanCamera({ city, layers, active, setActive, focus, setFocus, s }: { city: MapCity; layers: PlanLayers; active: number | null; setActive: (n: number | null) => void; focus: number | null; setFocus: (n: number | null) => void; s: CameraStrings }) {
  const view = useRef<HTMLDivElement>(null);
  const camEl = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam>({ k: 1, cx: 50, cy: 50 });
  const raf = useRef(0);
  const [ui, setUi] = useState<Cam>({ k: 1, cx: 50, cy: 50 });
  const [dragging, setDragging] = useState(false);
  const [wantDetail, setWantDetail] = useState(false);
  // The whole city is in the server's HTML already: no blank plate before the script runs.
  const [tiles, setTiles] = useState<{ base: Tile[]; top: Tile[] }>(() => tilesFor(layers.tiles, { k: 1, cx: 50, cy: 50 }, false, 360, 1));
  const tileKey = useRef("");
  const settle = useRef(0);
  const [hint, setHint] = useState(false);
  // Labels that would sit under a place's stamp at this zoom step aside (places come first).
  const [clash, setClash] = useState<Set<string>>(() => new Set());
  const picked = useRef<(number | null)[]>([]);
  useEffect(() => {
    picked.current = [active, focus];
  }, [active, focus]);
  const hintTimer = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ cam: Cam; x: number; y: number; dist: number } | null>(null);
  const reduce = useRef(false);

  /** The tiles for a camera; React hears about it only when the set changes. */
  const refreshTiles = useCallback((c: Cam) => {
    const v = view.current;
    if (!v) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const next = tilesFor(layers.tiles, c, c.k >= K_NEAR - 0.25, v.clientWidth || 360, Math.min(window.devicePixelRatio || 1, coarse ? 2 : 2.5));
    const key = next.base.map((t) => t.key).join() + "|" + next.top.map((t) => t.key).join();
    if (key !== tileKey.current) {
      tileKey.current = key;
      setTiles(next);
    }
    // On screen, how far is each label from the nearest place? Closer than its own reach: hidden.
    const W = v.clientWidth, H = v.clientHeight;
    // A place takes its stamp and its name to the right (about 7 px a letter), plus a margin.
    // (lift: a landmark stands on its point, so its middle is that many pixels higher.)
    const near = (x: number, y: number, reach: number, lift = 0) =>
      city.venues.some((p) => {
        const dx = ((x - p.left) * W * c.k) / 100, dy = ((y - p.top) * H * c.k) / 100 - lift;
        if (Math.hypot(dx, dy) < reach) return true;
        const named = c.k >= K_NEAR || picked.current.includes(p.n);
        return named && dx > 0 && dx < 30 + p.name.length * 7.2 + reach * 0.4 && Math.abs(dy) < 14 + reach * 0.3;
      });
    const hide = new Set<string>();
    for (const l of layers.landmarks) if (near(l.x, l.y, 56, 20)) hide.add(`l:${l.k}`);
    for (const a of layers.avenues) if (near(a.x, a.y, 56)) hide.add(`a:${a.t}`);
    for (const t of layers.contours) if (near(t.x, t.y, 48)) hide.add(`c:${t.t}`);
    for (const d of layers.districts) if (near(d.x, d.y, 52)) hide.add(`d:${d.t}`);
    setClash((prev) => (prev.size === hide.size && [...hide].every((k) => prev.has(k)) ? prev : hide));
  }, [layers, city.venues]);

  /**
   * Puts the camera on the page: one transform, one custom property. While
   * it moves, the plate is its own GPU layer (will-change) and is only
   * scaled, never redrawn; once it rests for a moment it is redrawn sharp.
   */
  const apply = useCallback((c: Cam, commit = false) => {
    cam.current = c;
    const el = camEl.current, v = view.current;
    if (el) {
      el.style.transform = `translate(${50 - c.cx * c.k}%, ${50 - c.cy * c.k}%) scale(${c.k})`;
      el.classList.add("is-moving");
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        el.classList.remove("is-moving");
        refreshTiles(cam.current);
      }, 180);
    }
    if (v) {
      v.style.setProperty("--k", String(c.k));
      v.toggleAttribute("data-near", c.k >= K_NEAR);
    }
    if (c.k >= K_NEAR - 0.25) setWantDetail(true);
    if (commit) {
      setUi(c);
      refreshTiles(c);
    }
  }, [refreshTiles]);

  /** One eased flight; a far one climbs (zooms out) on the way and settles down. */
  const fly = useCallback((to: Cam, ms = 1100) => {
    cancelAnimationFrame(raf.current);
    const target = clamp(to);
    if (reduce.current) return apply(target, true);
    const from = cam.current;
    const travel = Math.hypot(target.cx - from.cx, target.cy - from.cy) * Math.min(from.k, target.k) / 100;
    const climb = Math.min(0.55, travel * 0.45);
    const t0 = performance.now();
    let prefetched = false;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e - climb * Math.sin(Math.PI * e));
      const c = clamp({ k, cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e });
      apply(c, t === 1);
      // Start loading the destination's tiles while still on the way.
      if (t > 0.55 && !prefetched) {
        prefetched = true;
        refreshTiles(target);
      }
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [apply, refreshTiles]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(settle.current);
    window.clearTimeout(hintTimer.current);
  }, []);

  // The approach, once, when half the plate is on screen: 2.6 s from the whole city to the places.
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    apply(cam.current, true);
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
    // On a phone one finger scrolls the page past the map, two fingers move
    // and pinch it (a map that grabs every swipe traps the page).
    if (e.pointerType === "touch" && pointers.current.size < 2) {
      gesture.current = null;
      return;
    }
    cancelAnimationFrame(raf.current);
    const el = e.currentTarget as HTMLElement;
    for (const id of pointers.current.keys()) {
      try { el.setPointerCapture(id); } catch { /* the first finger may have been released already */ }
    }
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    gesture.current = { cam: cam.current, x: mid.x, y: mid.y, dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    if (!gesture.current) {
      // One finger sliding sideways over a zoomed map: say how to move it.
      const start = pointers.current.get(e.pointerId)!, now = toPct(e);
      if (e.pointerType === "touch" && cam.current.k > 1.01 && Math.abs(now.x - start.x) > 6 && !hint) {
        setHint(true);
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(false), 1600);
      }
      return;
    }
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
      refreshTiles(cam.current);
    } else if (gesture.current) {
      // Down to one finger: on a phone that ends the move, with a mouse it carries on.
      if (e.pointerType === "touch") {
        gesture.current = null;
        setDragging(false);
        setUi(cam.current);
        refreshTiles(cam.current);
      } else {
        const p = [...pointers.current.values()][0];
        gesture.current = { cam: cam.current, x: p.x, y: p.y, dist: 0 };
      }
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
          style={{ aspectRatio: String(city.aspect), touchAction: "pan-y", ["--k" as string]: 1 }}
        >
          <div ref={camEl} className="plan-cam absolute inset-0">
            {tiles.base.map((t) => <TileImg key={t.key} t={t} />)}
            {wantDetail || tiles.top.length ? (
              <div className={wantDetail ? "plan-near" : ""}>
                {tiles.top.map((t) => <TileImg key={t.key} t={t} />)}
              </div>
            ) : null}

            <div aria-hidden="true">
              {layers.districts.map((d) => (
                <span key={d.t} className={`plan-label plan-far plan-district ${clash.has(`d:${d.t}`) ? "plan-clash" : ""}`} style={{ left: `${d.x}%`, top: `${d.y}%`, transform: `translate(-50%, -50%) ${inv}` }}>
                  {d.t}
                </span>
              ))}
              <span className="plan-label plan-range" style={{ left: `${layers.range.x}%`, top: `${layers.range.y}%`, transform: `translate(-50%, -50%) rotate(${layers.range.a ?? 0}deg) ${inv}` }}>
                {layers.range.t}
              </span>
              {layers.avenues.map((a) => (
                <span key={a.t} className={`plan-label plan-near plan-avenue ${clash.has(`a:${a.t}`) ? "plan-clash" : ""}`} style={{ left: `${a.x}%`, top: `${a.y}%`, transform: `translate(-50%, -50%) rotate(${a.a ?? 0}deg) ${inv}` }}>
                  {a.t}
                </span>
              ))}
              {layers.contours.map((c) => (
                <span key={c.t} className={`plan-label plan-near plan-contour ${clash.has(`c:${c.t}`) ? "plan-clash" : ""}`} style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translate(-50%, -50%) rotate(${c.a ?? 0}deg) ${inv}` }}>
                  {c.t}
                </span>
              ))}
              {layers.landmarks.map((l) => (
                <span key={l.k} className={`plan-landmark ${clash.has(`l:${l.k}`) ? "plan-clash" : ""}`} style={{ left: `${l.x}%`, top: `${l.y}%`, transform: `translate(-50%, -100%) ${inv}` }}>
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

          {hint ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[rgba(35,25,23,0.42)]">
              <p className="sheet-in border border-paper-ink bg-paper px-4 py-2.5 text-[14px] font-semibold text-paper-ink">{s.twoFingers}</p>
            </div>
          ) : null}

          {/* On a phone the card docks to the plate's bottom edge instead of the pin. */}
          {focused ? <div className="absolute inset-x-2 bottom-2 z-10 sm:hidden">{card(focused, true)}</div> : null}

          {/* Fixed furniture: north, the city name, the zoom controls. */}
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
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <span aria-hidden="true" className="block h-[5px] border-x border-b border-ink-3 transition-[width] duration-300" style={{ width: `${len / mPerPct}%`, maxWidth: "40%" }} />
        <span className="num">{len >= 1000 ? `${len / 1000} ${s.km}` : `${len} ${s.m}`}</span>
        <span className="hidden sm:inline">{s.hint}</span>
        <span className="sm:hidden">{s.twoFingers}</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="link-quiet ml-auto text-ink-3">
          © OpenStreetMap · AWS Terrain Tiles
        </a>
      </figcaption>
      <p className="sr-only" aria-live="polite">{focused ? focused.name : ""}</p>
    </figure>
  );
}

/** One tile: decoded off the main thread, faded in when ready, a hair wider so no seam shows. */
function TileImg({ t }: { t: Tile }) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A tile the server sent may finish loading before React is listening.
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth) setReady(true);
  }, []);
  return (
    <img
      ref={ref}
      src={t.src}
      alt=""
      draggable={false}
      decoding="async"
      onLoad={() => setReady(true)}
      className={`plan-tile absolute ${ready ? "is-ready" : ""}`}
      style={{ left: `${t.left}%`, top: `${t.top}%`, width: `calc(${t.w}% + 0.6px)`, height: `calc(${t.h}% + 0.6px)` }}
    />
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
