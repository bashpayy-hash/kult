"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
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
  routes: { id: string; ru: string; kk: string; len: number; p: number[] }[];
  dem: { w: number; h: number; x0: number; z0: number; x1: number; z1: number; data: string };
  kokTobe: [number, number, number];
  lamps?: number[];
};

const INK = new THREE.Color("#3a2a20");
const HAZE = new THREE.Color("#ecdcbe");
const ROAD = ["#9c907f", "#a3978a", "#ab9f8d", "#b4a892", "#e2cfa3"];
const ROAD_W = [24, 18, 13, 8, 9];
const AUTUMN = ["#6f7b3a", "#8a8a3f", "#b08a36", "#c69a3b", "#7f6f34", "#5f6b33"];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Pose = { pos: THREE.Vector3; look: THREE.Vector3 };

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // Phones get half the trees, plainer crowns and a lower pixel ratio.
    const lite = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.className = "walk-canvas";
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(HAZE, 900, 11000);
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
    scene.add(new THREE.HemisphereLight(0xfff1d8, 0x8f7a5c, 1.55));
    const sun = new THREE.DirectionalLight(0xffe9c8, 1.55);
    sun.position.set(-0.65, 0.75, 0.55).multiplyScalar(1000);
    scene.add(sun);
    const skyGeo = new THREE.SphereGeometry(30000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color("#98b6c2") }, mid: { value: new THREE.Color("#d9dccb") }, low: { value: HAZE } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(low, mid, smoothstep(0.0, 0.12, h)); c = mix(c, top, smoothstep(0.1, 0.6, h)); gl_FragColor = vec4(c, 1.0); }",
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    disposables.push(skyGeo, skyMat);

    const signAnchors: THREE.Vector3[] = [];
    let data: Scene | null = null;
    let tram: { mesh: THREE.Group; path: THREE.Vector3[]; len: number; s: number; dir: number } | null = null;

    // ── Camera rig ─────────────────────────────────────────────────────────
    const cur: Pose = { pos: new THREE.Vector3(0, 4200, 1), look: new THREE.Vector3(0, 0, 0) };
    let flight: { from: Pose; to: Pose; t0: number; ms: number; arc: number; done?: () => void } | null = null;
    const air = { target: new THREE.Vector3(0, 0, 200), radius: 1500, pitch: 0.42, yaw: Math.PI };
    let walk: { pts: THREE.Vector3[]; cum: number[]; len: number; s: number; sTo: number; yaw: number; yawTo: number; pitch: number; v: number } | null = null;
    let modeNow: "air" | "walk" | "fly" = "fly";
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
      walk = { pts, cum, len: cum[cum.length - 1], s: sAt, sTo: sAt, yaw: 0, yawTo: 0, pitch: 0.02, v: 0 };
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

    function windowTexture() {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#8d8378";
      g.fillRect(16, 14, 32, 34);
      g.fillStyle = "#c9c0b3";
      g.fillRect(31, 14, 2, 34);
      g.fillRect(16, 29, 32, 2);
      g.fillStyle = "#e9e2d6";
      g.fillRect(14, 48, 36, 3);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.magFilter = THREE.LinearFilter;
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

    function build(d: Scene) {
      const pal = d.pal.map((c) => new THREE.Color(c));
      // Ground: warm earth; the mountains rise from the same plane outside the centre.
      const groundTex = grain(0.09);
      groundTex.repeat.set(60000 / 7, 60000 / 7);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: "#d9c39a", map: groundTex }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2;
      scene.add(ground);
      disposables.push(ground.geometry, ground.material as THREE.Material);

      // Mountains from the height grid.
      {
        const { w, h, x0, z0, x1, z1 } = d.dem;
        const raw = Uint8Array.from(atob(d.dem.data), (ch) => ch.charCodeAt(0));
        const H = new Int16Array(raw.buffer);
        const pos: number[] = [], col: number[] = [];
        const at = (i: number, j: number) => H[j * w + i];
        const vx = (i: number) => x0 + ((x1 - x0) * i) / (w - 1), vz = (j: number) => z0 + ((z1 - z0) * j) / (h - 1);
        const c = new THREE.Color();
        const tint = (y: number, slope: number, n: number) => {
          if (y > 1650 + n * 140) return c.set("#f6f1e7");
          if (y > 1350) return c.set(slope > 0.7 ? "#9a8f97" : "#a99c8f");
          if (y > 520) return c.set(slope > 0.6 ? "#6e6a4e" : "#5d6a48");
          if (y > 90) return c.set("#a79964");
          return c.set("#c9b486");
        };
        for (let j = 0; j < h - 1; j++)
          for (let i = 0; i < w - 1; i++) {
            const q = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => new THREE.Vector3(vx(a), at(a, b), vz(b)));
            for (const tri of [[0, 2, 1], [1, 2, 3]]) {
              const [A, B, C] = tri.map((k) => q[k]);
              const yMid = (A.y + B.y + C.y) / 3;
              if (yMid < 0.5) continue;
              const nrm = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
              tint(yMid, 1 - Math.abs(nrm.y), Math.sin(A.x * 0.004) * Math.cos(A.z * 0.003));
              for (const v of [A, B, C]) {
                pos.push(v.x, v.y, v.z);
                col.push(c.r, c.g, c.b);
              }
            }
          }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        scene.add(new THREE.Mesh(g, m));
        disposables.push(g, m);
      }

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
        const m = new THREE.MeshLambertMaterial({ color, map, polygonOffset: true, polygonOffsetFactor: -y, polygonOffsetUnits: -y });
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
        for (const r of d.routes) ribbon(r.p, 6, byCls[4]);
        const tiles = paving(), asphalt = grain(0.1);
        flatMesh(side, "#e3d1aa", 2, tiles, 2);
        byCls.forEach((tris, i) => (i === 4 ? flatMesh(tris, ROAD[4], 4, tiles, 1.6) : flatMesh(tris, ROAD[i], 3, asphalt, 3)));
        const water: number[] = [];
        for (const w of d.w) ribbon(w.slice(1), w[0] === 2 ? 7 : 3, water);
        flatMesh(water, "#8fa1d2", 5);
      }

      // Buildings: walls with window rows, roofs, an ink outline.
      {
        const wall: number[] = [], wallUv: number[] = [], wallCol: number[] = [], wallN: number[] = [];
        const roof: number[] = [], roofCol: number[] = [];
        const edges: number[] = [];
        const c = new THREE.Color();
        const crowns: { x: number; z: number; h: number; ring: THREE.Vector2[] }[] = [];
        const domes: { x: number; z: number; h: number }[] = [];
        // Which buildings stand on a walk: a 40 m grid of the routes' points.
        const near = new Set<string>();
        for (const r of d.routes)
          for (let i = 0; i < r.p.length; i += 2) {
            const gx = Math.floor(r.p[i] / 40), gz = Math.floor(r.p[i + 1] / 40);
            for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) near.add(`${gx + a},${gz + b2}`);
          }
        const shop: number[] = [], shopUv: number[] = [], shopCol: number[] = [], shopN: number[] = [];
        for (const b of d.b) {
          const [h, mh, ci, flag] = b;
          const ring: THREE.Vector2[] = [];
          for (let i = 4; i < b.length; i += 2) ring.push(new THREE.Vector2(b[i], b[i + 1]));
          if (ring.length < 3) continue;
          if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
          const base = flag === 2 ? new THREE.Color("#f1dca0") : pal[ci];
          const onWalk = h > 6 && mh < 1 && !flag && ring.some((p) => near.has(`${Math.floor(p.x / 40)},${Math.floor(p.y / 40)}`));
          const row = Math.abs(Math.round(b[4] * 3 + b[5] * 7)) % 3;
          const jitter = ((b[4] * 13.1 + b[5] * 7.7) % 1 + 1) % 1;
          c.copy(base).offsetHSL(0, 0, (jitter - 0.5) * 0.05);
          let per = 0;
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i], q = ring[(i + 1) % ring.length];
            const L = a.distanceTo(q);
            const nx = (q.y - a.y) / (L || 1), nz = -(q.x - a.x) / (L || 1);
            const u0 = per / 3.6, u1 = (per + L) / 3.6, v0 = mh / 3.2, v1 = h / 3.2;
            per += L;
            // Wound so the face looks out of the building (the ring is counter-clockwise in x/z).
            const quad = [[a.x, mh, a.y, u0, v0], [q.x, h, q.y, u1, v1], [q.x, mh, q.y, u1, v0], [a.x, mh, a.y, u0, v0], [a.x, h, a.y, u0, v1], [q.x, h, q.y, u1, v1]];
            for (const [x, y, z, u, v] of quad) {
              wall.push(x, y, z);
              wallUv.push(u, v);
              wallCol.push(c.r, c.g, c.b);
              wallN.push(nx, 0, nz);
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
        const gw = new THREE.BufferGeometry();
        gw.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
        gw.setAttribute("normal", new THREE.Float32BufferAttribute(wallN, 3));
        gw.setAttribute("uv", new THREE.Float32BufferAttribute(wallUv, 2));
        gw.setAttribute("color", new THREE.Float32BufferAttribute(wallCol, 3));
        const tex = windowTexture();
        const mw = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
        scene.add(new THREE.Mesh(gw, mw));
        const gr = new THREE.BufferGeometry();
        gr.setAttribute("position", new THREE.Float32BufferAttribute(roof, 3));
        gr.setAttribute("color", new THREE.Float32BufferAttribute(roofCol, 3));
        gr.computeVertexNormals();
        const mr = new THREE.MeshLambertMaterial({ vertexColors: true });
        scene.add(new THREE.Mesh(gr, mr));
        const ge = new THREE.BufferGeometry();
        ge.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
        const me = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.42 });
        scene.add(new THREE.LineSegments(ge, me));
        disposables.push(gw, mw, tex, gr, mr, ge, me);
        if (shop.length) {
          const gs = new THREE.BufferGeometry();
          gs.setAttribute("position", new THREE.Float32BufferAttribute(shop, 3));
          gs.setAttribute("normal", new THREE.Float32BufferAttribute(shopN, 3));
          gs.setAttribute("uv", new THREE.Float32BufferAttribute(shopUv, 2));
          gs.setAttribute("color", new THREE.Float32BufferAttribute(shopCol, 3));
          const ms = new THREE.MeshLambertMaterial({ vertexColors: true, map: shopfronts() });
          scene.add(new THREE.Mesh(gs, ms));
          disposables.push(gs, ms);
        }

        // Hotel Kazakhstan's golden crown.
        const gold = new THREE.MeshLambertMaterial({ color: "#d2a948", emissive: "#4a3410" });
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
          const mat = new THREE.MeshLambertMaterial({ color: "#c7a24e" });
          disposables.push(drum, onion, mat);
          const spots: [number, number, number][] = [[0, 0, 1.25], [10, 10, 0.7], [-10, 10, 0.7], [10, -10, 0.7], [-10, -10, 0.7]];
          for (const [ox, oz, sc] of spots) {
            const dr = new THREE.Mesh(drum, new THREE.MeshLambertMaterial({ color: "#f3e3b6" }));
            dr.scale.setScalar(sc);
            dr.position.set(dm.x + ox, dm.h + 4 * sc, dm.z + oz);
            const on = new THREE.Mesh(onion, mat);
            on.scale.set(sc, sc * 1.35, sc);
            on.position.set(dm.x + ox, dm.h + 8 * sc + 5 * sc, dm.z + oz);
            scene.add(dr, on);
          }
        }
      }

      // Trees: golden-autumn crowns, a poplar in every fourth.
      {
        const step = lite ? 2 : 1;
        const n = Math.floor(d.t.length / 3 / step);
        const crownGeo = new THREE.IcosahedronGeometry(1, lite ? 0 : 1);
        const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 5);
        const crownMat = new THREE.MeshLambertMaterial({ flatShading: true });
        const trunkMat = new THREE.MeshLambertMaterial({ color: "#5a4636" });
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
        }
        scene.add(crowns, trunks);
        disposables.push(crownGeo, trunkGeo, crownMat, trunkMat);
      }

      // Lamp posts of the old centre: a dark pole, a cream globe, a little cap.
      if (d.lamps?.length) {
        const n = d.lamps.length / 2;
        const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
          [new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6), new THREE.MeshLambertMaterial({ color: "#2f3a33" }), 2.2],
          [new THREE.CylinderGeometry(0.2, 0.26, 0.7, 8), new THREE.MeshLambertMaterial({ color: "#2f3a33" }), 0.35],
          [new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshLambertMaterial({ color: "#fff6e2", emissive: "#a0835a" }), 4.75],
          [new THREE.ConeGeometry(0.2, 0.32, 8), new THREE.MeshLambertMaterial({ color: "#2f3a33" }), 5.2],
        ];
        const m = new THREE.Matrix4();
        for (const [geo, mat, y] of parts) {
          const inst = new THREE.InstancedMesh(geo, mat, n);
          for (let i = 0; i < n; i++) inst.setMatrixAt(i, m.makeTranslation(d.lamps[i * 2], y, d.lamps[i * 2 + 1]));
          scene.add(inst);
          disposables.push(geo, mat);
        }
      }

      // Kok-Tobe: the TV tower on its hill.
      {
        const [x, z, gy] = d.kokTobe;
        const mat = new THREE.MeshLambertMaterial({ color: "#f2ece0" });
        const red = new THREE.MeshLambertMaterial({ color: "#b8553a" });
        const g1 = new THREE.CylinderGeometry(1.2, 11, 372, 4, 1, true);
        const g2 = new THREE.CylinderGeometry(9, 9, 6, 12);
        disposables.push(mat, red, g1, g2);
        const t = new THREE.Mesh(g1, mat);
        t.position.set(x, gy + 186, z);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g1), new THREE.LineBasicMaterial({ color: INK }));
        edges.position.copy(t.position);
        const deck = new THREE.Mesh(g2, red);
        deck.position.set(x, gy + 150, z);
        scene.add(t, edges, deck);
      }

      // A trolleybus up and down Dostyk.
      const dostyk = d.routes.find((r) => r.id === "dostyk");
      if (dostyk) {
        const path: THREE.Vector3[] = [];
        for (let i = 0; i < dostyk.p.length; i += 2) path.push(new THREE.Vector3(dostyk.p[i], 0, dostyk.p[i + 1]));
        // From the sidewalk back to the road's near lane.
        const shifted = path.map((p, i) => {
          const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
          const dir = b.clone().sub(a).normalize();
          return p.clone().add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(-11));
        });
        const g = new THREE.Group();
        const box = (w: number, h: number, l: number, color: string, y: number) => {
          const geo = new THREE.BoxGeometry(w, h, l), mat = new THREE.MeshLambertMaterial({ color });
          disposables.push(geo, mat);
          const m = new THREE.Mesh(geo, mat);
          m.position.y = y;
          g.add(m);
          return m;
        };
        box(2.5, 1.3, 11.5, "#b8402c", 1.15);
        box(2.5, 1.5, 11.5, "#efe3c6", 2.55);
        box(2.52, 0.6, 9.5, "#5a6a74", 2.3);
        const pole = new THREE.CylinderGeometry(0.05, 0.05, 6.5, 4);
        const pm = new THREE.MeshLambertMaterial({ color: "#2b2420" });
        disposables.push(pole, pm);
        for (const ox of [-0.5, 0.5]) {
          const p = new THREE.Mesh(pole, pm);
          p.position.set(ox, 4.8, -1.5);
          p.rotation.x = -1.05;
          g.add(p);
        }
        scene.add(g);
        let len = 0;
        for (let i = 1; i < shifted.length; i++) len += shifted[i].distanceTo(shifted[i - 1]);
        tram = { mesh: g, path: shifted, len, s: 0, dir: 1 };
      }

      // Anchors for the places' signs.
      for (const v of venues) {
        const p = toXZ(v.lat, v.lng, d);
        signAnchors.push(p.setY(16));
      }
    }

    fetch("/maps/almaty/walk.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Scene) => {
        if (disposed) return;
        data = d;
        build(d);
        setRoutes(d.routes);
        setState("ready");
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
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("a,button")) return;
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
        walk.pitch = Math.max(-0.35, Math.min(0.5, walk.pitch + dy * 0.003));
        if (e.pointerType === "touch") walk.sTo -= dy * 0.25; // a vertical swipe walks
      }
    };
    const onUp = (e: PointerEvent) => {
      ptr.delete(e.pointerId);
      pinch = 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (modeNow === "air") air.radius = Math.max(220, Math.min(4200, air.radius * Math.exp(e.deltaY * 0.0012)));
      else if (modeNow === "walk" && walk) walk.sTo -= e.deltaY * 0.12;
    };
    const held = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
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
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
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

      if (tram && !reduce) {
        tram.s += tram.dir * 9 * dt;
        if (tram.s > tram.len - 5 || tram.s < 5) tram.dir *= -1;
        let acc = 0, i = 1;
        while (i < tram.path.length - 1 && acc + tram.path[i].distanceTo(tram.path[i - 1]) < tram.s) { acc += tram.path[i].distanceTo(tram.path[i - 1]); i++; }
        const a = tram.path[i - 1], b = tram.path[i];
        const f = (tram.s - acc) / Math.max(0.01, a.distanceTo(b));
        tram.mesh.position.lerpVectors(a, b, Math.min(1, Math.max(0, f)));
        tram.mesh.lookAt(v3.copy(tram.mesh.position).add(b.clone().sub(a).multiplyScalar(tram.dir)));
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
      raf = requestAnimationFrame(tick);
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
      renderer.domElement.remove();
    };
  }, [venues, startVenue]);

  const cardV = venues.find((v) => v.n === card);

  return (
    <div role="dialog" aria-modal="true" aria-label={s.title} className="walk fixed inset-0 z-[70] bg-[#ecdcbe] text-paper-ink">
      <div ref={host} className="absolute inset-0 touch-none" />
      <div aria-hidden="true" className="walk-grain pointer-events-none absolute inset-0" />

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
              <button type="button" onPointerDown={() => api.current?.setMove(-1)} onPointerUp={() => api.current?.setMove(0)} onPointerLeave={() => api.current?.setMove(0)} aria-label={s.back} className="grid h-11 w-11 place-items-center border border-paper-ink bg-paper">
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M7 2v10M3 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
              </button>
              <button type="button" onClick={() => api.current?.toggleAuto()} aria-pressed={auto} className={`min-h-11 border border-paper-ink px-5 text-[15px] font-semibold ${auto ? "bg-paper text-paper-ink" : "bg-paper-ink text-paper"}`}>
                {auto ? s.stop : s.go}
              </button>
              <button type="button" onPointerDown={() => api.current?.setMove(1)} onPointerUp={() => api.current?.setMove(0)} onPointerLeave={() => api.current?.setMove(0)} aria-label={s.forward} className="grid h-11 w-11 place-items-center border border-paper-ink bg-paper">
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true"><path d="M7 12V2M3 6l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
              </button>
            </div>
          ) : null}
          <div role="group" aria-label={s.routes} className="flex max-w-full gap-0 overflow-x-auto border border-paper-ink bg-paper">
            <button type="button" aria-pressed={mode === "air"} onClick={() => api.current?.air()} className={`min-h-11 shrink-0 px-4 text-[14px] font-semibold ${mode === "air" ? "bg-accent" : "hover:bg-[#f3ead6]"}`}>{s.air}</button>
            {routes.map((r) => (
              <button key={r.id} type="button" aria-pressed={mode === r.id} onClick={() => api.current?.walk(r.id)} className={`min-h-11 shrink-0 border-l border-paper-line px-4 text-[14px] font-semibold ${mode === r.id ? "bg-accent" : "hover:bg-[#f3ead6]"}`}>
                {lang === "kk" ? r.kk : r.ru}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
