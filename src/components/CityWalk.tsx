"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CategoryMark } from "./CategoryMark";

/**
 * A walk through central Almaty (14 Nov 2026, owner: «иммерзнуться именно в
 * сам город… сделать как будто вот этот ретро-стиль, и был сраундинг в этом
 * ретро-стиле… пару улиц сделать и там гулять… киллер-фича»).
 *
 * The city is built in the browser from public/maps/almaty/walk.json
 * (scripts/build-walk-scene.py: OpenStreetMap buildings with their real
 * heights, streets, parks, rivers, trees; the mountains from SRTM). It is
 * drawn the way the site prints things: flat pastel facades with window
 * rows and an ink outline, golden autumn poplars, a faded sky, the snowy
 * Zailiysky Alatau in haze, a red-and-cream trolleybus on Dostyk, Hotel
 * Kazakhstan with its crown and the Kok-Tobe tower on its hill. The camera
 * comes down from the map (a top-down view, like the plate) to the city,
 * and on three streets it walks at eye height.
 */

export type WalkVenue = { n: number; name: string; category: string; kind: string; href: string; lat: number; lng: number; slot?: { label: string; day: string; href: string } };
export type WalkStrings = { title: string; air: string; hint: string; hintTouch: string; forward: string; back: string; go: string; stop: string; loading: string; close: string; open: string; routes: string; fail: string };

type Scene = {
  origin: [number, number];
  k: [number, number];
  pal: string[];
  b: number[][];
  r: number[][];
  g: number[][];
  w: number[][];
  t: number[];
  routes: { id: string; ru: string; kk: string; len: number; road?: number; p: number[] }[];
  dem: { w: number; h: number; x0: number; z0: number; x1: number; z1: number; data: string };
  kokTobe: [number, number, number];
  lamps?: number[];
  /** Shop lettering over the awnings: x0, z0, x1, z1, word. */
  signs?: number[][];
  /** Mosaic panels: x0, z0, x1, z1, y0, y1, design. */
  mosaics?: number[][];
  /** Rooftop letters: x, z, roof height, yaw, width, word. */
  roofSigns?: number[][];
  /** Street furniture: kind (0 café table, 1 parked car, 2 kvass barrel, 3 bench, 4 fountain), x, z, yaw. */
  props?: number[][];
  words?: string[];
  roofWords?: string[];
};

const INK = new THREE.Color("#3a2a20");
// Late-afternoon Alma-Ata in October: a low warm sun, apricot haze, a faded teal sky.
const HAZE = new THREE.Color("#efd6ab");
const SUN_DIR = new THREE.Vector3(-0.78, 0.13, 0.52).normalize();
const CARS = ["#e8dcc0", "#9fb7c4", "#c25b3f", "#7f8f6a", "#d9b45a", "#f1ece0", "#5f7d8c", "#a4473a"];
const AWNINGS = ["#f4ead6", "#b8553a", "#4f7d78", "#c69a3b"];
const FONT = '"Inter Tight Variable", system-ui, sans-serif';
const ROAD = ["#9c907f", "#a3978a", "#ab9f8d", "#b4a892", "#d9ccb2"];
const ROAD_W = [24, 18, 13, 8, 9];
const AUTUMN = ["#6f7b3a", "#8a8a3f", "#b08a36", "#c69a3b", "#7f6f34", "#5f6b33"];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Pose = { pos: THREE.Vector3; look: THREE.Vector3 };

/**
 * Film mode, for the home page's cover loop (scripts/render-hero-film.cjs):
 * the recorder sets `window.__walkFilm = {}` before the walk opens, then
 * drives the camera frame by frame at a fixed time step and takes each
 * frame from the canvas. No interface is drawn over the city.
 */
type Film = { ready?: boolean; route?: (id: string) => number[]; frame?: (pos: number[], look: number[], dt: number) => string };
const filmHooks = () => (typeof window === "undefined" ? undefined : (window as unknown as { __walkFilm?: Film }).__walkFilm);

export default function CityWalk({ venues, startVenue, lang, onClose, s }: { venues: WalkVenue[]; startVenue?: number; lang: "ru" | "kk"; onClose: () => void; s: WalkStrings }) {
  const host = useRef<HTMLDivElement>(null);
  const signs = useRef<(HTMLDivElement | null)[]>([]);
  const api = useRef<{ walk: (id: string, from?: number) => void; air: () => void; setMove: (v: number) => void; toggleAuto: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fail">("loading");
  const [mode, setMode] = useState<string>("air");
  const [routes, setRoutes] = useState<Scene["routes"]>([]);
  const [auto, setAuto] = useState(false);
  const [card, setCard] = useState<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [filming] = useState(() => !!filmHooks());

  useEffect(() => {
    closeBtn.current?.focus();
    const onKeyClose = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyClose);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyClose);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Phones get half the trees, plainer crowns, a lower pixel ratio and 30
    // frames a second while nothing moves (15 Nov 2026, owner: «очень много
    // лагов… особенность телефона… мощнейшая оптимизация»).
    const lite = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 700;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // The pixel ratio follows the frame rate: down a step when frames run
    // long, up once when there is room, between 0.75 and the cap.
    const DPR_CAP = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75);
    let dpr = Math.min(DPR_CAP, lite ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.className = "walk-canvas";
    // iOS drops WebGL when the app goes to the background for long: say so instead of a black screen.
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setState("fail");
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(HAZE, 900, 16000);
    const camera = new THREE.PerspectiveCamera(55, 1, 1, 40000);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 68 : 55;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    const disposables: { dispose: () => void }[] = [renderer];

    // Late-afternoon light from the south-west, a warm sky dome, haze.
    scene.add(new THREE.HemisphereLight(0xf6e6cc, 0x7d6a55, 1.05));
    const sun = new THREE.DirectionalLight(0xffd8ad, 1.5);
    sun.position.set(-0.7, 0.5, 0.5).multiplyScalar(1000);
    scene.add(sun);
    const skyGeo = new THREE.SphereGeometry(30000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color("#8fb0b8") }, mid: { value: new THREE.Color("#efd3a4") }, low: { value: HAZE }, sunDir: { value: SUN_DIR }, sunCol: { value: new THREE.Color("#ffd9a0") } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      // The sun low in the south-west: a soft disc and its glow in the haze.
      fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP; void main(){ vec3 n = normalize(vP); float h = clamp(n.y, 0.0, 1.0); vec3 c = mix(low, mid, smoothstep(0.0, 0.14, h)); c = mix(c, top, smoothstep(0.12, 0.65, h)); float d = max(dot(n, sunDir), 0.0); c += sunCol * (smoothstep(0.9994, 0.9997, d) * 0.55 + pow(d, 28.0) * 0.18); gl_FragColor = vec4(c, 1.0); }",
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    disposables.push(skyGeo, skyMat);

    const signAnchors: THREE.Vector3[] = [];
    let data: Scene | null = null;
    let ready = false;
    // Things that drive: the trolleybus shuttles, the cars loop.
    const movers: { mesh?: THREE.Group; slot?: number; path: THREE.Vector3[]; cum: number[]; s: number; dir: number; speed: number; loop: boolean }[] = [];
    let cars: THREE.InstancedMesh[] = [];
    const carM = new THREE.Matrix4(), carQ = new THREE.Quaternion(), carP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
    const jets: THREE.Mesh[] = [];

    // ── Camera rig ─────────────────────────────────────────────────────────
    const cur: Pose = { pos: new THREE.Vector3(0, 4200, 1), look: new THREE.Vector3(0, 0, 0) };
    let flight: { from: Pose; to: Pose; t0: number; ms: number; arc: number; done?: () => void } | null = null;
    const air = { target: new THREE.Vector3(0, 0, 200), radius: 1500, pitch: 0.42, yaw: Math.PI };
    let walk: { pts: THREE.Vector3[]; cum: number[]; len: number; s: number; sTo: number; yaw: number; yawTo: number; pitch: number; v: number } | null = null;
    let modeNow: "air" | "walk" | "fly" | "film" = "fly";
    const film = filmHooks();
    let filmDt: number | null = null;
    let autoOn = false;

    const airPose = (): Pose => {
      const { target, radius, pitch, yaw } = air;
      const pos = new THREE.Vector3(target.x + Math.sin(yaw) * Math.cos(pitch) * radius, target.y + Math.sin(pitch) * radius, target.z + Math.cos(yaw) * Math.cos(pitch) * radius);
      return { pos, look: target.clone() };
    };
    const along = (w: NonNullable<typeof walk>, sAt: number) => {
      const d = Math.max(0, Math.min(w.len - 0.01, sAt));
      let i = 1;
      while (i < w.cum.length - 1 && w.cum[i] < d) i++;
      const a = w.pts[i - 1], b = w.pts[i];
      const f = (d - w.cum[i - 1]) / Math.max(0.001, w.cum[i] - w.cum[i - 1]);
      return { p: a.clone().lerp(b, f), dir: b.clone().sub(a).normalize() };
    };
    const walkPose = (w: NonNullable<typeof walk>): Pose => {
      const { p, dir } = along(w, w.s);
      const ahead = along(w, w.s + 24).p;
      const base = Math.atan2(ahead.x - p.x || dir.x, ahead.z - p.z || dir.z);
      const yaw = base + w.yaw;
      const bob = reduce ? 0 : Math.sin(w.s * 1.15) * 0.035 * Math.min(1, Math.abs(w.v) * 0.3);
      const pos = new THREE.Vector3(p.x, 1.7 + bob, p.z);
      return { pos, look: new THREE.Vector3(p.x + Math.sin(yaw) * 30, 1.7 + Math.tan(w.pitch) * 30, p.z + Math.cos(yaw) * 30) };
    };
    const flyTo = (to: Pose, ms: number, arc = 0, done?: () => void) => {
      if (reduce) {
        cur.pos.copy(to.pos);
        cur.look.copy(to.look);
        done?.();
        return;
      }
      flight = { from: { pos: cur.pos.clone(), look: cur.look.clone() }, to, t0: performance.now(), ms, arc, done };
      modeNow = "fly";
    };

    const startWalk = (id: string, fromS?: number) => {
      if (!data) return;
      const r = data.routes.find((x) => x.id === id);
      if (!r) return;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < r.p.length; i += 2) pts.push(new THREE.Vector3(r.p[i], 1.7, r.p[i + 1]));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const sAt = Math.max(0, Math.min(cum[cum.length - 1] - 30, fromS ?? 0));
      // A tall phone screen looks a little up, so the street fills it rather than the paving.
      const pitch = el.clientWidth < el.clientHeight ? 0.12 : 0.02;
      walk = { pts, cum, len: cum[cum.length - 1], s: sAt, sTo: sAt, yaw: 0, yawTo: 0, pitch, v: 0 };
      const end = walkPose(walk);
      setMode(id);
      // Down from where we are, in an arc, to eye height.
      flyTo(end, 2600, 140, () => (modeNow = "walk"));
    };
    const toAir = (target?: THREE.Vector3, radius = 1500) => {
      walk = null;
      autoOn = false;
      setAuto(false);
      if (target) air.target.copy(target);
      air.radius = radius;
      air.pitch = 0.42;
      setMode("air");
      flyTo(airPose(), 2200, 0, () => (modeNow = "air"));
    };
    api.current = {
      walk: startWalk,
      air: () => toAir(),
      setMove: (v) => walk && (walk.v = v),
      toggleAuto: () => {
        autoOn = !autoOn;
        setAuto(autoOn);
      },
    };

    // ── Build the city ─────────────────────────────────────────────────────
    const toXZ = (lat: number, lng: number, d: Scene) => new THREE.Vector3((lng - d.origin[1]) * d.k[0], 0, (d.origin[0] - lat) * d.k[1]);

    // Facades, each a 4 × 4 block of bays so a few windows can be lit warm.
    // Seeded, so the city is the same every visit.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const LIT = ["#f1cf8c", "#e9b871", "#f4dca8"];
    function facade(kind: "panel" | "brise" | "glass") {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d")!;
      if (kind === "glass") {
        // Today's towers: tinted glass in a fine grid, the sky's light on top.
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#e3ecee");
        grad.addColorStop(1, "#9db1b9");
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 8; r++)
          for (let k = 0; k < 8; k++) {
            if (rnd() < 0.1) {
              g.fillStyle = "rgba(241,207,140,0.55)";
              g.fillRect(k * 32, r * 32, 32, 32);
            }
          }
        g.fillStyle = "#f4f7f8";
        for (let k = 0; k < 8; k++) g.fillRect(k * 32, 0, 2, 256);
        g.fillStyle = "#6f8189";
        for (let r = 0; r < 8; r++) g.fillRect(0, r * 32 + 29, 256, 3);
      } else {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 4; k++) {
            const x = k * 64, y = r * 64;
            const lit = rnd() < 0.14 ? LIT[Math.floor(rnd() * 3)] : null;
            if (kind === "panel") {
              g.fillStyle = lit ?? (rnd() < 0.2 ? "#9a8370" : "#8d8378");
              g.fillRect(x + 16, y + 14, 32, 34);
              g.fillStyle = "#c9c0b3";
              g.fillRect(x + 31, y + 14, 2, 34);
              g.fillRect(x + 16, y + 29, 32, 2);
              g.fillStyle = "#e9e2d6";
              g.fillRect(x + 14, y + 48, 36, 3);
            } else {
              // Alma-Ata's sun-breakers: a deep concrete cell, two fins, the window far back.
              g.fillStyle = "#7d7266";
              g.fillRect(x + 6, y + 6, 52, 52);
              g.fillStyle = lit ?? "#5d554d";
              g.fillRect(x + 12, y + 14, 40, 40);
              g.fillStyle = "rgba(40,30,24,0.35)";
              g.fillRect(x + 6, y + 6, 52, 7);
              g.fillRect(x + 6, y + 6, 5, 52);
              g.fillStyle = "#ffffff";
              g.fillRect(x + 23, y + 6, 5, 52);
              g.fillRect(x + 37, y + 6, 5, 52);
            }
          }
      }
      return tex(c);
    }

    // Smalt mosaics of the 70s–80s, drawn small and laid in tiles with grout:
    // 0 the apple (Alma-Ata, «father of apples») under the sun and peaks,
    // 1 poplars before the snowy range, 2 the ram's horn, қошқар мүйіз.
    function mosaic(design: number, aspect: number) {
      const W = 44, H = Math.max(14, Math.min(60, Math.round(W / aspect)));
      const lo = document.createElement("canvas");
      lo.width = W;
      lo.height = H;
      const g = lo.getContext("2d")!;
      const sky = (a: string, b: string) => {
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, a);
        gr.addColorStop(1, b);
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      };
      const disc = (x: number, y: number, r: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      const range = (y: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(0, H);
        g.lineTo(0, y + H * 0.12);
        const peaks = [[0.22, -0.2], [0.4, 0.04], [0.6, -0.26], [0.8, 0.02], [1, -0.08]];
        for (const [px, py] of peaks) g.lineTo(px * W, y + py * H);
        g.lineTo(W, H);
        g.fill();
        g.fillStyle = "#f4ead6";
        for (const [px, py] of peaks) if (py < -0.1) { g.beginPath(); g.moveTo(px * W, y + py * H); g.lineTo(px * W - H * 0.08, y + (py + 0.08) * H); g.lineTo(px * W + H * 0.08, y + (py + 0.08) * H); g.fill(); }
      };
      if (design === 0) {
        sky("#e9b866", "#f4dfb6");
        disc(W * 0.22, H * 0.28, H * 0.15, "#d9532e");
        range(H * 0.62, "#5f7d8c");
        disc(W * 0.66, H * 0.5, H * 0.24, "#c23b22");
        disc(W * 0.6, H * 0.42, H * 0.08, "#e8735a");
        g.fillStyle = "#5b7a3a";
        g.beginPath();
        g.ellipse(W * 0.72, H * 0.2, H * 0.1, H * 0.05, -0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#3a2a20";
        g.fillRect(W * 0.66 - 0.5, H * 0.18, 1, H * 0.1);
      } else if (design === 1) {
        sky("#8fb0b8", "#efd3a4");
        disc(W * 0.78, H * 0.22, H * 0.12, "#e9b866");
        range(H * 0.5, "#6d8a96");
        const cols = ["#c69a3b", "#6f7b3a", "#b08a36", "#7f6f34"];
        for (let i = 0; i < 9; i++) {
          g.fillStyle = cols[i % 4];
          g.beginPath();
          g.ellipse((i + 0.5) * (W / 9), H * 0.72, W / 30, H * 0.22, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#a8ad6c";
        g.fillRect(0, H * 0.9, W, H * 0.1);
      } else {
        g.fillStyle = "#efe5cf";
        g.fillRect(0, 0, W, H);
        g.strokeStyle = "#b8553a";
        g.lineWidth = Math.max(2, H * 0.09);
        g.lineCap = "round";
        const cx = W / 2, cy = H * 0.5, R = Math.min(W * 0.2, H * 0.36);
        for (const sx of [1, -1]) {
          g.beginPath();
          g.moveTo(cx, H * 0.88);
          g.lineTo(cx, cy);
          for (let t = 0; t <= Math.PI * 2.1; t += 0.12) {
            const r = R * (1 - t / (Math.PI * 2.7));
            g.lineTo(cx + sx * (R - r * Math.cos(t)), cy - r * Math.sin(t));
          }
          g.stroke();
        }
        g.fillStyle = "#c69a3b";
        for (const x of [W * 0.1, W * 0.9]) { g.beginPath(); g.moveTo(x, H * 0.4); g.lineTo(x + H * 0.08, H * 0.5); g.lineTo(x, H * 0.6); g.lineTo(x - H * 0.08, H * 0.5); g.fill(); }
        g.fillStyle = "#4f7d78";
        g.fillRect(0, 0, W, 2);
        g.fillRect(0, H - 2, W, 2);
      }
      // Lay it in tiles: the small drawing blown up without smoothing, every
      // tile shaded a touch lighter or darker, a frame, and the grout.
      // (No pixel readback: reading a canvas back stalls the GPU on a phone.)
      const S = 12;
      const hi = document.createElement("canvas");
      hi.width = W * S;
      hi.height = H * S;
      const h2 = hi.getContext("2d")!;
      h2.imageSmoothingEnabled = false;
      h2.drawImage(lo, 0, 0, W, H, 0, 0, W * S, H * S);
      const shades = ["rgba(255,250,240,0.12)", "rgba(255,250,240,0.06)", "rgba(40,28,20,0.06)", "rgba(40,28,20,0.12)"];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          h2.fillStyle = shades[Math.floor(rnd() * 4)];
          h2.fillRect(x * S, y * S, S, S);
        }
      h2.strokeStyle = "#8a4a32";
      h2.lineWidth = S * 2;
      h2.strokeRect(0, 0, W * S, H * S);
      h2.fillStyle = "#d9cdb5";
      for (let x = 0; x <= W; x++) h2.fillRect(x * S - 1, 0, 2, H * S);
      for (let y = 0; y <= H; y++) h2.fillRect(0, y * S - 1, W * S, 2);
      const t = tex(hi);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }

    // Paving for the pedestrian streets and sidewalks, a fine grain for the
    // roads and the ground: printed, not photographic, and enough texture
    // underfoot that a step reads as a step.
    function paving() {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#e4dccd";
      for (let row = 0; row < 8; row++) {
        g.fillRect(0, row * 16, 128, 1.5);
        for (let col = 0; col < 4; col++) g.fillRect(col * 32 + (row % 2) * 16, row * 16, 1.5, 16);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(120,96,64,${0.025 + Math.random() * 0.04})`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      return tex(c);
    }
    function grain(dark: number) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(90,72,50,${Math.random() * dark})`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
      }
      return tex(c);
    }
    function tex(c: HTMLCanvasElement) {
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      disposables.push(t);
      return t;
    }

    // Ground-floor shopfronts for the buildings along the walks: a glazed bay
    // under a striped awning, three awning colours in one atlas (one row each).
    function shopfronts() {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 384;
      const g = c.getContext("2d")!;
      const stripes = ["#b8553a", "#4f7d78", "#c69a3b"];
      stripes.forEach((stripe, k) => {
        const y0 = k * 128;
        g.fillStyle = "#ffffff";
        g.fillRect(0, y0, 128, 128);
        // Glass with a warm interior low down and the sky's reflection on top.
        const glass = g.createLinearGradient(0, y0 + 44, 0, y0 + 120);
        glass.addColorStop(0, "#5d6b68");
        glass.addColorStop(1, "#3b4542");
        g.fillStyle = glass;
        g.fillRect(12, y0 + 44, 104, 74);
        g.fillStyle = "rgba(233,201,138,0.35)";
        g.fillRect(12, y0 + 92, 104, 26);
        g.fillStyle = "#f4ead6";
        g.fillRect(62, y0 + 44, 4, 74);
        g.fillRect(12, y0 + 116, 104, 4);
        // The awning: scalloped stripes.
        for (let x = 0; x < 128; x += 16) {
          g.fillStyle = (x / 16) % 2 ? "#f4ead6" : stripe;
          g.fillRect(x, y0 + 14, 16, 22);
          g.beginPath();
          g.arc(x + 8, y0 + 36, 8, 0, Math.PI);
          g.fill();
        }
        g.fillStyle = "rgba(58,42,32,0.35)";
        g.fillRect(0, y0 + 12, 128, 2);
      });
      const t = tex(c);
      t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }

    // Light falls in three flat bands, the way a screen print or a 70s
    // illustration shades a form, instead of a smooth photographic gradient.
    const bands = new THREE.DataTexture(new Uint8Array([105, 175, 235]), 3, 1, THREE.RedFormat);
    bands.minFilter = bands.magFilter = THREE.NearestFilter;
    bands.generateMipmaps = false;
    bands.needsUpdate = true;
    disposables.push(bands);
    // (flatShading is dropped: the meshes that want facets carry face normals already.)
    const lit = (p: THREE.MeshToonMaterialParameters & { flatShading?: boolean }) => {
      const q = { ...p };
      delete q.flatShading;
      return new THREE.MeshToonMaterial({ gradientMap: bands, ...q });
    };

    // Soft round shadows on the ground under trees, lamps and the street's furniture.
    const blobs: number[] = [];

    const part = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => {
      geo.rotateX(rx);
      geo.rotateZ(rz);
      geo.translate(x, y, z);
      return geo;
    };
    // A boxy 80s saloon: enamel body, a glasshouse, chrome bumpers, four wheels.
    const carParts = () => [
      { geo: mergeGeometries([part(new THREE.BoxGeometry(1.62, 0.62, 4.1), 0, 0.6, 0), part(new THREE.BoxGeometry(1.4, 0.07, 1.85), 0, 1.34, -0.2)]), color: "#ffffff", tint: CARS },
      { geo: part(new THREE.BoxGeometry(1.38, 0.46, 1.95), 0, 1.1, -0.2), color: "#4a5658" },
      { geo: mergeGeometries([part(new THREE.BoxGeometry(1.66, 0.14, 0.12), 0, 0.42, 2.08), part(new THREE.BoxGeometry(1.66, 0.14, 0.12), 0, 0.42, -2.08)]), color: "#d6d0c4" },
      { geo: mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), sx * 0.72, 0.3, sz * 1.3, 0, Math.PI / 2)))), color: "#2b2420" },
    ];

    // The city is built in stages with a frame between them, so the page
    // keeps answering (and the loading line keeps showing) on a slow phone.
    const breathe = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const stage = async (name: string, fn: () => void | Promise<void>) => {
      if (disposed) return;
      const t = performance.now();
      await fn();
      performance.measure(`walk:${name}`, { start: t, end: performance.now() });
      await breathe();
    };

    // The 40 m cells the walks pass through: shopfronts and tree shadows only there.
    const walkCells = new Set<string>();

    async function build(d: Scene) {
      for (const r of d.routes)
        for (let i = 0; i < r.p.length; i += 2) {
          const gx = Math.floor(r.p[i] / 40), gz = Math.floor(r.p[i + 1] / 40);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) walkCells.add(`${gx + a},${gz + b}`);
        }
      await stage("ground", () => buildGround(d));
      await stage("flat", () => buildFlat(d));
      await stage("buildings", () => buildBuildings(d));
      await stage("trees", () => buildTrees(d));
      await stage("street", () => buildStreet(d));
      await stage("furniture", () => buildFurniture(d));
      await stage("air", () => buildAir());
    }

    // Shadows in one instanced mesh; a few paper clouds drifting high over the range.
    const clouds: THREE.Sprite[] = [];
    function buildAir() {
      if (blobs.length) {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const g = c.getContext("2d")!;
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "rgba(58,42,32,0.55)");
        grad.addColorStop(0.6, "rgba(58,42,32,0.22)");
        grad.addColorStop(1, "rgba(58,42,32,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        const geo = new THREE.PlaneGeometry(2, 2);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
        const n = blobs.length / 3;
        const inst = new THREE.InstancedMesh(geo, mat, n);
        const m = new THREE.Matrix4();
        for (let i = 0; i < n; i++) {
          const r = blobs[i * 3 + 2];
          m.makeScale(r, 1, r).setPosition(blobs[i * 3], 0.13, blobs[i * 3 + 1]);
          inst.setMatrixAt(i, m);
        }
        inst.renderOrder = 1;
        scene.add(inst);
        disposables.push(geo, mat);
      }
      // Cut-paper clouds: long thin cream strips, a shade darker beneath, as an 80s poster draws them.
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 64;
      const g = c.getContext("2d")!;
      const strip = (x: number, y: number, rx: number, ry: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      };
      strip(256, 38, 240, 13, "#e9d3ad");
      strip(250, 34, 236, 12, "#f8eedb");
      strip(330, 24, 120, 10, "#f8eedb");
      strip(170, 28, 90, 8, "#f8eedb");
      const mat = new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, fog: false, opacity: 0.7 });
      disposables.push(mat);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Sprite(mat);
        const a = (i / 8) * Math.PI * 2 + 0.4, dist = 5200 + (i % 3) * 2200;
        sp.position.set(Math.sin(a) * dist, 2300 + (i % 4) * 380, Math.cos(a) * dist + 1500);
        sp.scale.set(2600 + (i % 3) * 900, 330 + (i % 3) * 90, 1);
        scene.add(sp);
        clouds.push(sp);
      }
    }

    function buildGround(d: Scene) {
      // Ground: warm earth; the mountains rise from the same plane outside the centre.
      const groundTex = grain(0.09);
      groundTex.repeat.set(60000 / 7, 60000 / 7);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), lit({ color: "#d2c2a0", map: groundTex }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2;
      scene.add(ground);
      disposables.push(ground.geometry, ground.material as THREE.Material);

      // Mountains from the height grid.
      {
        const { w, h, x0, z0, x1, z1 } = d.dem;
        const raw = Uint8Array.from(atob(d.dem.data), (ch) => ch.charCodeAt(0));
        const H = new Int16Array(raw.buffer);
        // Plain numbers into typed arrays: no vector objects per vertex (a phone felt that).
        const pos = new Float32Array((w - 1) * (h - 1) * 18), col = new Float32Array((w - 1) * (h - 1) * 18);
        let n = 0;
        const c = new THREE.Color();
        const tint = (y: number, slope: number, k: number) => {
          if (y > 1650 + k * 140) return c.set("#f6f1e7");
          if (y > 1350) return c.set(slope > 0.7 ? "#9a8f97" : "#a99c8f");
          if (y > 520) return c.set(slope > 0.6 ? "#66684a" : "#536343");
          if (y > 90) return c.set(slope > 0.5 ? "#8c8a5c" : "#7f8a55");
          return c.set("#b9ac7c");
        };
        const dx = (x1 - x0) / (w - 1), dz = (z1 - z0) / (h - 1);
        const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
          const yMid = (ay + by + cy) / 3;
          if (yMid < 0.5) return;
          // The face's normal, only its upward part matters for the slope.
          const ux = bx - ax, uy = by - ay, uz = bz - az, vx2 = cx - ax, vy = cy - ay, vz2 = cz - az;
          const nx = uy * vz2 - uz * vy, ny = uz * vx2 - ux * vz2, nz = ux * vy - uy * vx2;
          const slope = 1 - Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
          tint(yMid, slope, Math.sin(ax * 0.004) * Math.cos(az * 0.003));
          pos.set([ax, ay, az, bx, by, bz, cx, cy, cz], n);
          col.set([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b], n);
          n += 9;
        };
        for (let j = 0; j < h - 1; j++)
          for (let i = 0; i < w - 1; i++) {
            const xa = x0 + dx * i, xb = xa + dx, za = z0 + dz * j, zb = za + dz;
            const h00 = H[j * w + i], h10 = H[j * w + i + 1], h01 = H[(j + 1) * w + i], h11 = H[(j + 1) * w + i + 1];
            tri(xa, h00, za, xa, h01, zb, xb, h10, za);
            tri(xb, h10, za, xa, h01, zb, xb, h11, zb);
          }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, n), 3));
        g.setAttribute("color", new THREE.BufferAttribute(col.subarray(0, n), 3));
        g.computeVertexNormals();
        const m = lit({ vertexColors: true, flatShading: true });
        scene.add(new THREE.Mesh(g, m));
        disposables.push(g, m);
      }

    }

    function buildFlat(d: Scene) {
      // Flat layers: parks, sidewalks, roads, rivers.
      const flatMesh = (tris: number[], color: string, y: number, map?: THREE.Texture, metres = 2) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
        if (map) {
          const uv = new Float32Array((tris.length / 3) * 2);
          for (let i = 0, j = 0; i < tris.length; i += 3, j += 2) {
            uv[j] = tris[i] / metres;
            uv[j + 1] = tris[i + 2] / metres;
          }
          g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        }
        g.computeVertexNormals();
        const m = lit({ color, map, polygonOffset: true, polygonOffsetFactor: -y, polygonOffsetUnits: -y });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.y = y * 0.02;
        scene.add(mesh);
        disposables.push(g, m);
      };
      {
        const tris: number[] = [];
        for (const p of d.g) {
          const contour: THREE.Vector2[] = [];
          for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
          if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
          const f = THREE.ShapeUtils.triangulateShape(contour, []);
          for (const [a, b, c] of f) for (const k of [a, c, b]) tris.push(contour[k].x, 0, contour[k].y);
        }
        flatMesh(tris, "#a8ad6c", 1);
      }
      const ribbon = (line: number[], width: number, out: number[]) => {
        for (let i = 2; i < line.length; i += 2) {
          const ax = line[i - 2], az = line[i - 1], bx = line[i], bz = line[i + 1];
          const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
          const nx = (-dz / L) * width * 0.5, nz = (dx / L) * width * 0.5;
          const ex = (dx / L) * width * 0.25, ez = (dz / L) * width * 0.25; // overlap hides the joints
          // Wound to face the sky.
          out.push(ax - nx - ex, 0, az - nz - ez, ax + nx - ex, 0, az + nz - ez, bx - nx + ex, 0, bz - nz + ez);
          out.push(ax + nx - ex, 0, az + nz - ez, bx + nx + ex, 0, bz + nz + ez, bx - nx + ex, 0, bz - nz + ez);
        }
      };
      {
        const side: number[] = [];
        const byCls: number[][] = [[], [], [], [], []];
        for (const r of d.r) {
          const line = r.slice(1);
          if (r[0] < 4) ribbon(line, ROAD_W[r[0]] + 7, side);
          ribbon(line, ROAD_W[r[0]], byCls[r[0]]);
        }
        // The walking line is always paved, also where it crosses a park.
        for (const r of d.routes) ribbon(r.p, r.id === "dostyk" ? 5 : 11, byCls[4]);
        const tiles = paving(), asphalt = grain(0.1);
        flatMesh(side, "#ddd0b6", 2, tiles, 2);
        byCls.forEach((tris, i) => (i === 4 ? flatMesh(tris, ROAD[4], 4, tiles, 1.6) : flatMesh(tris, ROAD[i], 3, asphalt, 3)));
        const water: number[] = [];
        for (const w of d.w) ribbon(w.slice(1), w[0] === 2 ? 7 : 3, water);
        flatMesh(water, "#8fa1d2", 5);
      }

    }

    async function buildBuildings(d: Scene) {
      const pal = d.pal.map((c) => new THREE.Color(c));
      // Buildings: walls with window rows, roofs, an ink outline.
      {
        // Three facades: the 70s–80s panel blocks, the sun-breaker grids, today's glass towers.
        const walls = [0, 1, 2].map(() => ({ pos: [] as number[], uv: [] as number[], col: [] as number[], n: [] as number[] }));
        const roof: number[] = [], roofCol: number[] = [];
        const edges: number[] = [];
        const c = new THREE.Color();
        const crowns: { x: number; z: number; h: number; ring: THREE.Vector2[] }[] = [];
        const domes: { x: number; z: number; h: number }[] = [];
        // Which buildings stand on a walk: a 40 m grid of the routes' points.
        const near = walkCells;
        const shop: number[] = [], shopUv: number[] = [], shopCol: number[] = [], shopN: number[] = [];
        for (let bi = 0; bi < d.b.length; bi++) {
          // A breath every 1200 houses: a phone keeps drawing the loading line.
          if (bi && bi % 1200 === 0) await breathe();
          const b = d.b[bi];
          const [h, mh, ci, flag] = b;
          const ring: THREE.Vector2[] = [];
          for (let i = 4; i < b.length; i += 2) ring.push(new THREE.Vector2(b[i], b[i + 1]));
          if (ring.length < 3) continue;
          if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
          const glassy = h > 55 && !flag;
          const kind = glassy ? 2 : h >= 14 && !flag && (Math.abs(Math.round(b[4] * 5 + b[5] * 3)) % 3 === 0) ? 1 : 0;
          const W = walls[kind];
          const base = glassy ? new THREE.Color("#c8d6da") : flag === 2 ? new THREE.Color("#f1dca0") : pal[ci];
          const onWalk = h > 6 && mh < 1 && !flag && ring.some((p) => near.has(`${Math.floor(p.x / 40)},${Math.floor(p.y / 40)}`));
          const row = Math.abs(Math.round(b[4] * 3 + b[5] * 7)) % 3;
          const jitter = ((b[4] * 13.1 + b[5] * 7.7) % 1 + 1) % 1;
          c.copy(base).offsetHSL(0, 0, (jitter - 0.5) * 0.05);
          let per = 0;
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i], q = ring[(i + 1) % ring.length];
            const L = a.distanceTo(q);
            const nx = (q.y - a.y) / (L || 1), nz = -(q.x - a.x) / (L || 1);
            const bay = kind === 2 ? 25.6 : 14.4, storey = kind === 2 ? 25.6 : 12.8;
            const u0 = per / bay, u1 = (per + L) / bay, v0 = mh / storey, v1 = h / storey;
            per += L;
            // Wound so the face looks out of the building (the ring is counter-clockwise in x/z).
            const quad = [[a.x, mh, a.y, u0, v0], [q.x, h, q.y, u1, v1], [q.x, mh, q.y, u1, v0], [a.x, mh, a.y, u0, v0], [a.x, h, a.y, u0, v1], [q.x, h, q.y, u1, v1]];
            for (const [x, y, z, u, v] of quad) {
              W.pos.push(x, y, z);
              W.uv.push(u, v);
              W.col.push(c.r, c.g, c.b);
              W.n.push(nx, 0, nz);
            }
            edges.push(a.x, h, a.y, q.x, h, q.y);
            if (h > 7) edges.push(a.x, mh, a.y, a.x, h, a.y);
            if (onWalk && L > 3.5) {
              // A shopfront strip just proud of the wall, whole bays only.
              const bays = Math.max(1, Math.round(L / 4.4));
              const ox = nx * 0.06, oz = nz * 0.06, top = 3.7;
              const sv0 = row / 3 + 0.002, sv1 = (row + 1) / 3 - 0.002;
              // Canvas rows run top-down and the texture is flipped: the wall's foot takes the row's lower edge.
              const sq = [[a.x, 0.05, a.y, 0, sv1], [q.x, top, q.y, bays, sv0], [q.x, 0.05, q.y, bays, sv1], [a.x, 0.05, a.y, 0, sv1], [a.x, top, a.y, 0, sv0], [q.x, top, q.y, bays, sv0]];
              for (const [x, y, z, u, v] of sq) {
                shop.push(x + ox, y, z + oz);
                shopUv.push(u, 1 - v);
                shopCol.push(c.r, c.g, c.b);
                shopN.push(nx, 0, nz);
              }
            }
          }
          const rc = flag === 3 ? new THREE.Color("#8fa171") : h < 8 && ci % 2 === 1 ? new THREE.Color("#a9583a") : c.clone().multiplyScalar(0.8);
          for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(ring, []))
            for (const n of [i, k, j]) {
              roof.push(ring[n].x, h, ring[n].y);
              roofCol.push(rc.r, rc.g, rc.b);
            }
          const cx = ring.reduce((s2, p) => s2 + p.x, 0) / ring.length, cz = ring.reduce((s2, p) => s2 + p.y, 0) / ring.length;
          if (flag === 1) crowns.push({ x: cx, z: cz, h, ring });
          if (flag === 2) domes.push({ x: cx, z: cz, h });
        }
        (["panel", "brise", "glass"] as const).forEach((kind, i) => {
          const W = walls[i];
          if (!W.pos.length) return;
          const gw = new THREE.BufferGeometry();
          gw.setAttribute("position", new THREE.Float32BufferAttribute(W.pos, 3));
          gw.setAttribute("normal", new THREE.Float32BufferAttribute(W.n, 3));
          gw.setAttribute("uv", new THREE.Float32BufferAttribute(W.uv, 2));
          gw.setAttribute("color", new THREE.Float32BufferAttribute(W.col, 3));
          const mw = lit({ vertexColors: true, map: facade(kind) });
          scene.add(new THREE.Mesh(gw, mw));
          disposables.push(gw, mw);
        });
        const gr = new THREE.BufferGeometry();
        gr.setAttribute("position", new THREE.Float32BufferAttribute(roof, 3));
        gr.setAttribute("color", new THREE.Float32BufferAttribute(roofCol, 3));
        gr.computeVertexNormals();
        const mr = lit({ vertexColors: true });
        scene.add(new THREE.Mesh(gr, mr));
        const ge = new THREE.BufferGeometry();
        ge.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
        const me = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.42 });
        scene.add(new THREE.LineSegments(ge, me));
        disposables.push(gr, mr, ge, me);
        if (shop.length) {
          const gs = new THREE.BufferGeometry();
          gs.setAttribute("position", new THREE.Float32BufferAttribute(shop, 3));
          gs.setAttribute("normal", new THREE.Float32BufferAttribute(shopN, 3));
          gs.setAttribute("uv", new THREE.Float32BufferAttribute(shopUv, 2));
          gs.setAttribute("color", new THREE.Float32BufferAttribute(shopCol, 3));
          const ms = lit({ vertexColors: true, map: shopfronts() });
          scene.add(new THREE.Mesh(gs, ms));
          disposables.push(gs, ms);
        }

        // Hotel Kazakhstan's golden crown.
        const gold = lit({ color: "#d2a948", emissive: "#4a3410" });
        disposables.push(gold);
        for (const cr of crowns) {
          const spike = new THREE.BoxGeometry(1.1, 9, 0.4);
          disposables.push(spike);
          const n = 36;
          const lens = cr.ring.map((p, i) => p.distanceTo(cr.ring[(i + 1) % cr.ring.length]));
          const total = lens.reduce((a, b) => a + b, 0);
          for (let k = 0; k < n; k++) {
            let dist = (k / n) * total, i = 0;
            while (dist > lens[i]) { dist -= lens[i]; i++; }
            const a = cr.ring[i], q = cr.ring[(i + 1) % cr.ring.length];
            const p = a.clone().lerp(q, dist / lens[i]);
            const m = new THREE.Mesh(spike, gold);
            m.position.set(p.x, cr.h + 4.5 + (k % 3 === 0 ? 2.5 : 0), p.y);
            m.scale.y = k % 3 === 0 ? 1.5 : 1;
            m.lookAt(cr.x, cr.h + 4.5, cr.z);
            scene.add(m);
          }
        }
        // Zenkov's cathedral: a drum and onion domes over its pastel walls.
        for (const dm of domes) {
          const drum = new THREE.CylinderGeometry(5, 5, 8, 12);
          const onion = new THREE.SphereGeometry(5.8, 14, 10);
          const mat = lit({ color: "#c7a24e" });
          disposables.push(drum, onion, mat);
          const spots: [number, number, number][] = [[0, 0, 1.25], [10, 10, 0.7], [-10, 10, 0.7], [10, -10, 0.7], [-10, -10, 0.7]];
          for (const [ox, oz, sc] of spots) {
            const dr = new THREE.Mesh(drum, lit({ color: "#f3e3b6" }));
            dr.scale.setScalar(sc);
            dr.position.set(dm.x + ox, dm.h + 4 * sc, dm.z + oz);
            const on = new THREE.Mesh(onion, mat);
            on.scale.set(sc, sc * 1.35, sc);
            on.position.set(dm.x + ox, dm.h + 8 * sc + 5 * sc, dm.z + oz);
            scene.add(dr, on);
          }
        }
      }

    }

    function buildTrees(d: Scene) {
      // Trees: golden-autumn crowns, a poplar in every fourth.
      {
        const step = lite ? 2 : 1;
        const n = Math.floor(d.t.length / 3 / step);
        const crownGeo = lite ? new THREE.SphereGeometry(1, 7, 5) : new THREE.SphereGeometry(1, 10, 7);
        const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 5);
        const crownMat = lit({});
        const trunkMat = lit({ color: "#5a4636" });
        const crowns = new THREE.InstancedMesh(crownGeo, crownMat, n);
        const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
        const col = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const x = d.t[i * 3 * step], z = d.t[i * 3 * step + 1], kind = d.t[i * 3 * step + 2];
          const r = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
          const rr = Math.abs(r);
          const poplar = kind === 3;
          const H = poplar ? 13 + rr * 5 : 6 + rr * 3;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr * 6.28);
          sc.set(poplar ? 1.35 : 2.1 + rr * 0.9, poplar ? H * 0.38 : 2.2 + rr * 0.7, poplar ? 1.35 : 2.1 + rr * 0.9);
          p.set(x, poplar ? H * 0.58 : H * 0.66, z);
          crowns.setMatrixAt(i, m.compose(p, q, sc));
          crowns.setColorAt(i, col.set(AUTUMN[Math.floor(rr * AUTUMN.length) % AUTUMN.length]));
          trunks.setMatrixAt(i, m.compose(p.set(x, H * 0.24, z), q, sc.set(0.8, H * 0.48, 0.8)));
          if (walkCells.has(`${Math.floor(x / 40)},${Math.floor(z / 40)}`)) blobs.push(x, z, poplar ? 2.2 : 3.4 + rr);
        }
        scene.add(crowns, trunks);
        disposables.push(crownGeo, trunkGeo, crownMat, trunkMat);
      }

      // Lamp posts of the old centre: a dark pole, a cream globe, a little cap.
      if (d.lamps?.length) {
        const n = d.lamps.length / 2;
        const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
          [new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6), lit({ color: "#2f3a33" }), 2.2],
          [new THREE.CylinderGeometry(0.2, 0.26, 0.7, 8), lit({ color: "#2f3a33" }), 0.35],
          [new THREE.SphereGeometry(0.34, 12, 8), lit({ color: "#fff6e2", emissive: "#a0835a" }), 4.75],
          [new THREE.ConeGeometry(0.2, 0.32, 8), lit({ color: "#2f3a33" }), 5.2],
        ];
        const m = new THREE.Matrix4();
        for (let i = 0; i < n; i++) blobs.push(d.lamps[i * 2], d.lamps[i * 2 + 1], 0.9);
        for (const [geo, mat, y] of parts) {
          const inst = new THREE.InstancedMesh(geo, mat, n);
          for (let i = 0; i < n; i++) inst.setMatrixAt(i, m.makeTranslation(d.lamps[i * 2], y, d.lamps[i * 2 + 1]));
          scene.add(inst);
          disposables.push(geo, mat);
        }
      }

    }

    function buildStreet(d: Scene) {
      // Kok-Tobe: the TV tower on its hill.
      {
        const [x, z, gy] = d.kokTobe;
        const mat = lit({ color: "#f2ece0" });
        const red = lit({ color: "#b8553a" });
        const g1 = new THREE.CylinderGeometry(1.2, 11, 372, 4, 1, true);
        const g2 = new THREE.CylinderGeometry(9, 9, 6, 12);
        disposables.push(mat, red, g1, g2);
        const t = new THREE.Mesh(g1, mat);
        t.position.set(x, gy + 186, z);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g1), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.35 }));
        edges.position.copy(t.position);
        const deck = new THREE.Mesh(g2, red);
        deck.position.set(x, gy + 150, z);
        scene.add(t, edges, deck);
      }

      // Dostyk: a trolleybus under its wires, cars in pastel enamel.
      const dostyk = d.routes.find((r) => r.id === "dostyk");
      if (dostyk) {
        const path: THREE.Vector3[] = [];
        for (let i = 0; i < dostyk.p.length; i += 2) path.push(new THREE.Vector3(dostyk.p[i], 0, dostyk.p[i + 1]));
        const side = dostyk.road ?? -1; // the carriageway's hand, +1 left of the walker
        const lane = (off: number) => {
          const out = path.map((p, i) => {
            const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
            const dir = b.clone().sub(a).normalize();
            return p.clone().add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * off));
          });
          const cum = [0];
          for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + out[i].distanceTo(out[i - 1]));
          return { path: out, cum };
        };
        const box = (g: THREE.Group, w: number, h: number, l: number, color: string, y: number, z = 0) => {
          const geo = new THREE.BoxGeometry(w, h, l), mat = lit({ color });
          disposables.push(geo, mat);
          const m = new THREE.Mesh(geo, mat);
          m.position.set(0, y, z);
          g.add(m);
        };
        const near = lane(11);
        const bus = new THREE.Group();
        box(bus, 2.5, 1.3, 11.5, "#b8402c", 1.15);
        box(bus, 2.5, 1.5, 11.5, "#efe3c6", 2.55);
        box(bus, 2.52, 0.6, 9.5, "#5a6a74", 2.3);
        const pole = new THREE.CylinderGeometry(0.05, 0.05, 6.5, 4);
        const pm = lit({ color: "#2b2420" });
        disposables.push(pole, pm);
        for (const ox of [-0.5, 0.5]) {
          const p = new THREE.Mesh(pole, pm);
          p.position.set(ox, 4.8, -1.5);
          p.rotation.x = -1.05;
          bus.add(p);
        }
        scene.add(bus);
        movers.push({ mesh: bus, ...near, s: 40, dir: 1, speed: 9, loop: false });
        // The overhead wires, a pair over the trolleybus lane.
        const wires: number[] = [];
        for (const dx of [-0.5, 0.5]) {
          const w = lane(11 + dx).path;
          for (let i = 1; i < w.length; i++) wires.push(w[i - 1].x, 6.3, w[i - 1].z, w[i].x, 6.3, w[i].z);
        }
        const gw = new THREE.BufferGeometry();
        gw.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
        const mw = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 });
        scene.add(new THREE.LineSegments(gw, mw));
        disposables.push(gw, mw);
        // Zhigulis and Volgas: boxy, enamel-bright, one way up the far lanes, one way down the near.
        const far = lane(18.5), mid = lane(7.5);
        // Six cars, four draw calls: each part is one instanced mesh.
        const driving = carParts();
        const fleet = driving.map(({ geo, color, tint }) => {
          const mat = lit({ color });
          const inst = new THREE.InstancedMesh(geo, mat, 6);
          inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          if (tint) for (let k = 0; k < 6; k++) inst.setColorAt(k, new THREE.Color(CARS[(k * 3 + 1) % CARS.length]));
          inst.frustumCulled = false;
          scene.add(inst);
          disposables.push(geo, mat);
          return inst;
        });
        cars = fleet;
        for (let k = 0; k < 6; k++) {
          const L = k % 2 ? far : mid;
          movers.push({ slot: k, ...L, s: (k * 337) % Math.max(1, L.cum[L.cum.length - 1]), dir: k % 2 ? -1 : 1, speed: 11 + (k % 3) * 2, loop: true });
        }
      }

    }

    function buildFurniture(d: Scene) {
      // ── The street's furniture: the 80s and today, side by side ──────────
      const words = [...(d.words ?? []), "КВАС"];
      const wordCache = new Map<string, { mat: THREE.Material; aspect: number }>();
      const word = (w: string, color: string, lattice = false) => {
        const key = `${w}|${color}|${lattice}`;
        const hit = wordCache.get(key);
        if (hit) return hit;
        const c = document.createElement("canvas");
        const g0 = c.getContext("2d")!;
        g0.font = `800 96px ${FONT}`;
        const wPx = Math.ceil(g0.measureText(w).width) + 48;
        c.width = wPx;
        c.height = lattice ? 184 : 128;
        const g = c.getContext("2d")!;
        if (lattice) {
          // The truss the rooftop letters stand on.
          g.strokeStyle = "#3a2a20";
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(12, 130);
          g.lineTo(wPx - 12, 130);
          g.moveTo(12, 180);
          g.lineTo(wPx - 12, 180);
          for (let x = 12; x < wPx - 40; x += 36) {
            g.moveTo(x, 130);
            g.lineTo(x + 18, 180);
            g.lineTo(x + 36, 130);
          }
          g.stroke();
        }
        g.font = `800 96px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.lineWidth = 10;
        g.strokeStyle = "rgba(58,42,32,0.5)";
        g.strokeText(w, wPx / 2, 68);
        g.fillStyle = color;
        g.fillText(w, wPx / 2, 68);
        const mat = new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, alphaTest: 0.2, color: "#f6ecdc" });
        disposables.push(mat);
        const out = { mat, aspect: wPx / c.height };
        wordCache.set(key, out);
        return out;
      };
      const planeOn = (x0: number, z0: number, x1: number, z1: number, w: number, h: number, y: number, out = 0.12) => {
        const L = Math.hypot(x1 - x0, z1 - z0) || 1;
        const nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
        const geo = new THREE.PlaneGeometry(w, h);
        geo.rotateY(Math.atan2(nx, nz));
        geo.translate((x0 + x1) / 2 + nx * out, y, (z0 + z1) / 2 + nz * out);
        return geo;
      };
      const wallPlane = (x0: number, z0: number, x1: number, z1: number, w: number, h: number, y: number, mat: THREE.Material, out = 0.12) => {
        const geo = planeOn(x0, z0, x1, z1, w, h, y, out);
        disposables.push(geo);
        scene.add(new THREE.Mesh(geo, mat));
      };
      // Shop lettering in red over the awnings: КНИГИ, ГАСТРОНОМ, ЦВЕТЫ… One mesh a word, not one a shop.
      const byWord = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const [x0, z0, x1, z1, wi] of d.signs ?? []) {
        const { mat, aspect } = word(words[wi] ?? "КАФЕ", "#c8402a");
        const L = Math.hypot(x1 - x0, z1 - z0);
        const h = Math.min(0.95, L / aspect);
        byWord.set(mat, [...(byWord.get(mat) ?? []), planeOn(x0, z0, x1, z1, h * aspect, h, 4.35)]);
      }
      for (const [mat, geos] of byWord) {
        const geo = mergeGeometries(geos);
        geos.forEach((g) => g.dispose());
        disposables.push(geo);
        scene.add(new THREE.Mesh(geo, mat));
      }
      // Mosaic panels high on the end walls: the apple, the poplars, the ram's horn.
      for (const [x0, z0, x1, z1, y0, y1, design] of d.mosaics ?? []) {
        const w = Math.hypot(x1 - x0, z1 - z0), h = y1 - y0;
        const mat = lit({ map: mosaic(design, w / h) });
        disposables.push(mat);
        wallPlane(x0, z0, x1, z1, w, h, (y0 + y1) / 2, mat, 0.08);
      }
      // Rooftop letters on a truss, as the city's roofs had them.
      for (const [x, z, hb, yaw, w, wi] of d.roofSigns ?? []) {
        const { mat, aspect } = word((d.roofWords ?? [])[wi] ?? "АЛМА-АТА", "#d2462e", true);
        const h = w / aspect;
        const geo = new THREE.PlaneGeometry(w, h);
        disposables.push(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, hb + 0.2 + h / 2, z);
        m.rotation.y = yaw;
        scene.add(m);
      }

      // Instanced furniture: each kind is a few merged parts, one material each.
      {
        const props = d.props ?? [];
        const kinds: Record<number, { geo: THREE.BufferGeometry; color: string; tint?: string[] }[]> = {
          // Today's café terraces: a parasol, a table, two chairs.
          0: [
            { geo: part(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), 0, 2.35, 0), color: "#ffffff", tint: AWNINGS },
            { geo: mergeGeometries([part(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 5), 0, 1.15, 0), part(new THREE.CylinderGeometry(0.04, 0.12, 0.72, 6), 0, 0.36, 0)]), color: "#2f3a33" },
            { geo: part(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), 0, 0.74, 0), color: "#efe6d2" },
            { geo: mergeGeometries([part(new THREE.BoxGeometry(0.42, 0.05, 0.42), 0.75, 0.45, 0), part(new THREE.BoxGeometry(0.05, 0.45, 0.42), 0.98, 0.68, 0), part(new THREE.BoxGeometry(0.42, 0.05, 0.42), -0.75, 0.45, 0), part(new THREE.BoxGeometry(0.05, 0.45, 0.42), -0.98, 0.68, 0)]), color: "#a4673f" },
          ],
          // Parked Zhigulis and Volgas.
          1: carParts(),
          // Park benches: wooden slats on cast iron.
          3: [
            { geo: mergeGeometries([part(new THREE.BoxGeometry(1.8, 0.07, 0.44), 0, 0.46, 0), part(new THREE.BoxGeometry(1.8, 0.34, 0.05), 0, 0.76, -0.2)]), color: "#a4673f" },
            { geo: mergeGeometries([part(new THREE.BoxGeometry(0.07, 0.46, 0.44), 0.75, 0.23, 0), part(new THREE.BoxGeometry(0.07, 0.46, 0.44), -0.75, 0.23, 0)]), color: "#2f3a33" },
          ],
        };
        const m4 = new THREE.Matrix4(), rot = new THREE.Matrix4(), col = new THREE.Color();
        for (const [k, parts] of Object.entries(kinds)) {
          const list = props.filter((p) => p[0] === Number(k));
          if (!list.length) continue;
          for (const { geo, color, tint } of parts) {
            const mat = lit({ color, side: Number(k) === 0 ? THREE.DoubleSide : THREE.FrontSide });
            const inst = new THREE.InstancedMesh(geo, mat, list.length);
            list.forEach(([, x, z, yaw], i) => {
              if (geo === parts[0].geo) blobs.push(x, z, Number(k) === 1 ? 2.6 : Number(k) === 0 ? 1.7 : 1.2);
              inst.setMatrixAt(i, m4.makeTranslation(x, 0, z).multiply(rot.makeRotationY(yaw)));
              if (tint) inst.setColorAt(i, col.set(tint[Math.abs(Math.round(x * 7 + z * 3)) % tint.length]));
            });
            scene.add(inst);
            disposables.push(geo, mat);
          }
        }
        // A kvass barrel on Arbat, yellow, on two wheels.
        for (const [, x, z, yaw] of props.filter((p) => p[0] === 2)) {
          const g = new THREE.Group();
          const tank = new THREE.Mesh(part(new THREE.CylinderGeometry(0.72, 0.72, 2.3, 18), 0, 1.15, 0, Math.PI / 2), lit({ color: "#e0b23a" }));
          const wheels = new THREE.Mesh(mergeGeometries([part(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10), 0.78, 0.32, 0, 0, Math.PI / 2), part(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10), -0.78, 0.32, 0, 0, Math.PI / 2)]), lit({ color: "#2b2420" }));
          g.add(tank, wheels);
          const { mat, aspect } = word("КВАС", "#c8402a");
          for (const sx of [1, -1]) {
            const sg = new THREE.PlaneGeometry(0.42 * aspect, 0.42);
            const sm = new THREE.Mesh(sg, mat);
            sm.position.set(sx * 0.74, 1.2, 0);
            sm.rotation.y = (sx * Math.PI) / 2;
            g.add(sm);
            disposables.push(sg);
          }
          g.position.set(x, 0, z);
          g.rotation.y = yaw;
          scene.add(g);
          disposables.push(tank.geometry, tank.material as THREE.Material, wheels.geometry, wheels.material as THREE.Material);
        }
        // A fountain: a stone basin, a bowl, jets that rise and fall.
        for (const [, x, z] of props.filter((p) => p[0] === 4)) {
          const stone = lit({ color: "#e9dcc0" });
          const water = lit({ color: "#8fb3c0" });
          const spray = new THREE.MeshBasicMaterial({ color: "#eef4f2", transparent: true, opacity: 0.7 });
          const basin = mergeGeometries([part(new THREE.CylinderGeometry(3.1, 3.2, 0.55, 36), 0, 0.27, 0), part(new THREE.CylinderGeometry(0.35, 0.5, 1.2, 12), 0, 1.0, 0), part(new THREE.CylinderGeometry(1.0, 0.6, 0.3, 18), 0, 1.7, 0)]);
          const pool = part(new THREE.CylinderGeometry(2.85, 2.85, 0.06, 36), 0, 0.52, 0);
          const g = new THREE.Group();
          g.add(new THREE.Mesh(basin, stone), new THREE.Mesh(pool, water));
          const jet = new THREE.ConeGeometry(0.16, 2.2, 8);
          jet.translate(0, 1.1, 0);
          const small = new THREE.ConeGeometry(0.07, 1.1, 6);
          small.translate(0, 0.55, 0);
          const c0 = new THREE.Mesh(jet, spray);
          c0.position.y = 1.85;
          g.add(c0);
          jets.push(c0);
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const j = new THREE.Mesh(small, spray);
            j.position.set(Math.sin(a) * 2.2, 0.55, Math.cos(a) * 2.2);
            j.rotation.set(Math.cos(a) * -0.45, 0, Math.sin(a) * 0.45);
            g.add(j);
            jets.push(j);
          }
          g.position.set(x, 0, z);
          scene.add(g);
          disposables.push(stone, water, spray, basin, pool, jet, small);
        }
      }

      // Festoon lights over the two pedestrian streets, lamp to lamp across.
      if (d.lamps?.length) {
        const bulbs: number[] = [], wire: number[] = [];
        for (const r of d.routes) {
          if (r.id === "dostyk") continue;
          const pts: THREE.Vector2[] = [];
          for (let i = 0; i < r.p.length; i += 2) pts.push(new THREE.Vector2(r.p[i], r.p[i + 1]));
          const hung: { s: number; side: number; x: number; z: number }[] = [];
          for (let i = 0; i < d.lamps.length; i += 2) {
            const lx = d.lamps[i], lz = d.lamps[i + 1];
            let best = -1, bd = 1e9;
            pts.forEach((p, k) => {
              const dd = (p.x - lx) ** 2 + (p.y - lz) ** 2;
              if (dd < bd) { bd = dd; best = k; }
            });
            if (bd > 6.5 * 6.5) continue;
            const a = pts[Math.max(0, best - 1)], b = pts[Math.min(pts.length - 1, best + 1)];
            const side = Math.sign((b.x - a.x) * (lz - a.y) - (b.y - a.y) * (lx - a.x));
            hung.push({ s: best, side, x: lx, z: lz });
          }
          hung.sort((p, q) => p.s - q.s);
          for (let i = 1; i < hung.length; i++) {
            const a = hung[i - 1], b = hung[i];
            if (a.side === b.side || Math.hypot(a.x - b.x, a.z - b.z) > 16) continue;
            const n = Math.max(6, Math.round(Math.hypot(a.x - b.x, a.z - b.z) / 0.8));
            let px = a.x, py = 5.05, pz = a.z;
            for (let k = 1; k <= n; k++) {
              const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = 5.05 - 0.7 * 4 * t * (1 - t);
              wire.push(px, py, pz, x, y, z);
              if (k < n) bulbs.push(x, y - 0.08, z);
              px = x; py = y; pz = z;
            }
          }
        }
        if (bulbs.length) {
          const bg = new THREE.SphereGeometry(0.07, 8, 6);
          const bm = new THREE.MeshBasicMaterial({ color: "#ffd38a" });
          const inst = new THREE.InstancedMesh(bg, bm, bulbs.length / 3);
          const m4 = new THREE.Matrix4();
          for (let i = 0; i < bulbs.length / 3; i++) inst.setMatrixAt(i, m4.makeTranslation(bulbs[i * 3], bulbs[i * 3 + 1], bulbs[i * 3 + 2]));
          const wg = new THREE.BufferGeometry();
          wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
          const wm = new THREE.LineBasicMaterial({ color: "#2b2420", transparent: true, opacity: 0.6 });
          scene.add(inst, new THREE.LineSegments(wg, wm));
          disposables.push(bg, bm, wg, wm);
        }
      }

      // Anchors for the places' signs.
      for (const v of venues) {
        const p = toXZ(v.lat, v.lng, d);
        signAnchors.push(p.setY(16));
      }
    }

    fetch("/maps/almaty/walk.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(async (d: Scene) => {
        // The lettering is drawn in the site's face, Kazakh letters included.
        const text = [...(d.words ?? []), ...(d.roofWords ?? []), "КВАС"].join(" ");
        await document.fonts.load(`800 96px ${FONT}`, text).catch(() => undefined);
        return d;
      })
      .then(async (d: Scene) => {
        if (disposed) return;
        data = d;
        await build(d);
        if (disposed) return;
        // Shaders compile in parallel where the phone allows it, before the first frame needs them.
        const t = performance.now();
        await renderer.compileAsync(scene, camera).catch(() => undefined);
        performance.measure("walk:shaders", { start: t, end: performance.now() });
        if (disposed) return;
        ready = true;
        setRoutes(d.routes);
        setState("ready");
        if (film) {
          modeNow = "film";
          film.route = (id) => d.routes.find((r) => r.id === id)?.p ?? [];
          film.frame = (pos, look, dt) => {
            cur.pos.set(pos[0], pos[1], pos[2]);
            cur.look.set(look[0], look[1], look[2]);
            filmDt = dt;
            tick(last + dt * 1000);
            filmDt = null;
            return renderer.domElement.toDataURL("image/jpeg", 0.93);
          };
          film.ready = true;
          return;
        }
        // From the map: straight down over the centre, then the city tilts up with the mountains behind it.
        cur.pos.set(0, 4200, 1);
        cur.look.set(0, 0, 0);
        const v = venues.find((x) => x.n === startVenue);
        if (v) {
          const p = toXZ(v.lat, v.lng, d);
          // Walk to the place if a route passes within 300 m, else hover over it.
          let best: { id: string; s: number; dist: number } | null = null;
          for (const r of d.routes) {
            let acc = 0;
            for (let i = 2; i < r.p.length; i += 2) {
              acc += Math.hypot(r.p[i] - r.p[i - 2], r.p[i + 1] - r.p[i - 1]);
              const dist = Math.hypot(r.p[i] - p.x, r.p[i + 1] - p.z);
              if (!best || dist < best.dist) best = { id: r.id, s: acc, dist };
            }
          }
          if (best && best.dist < 300) startWalk(best.id, best.s - 140);
          else toAir(p, 500);
        } else toAir(new THREE.Vector3(0, 0, 250), 1500);
      })
      .catch(() => !disposed && setState("fail"));

    // ── Input ──────────────────────────────────────────────────────────────
    const ptr = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let lastInput = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("a,button")) return;
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastInput = performance.now();
      renderer.domElement.setPointerCapture(e.pointerId);
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const last = ptr.get(e.pointerId);
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastInput = performance.now();
      if (ptr.size === 2) {
        const [a, b] = [...ptr.values()];
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (modeNow === "air" && pinch) air.radius = Math.max(220, Math.min(4200, air.radius * (pinch / dd)));
        if (modeNow === "walk" && walk && pinch) walk.sTo += (dd - pinch) * 0.4;
        pinch = dd;
        return;
      }
      if (modeNow === "air") {
        air.yaw -= dx * 0.005;
        air.pitch = Math.max(0.12, Math.min(1.45, air.pitch + dy * 0.004));
      } else if (modeNow === "walk" && walk) {
        walk.yawTo -= dx * 0.005;
        // A finger: sideways looks around, up and down walks (tilting too made the street swim).
        // A mouse: drag looks around and up and down; the wheel walks.
        if (e.pointerType === "touch") walk.sTo -= dy * 0.22;
        else walk.pitch = Math.max(-0.35, Math.min(0.5, walk.pitch + dy * 0.003));
      }
    };
    const onUp = (e: PointerEvent) => {
      ptr.delete(e.pointerId);
      pinch = 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastInput = performance.now();
      if (modeNow === "air") air.radius = Math.max(220, Math.min(4200, air.radius * Math.exp(e.deltaY * 0.0012)));
      else if (modeNow === "walk" && walk) walk.sTo -= e.deltaY * 0.12;
    };
    const held = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        lastInput = performance.now();
        if (e.type === "keydown") held.add(k);
        else held.delete(k);
        e.preventDefault();
      }
    };
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    // ── Loop ───────────────────────────────────────────────────────────────
    let last = performance.now();
    const v3 = new THREE.Vector3();
    let skip = false, tuneAt = performance.now(), frameSum = 0, frames = 0, lowered = 0, raised = false;
    const tick = (now: number) => {
      if (filmDt === null) raf = requestAnimationFrame(tick);
      if (!ready) {
        last = now;
        return;
      }
      // Filming: frames come only from the recorder, at its own pace.
      if (film && filmDt === null) return;
      // A phone at rest draws every other frame: the city is still, the battery and the heat matter more.
      const busy = !!flight || autoOn || held.size > 0 || ptr.size > 0 || now - lastInput < 600 || (!!walk && Math.abs(walk.sTo - walk.s) > 0.05);
      if (lite && !busy) {
        skip = !skip;
        if (skip) return;
      }
      const interval = filmDt !== null ? filmDt * 1000 : now - last;
      const dt = Math.min(0.05, interval / 1000);
      last = now;
      // Resolution follows the frame rate, measured only while things move at full pace.
      if (busy || !lite) {
        frameSum += interval;
        frames++;
      }
      if (!film && now - tuneAt > 1200) {
        const avg = frames > 20 ? frameSum / frames : 0;
        if (avg > 26 && dpr > 0.75) {
          dpr = Math.max(0.75, dpr - 0.25);
          lowered++;
          renderer.setPixelRatio(dpr);
          resize();
        } else if (avg && avg < 17.5 && dpr < DPR_CAP && !lowered && !raised) {
          dpr = Math.min(DPR_CAP, dpr + 0.25);
          raised = true;
          renderer.setPixelRatio(dpr);
          resize();
        }
        tuneAt = now;
        frameSum = 0;
        frames = 0;
      }
      if (flight) {
        const t = Math.min(1, (now - flight.t0) / flight.ms), e = ease(t);
        cur.pos.lerpVectors(flight.from.pos, flight.to.pos, e);
        cur.pos.y += Math.sin(Math.PI * e) * flight.arc;
        cur.look.lerpVectors(flight.from.look, flight.to.look, e);
        if (t === 1) {
          const done = flight.done;
          flight = null;
          done?.();
        }
      } else if (modeNow === "air") {
        if (held.has("arrowleft") || held.has("a")) air.yaw += dt * 0.8;
        if (held.has("arrowright") || held.has("d")) air.yaw -= dt * 0.8;
        if (held.has("arrowup") || held.has("w")) air.radius = Math.max(220, air.radius * (1 - dt));
        if (held.has("arrowdown") || held.has("s")) air.radius = Math.min(4200, air.radius * (1 + dt));
        const p = airPose();
        cur.pos.lerp(p.pos, 1 - Math.pow(0.001, dt));
        cur.look.lerp(p.look, 1 - Math.pow(0.001, dt));
      } else if (modeNow === "walk" && walk) {
        const fwd = (held.has("arrowup") || held.has("w") ? 1 : 0) - (held.has("arrowdown") || held.has("s") ? 1 : 0);
        if (held.has("arrowleft") || held.has("a")) walk.yawTo += dt * 1.2;
        if (held.has("arrowright") || held.has("d")) walk.yawTo -= dt * 1.2;
        const speed = 5.5 * (fwd || walk.v || (autoOn ? 1 : 0));
        walk.sTo = Math.max(0, Math.min(walk.len - 1, walk.sTo + speed * dt));
        const before = walk.s;
        walk.s += (walk.sTo - walk.s) * (1 - Math.pow(0.02, dt));
        walk.v = walk.v && !fwd ? walk.v : (walk.s - before) / Math.max(dt, 0.001) / 5.5;
        walk.yaw += (walk.yawTo - walk.yaw) * (1 - Math.pow(0.01, dt));
        if (walk.s >= walk.len - 2 && autoOn) {
          autoOn = false;
          setAuto(false);
        }
        const p = walkPose(walk);
        cur.pos.copy(p.pos);
        cur.look.lerp(p.look, 1 - Math.pow(0.0005, dt));
      }
      camera.position.copy(cur.pos);
      camera.lookAt(cur.look);
      sky.position.copy(camera.position);

      {
        // With «less motion» everything stands where it was placed (cars too, not stacked at the origin).
        for (const m of movers) {
          const len = m.cum[m.cum.length - 1];
          m.s += m.dir * m.speed * (reduce ? 0 : dt);
          if (m.loop) m.s = ((m.s % len) + len) % len;
          else if (m.s > len - 5 || m.s < 5) {
            m.dir *= -1;
            m.s = Math.min(len - 5, Math.max(5, m.s));
          }
          let i = 1;
          while (i < m.cum.length - 1 && m.cum[i] < m.s) i++;
          const a = m.path[i - 1], b = m.path[i];
          const f = (m.s - m.cum[i - 1]) / Math.max(0.01, m.cum[i] - m.cum[i - 1]);
          carP.lerpVectors(a, b, Math.min(1, Math.max(0, f)));
          if (m.mesh) {
            m.mesh.position.copy(carP);
            m.mesh.lookAt(v3.copy(carP).add(b.clone().sub(a).multiplyScalar(m.dir)));
          } else if (m.slot !== undefined) {
            carQ.setFromAxisAngle(UP, Math.atan2((b.x - a.x) * m.dir, (b.z - a.z) * m.dir));
            carM.compose(carP, carQ, ONE);
            for (const c of cars) c.setMatrixAt(m.slot, carM);
          }
        }
        for (const c of cars) c.instanceMatrix.needsUpdate = true;
        const t = now / 1000;
        if (!reduce) {
          jets.forEach((j, i) => (j.scale.y = 0.85 + 0.15 * Math.sin(t * 2.6 + i * 0.7)));
          for (const c of clouds) {
            c.position.x += dt * 6;
            if (c.position.x > 12000) c.position.x = -12000;
          }
        }
      }

      // Signs: projected each frame, kept at one size, hidden far away or behind.
      const w = el.clientWidth, h = el.clientHeight;
      const near = modeNow === "walk" ? 420 : 2600;
      signAnchors.forEach((p, i) => {
        const sgn = signs.current[i];
        if (!sgn) return;
        const anchor = v3.copy(p);
        if (modeNow === "walk" || (flight && cur.pos.y < 60)) anchor.y = 5.5;
        const dist = camera.position.distanceTo(anchor);
        anchor.project(camera);
        const vis = anchor.z < 1 && Math.abs(anchor.x) < 1.15 && Math.abs(anchor.y) < 1.15 && dist < near;
        sgn.style.opacity = vis ? "1" : "0";
        sgn.style.pointerEvents = vis ? "auto" : "none";
        if (vis) sgn.style.transform = `translate(${((anchor.x + 1) / 2) * w}px, ${((1 - anchor.y) / 2) * h}px) translate(-50%, -100%)`;
      });

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("wheel", onWheel);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      disposables.forEach((x) => x.dispose());
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      // Give the context back now: iOS keeps only a few alive, and a walk can be opened again and again.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [venues, startVenue]);

  const cardV = venues.find((v) => v.n === card);
  // A held arrow keeps walking while the finger stays down, even if it slides off the button.
  const hold = (e: React.PointerEvent<HTMLButtonElement>, v: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    api.current?.setMove(v);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={s.title} className={`walk fixed inset-0 z-[70] bg-[#ecdcbe] text-paper-ink ${filming ? "walk--film" : ""}`}>
      <div ref={host} className="absolute inset-0 touch-none" />
      <div aria-hidden="true" className="walk-vignette pointer-events-none absolute inset-0" />

      {venues.map((v, i) => (
        <div key={v.n} ref={(el) => { signs.current[i] = el; }} className="walk-sign absolute left-0 top-0 opacity-0">
          <button type="button" onClick={() => setCard(v.n)} className="flex items-center gap-2 border border-paper-ink bg-paper py-1 pl-1 pr-3 text-left">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-paper-ink text-paper"><CategoryMark kind={v.kind} className="h-4 w-4" /></span>
            <span className="whitespace-nowrap text-[13px] font-semibold">{v.name}</span>
          </button>
          <span aria-hidden="true" className="mx-auto block h-5 w-px bg-paper-ink" />
        </div>
      ))}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <div className="pointer-events-auto border border-paper-ink bg-paper px-3 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em]">{s.title}</p>
          <p className="text-[12px] text-paper-ink-3">{touch ? s.hintTouch : s.hint}</p>
        </div>
        <button ref={closeBtn} type="button" onClick={onClose} aria-label={s.close} className="pointer-events-auto grid h-11 w-11 place-items-center border border-paper-ink bg-paper hover:bg-[#f3ead6]">
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      </div>

      {state !== "ready" ? (
        <div className="absolute inset-0 grid place-items-center">
          <p className="border border-paper-ink bg-paper px-5 py-3 text-[15px] font-semibold">{state === "fail" ? s.fail : s.loading}</p>
        </div>
      ) : null}

      {cardV ? (
        <div className="absolute inset-x-3 bottom-[7.5rem] mx-auto max-w-[22rem] sm:bottom-24">
          <div className="sheet-in border border-paper-ink bg-paper px-4 pb-3.5 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-paper-ink-3">{cardV.category}</p>
                <p className="truncate text-[18px] font-semibold tracking-[-0.02em]">{cardV.name}</p>
              </div>
              <button type="button" onClick={() => setCard(null)} aria-label={s.close} className="-mr-2 -mt-1 grid h-9 w-9 place-items-center">
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" /></svg>
              </button>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-paper-line pt-2.5">
              {cardV.slot ? (
                <Link href={cardV.slot.href}>
                  <span className="numerals block text-[26px] leading-none">{cardV.slot.label}</span>
                  <span className="block text-[12px] text-paper-ink-3">{cardV.slot.day}</span>
                </Link>
              ) : <span />}
              <Link href={cardV.href} className="btn btn-ink btn-sm">{s.open}</Link>
            </div>
          </div>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 sm:p-4" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          {mode !== "air" ? (
            <div className="flex items-center gap-1.5">
              <button type="button" onPointerDown={(e) => hold(e, -1)} onPointerUp={() => api.current?.setMove(0)} onPointerCancel={() => api.current?.setMove(0)} onContextMenu={(e) => e.preventDefault()} aria-label={s.back} className="walk-hold grid h-11 w-11 place-items-center border border-paper-ink bg-paper">
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M7 2v10M3 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
              </button>
              <button type="button" onClick={() => api.current?.toggleAuto()} aria-pressed={auto} className={`min-h-11 border border-paper-ink px-5 text-[15px] font-semibold ${auto ? "bg-paper text-paper-ink" : "bg-paper-ink text-paper"}`}>
                {auto ? s.stop : s.go}
              </button>
              <button type="button" onPointerDown={(e) => hold(e, 1)} onPointerUp={() => api.current?.setMove(0)} onPointerCancel={() => api.current?.setMove(0)} onContextMenu={(e) => e.preventDefault()} aria-label={s.forward} className="walk-hold grid h-11 w-11 place-items-center border border-paper-ink bg-paper">
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M7 12V2M3 6l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
              </button>
            </div>
          ) : null}
          <div role="group" aria-label={s.routes} className="flex max-w-full gap-0 overflow-x-auto border border-paper-ink bg-paper">
            <button type="button" aria-pressed={mode === "air"} onClick={() => api.current?.air()} className={`min-h-11 shrink-0 px-2.5 text-[13px] font-semibold sm:px-4 sm:text-[14px] ${mode === "air" ? "bg-accent" : "hover:bg-[#f3ead6]"}`}>{s.air}</button>
            {routes.map((r) => (
              <button key={r.id} type="button" aria-pressed={mode === r.id} onClick={() => api.current?.walk(r.id)} className={`min-h-11 shrink-0 border-l border-paper-line px-2.5 text-[13px] font-semibold sm:px-4 sm:text-[14px] ${mode === r.id ? "bg-accent" : "hover:bg-[#f3ead6]"}`}>
                {lang === "kk" ? r.kk : r.ru}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
