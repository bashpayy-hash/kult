// Renders the home page's cover loop from the 3D walk (15 Nov 2026, owner on
// the landing: «иллюстрация классная, но не под лендинг… нужно брать ещё
// что-то сильнее»). The city of the walk, at golden hour, in three shots —
// over the city towards the range, along Arbat under the festoon lights,
// down Dostyk towards the mountains — rendered frame by frame at a fixed
// step through the walk's film mode (CityWalk.tsx), so it is smooth however
// slow the machine. Frames go to design/hero-film/frames/ (not committed);
// scripts/encode-hero-film.py blends and encodes them.
// Run with the site running on :3100: node scripts/render-hero-film.mjs
import { createRequire } from "node:module";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "design", "hero-film", "frames");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const SIZE = 1280, FPS = 24, SHOT_S = 6.5;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
await page.addInitScript(() => { window.__walkFilm = {}; });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.locator(".plan-view").scrollIntoViewIfNeeded();
await page.getByRole("button", { name: /Прогуляться по центру/ }).click();
await page.waitForFunction(() => window.__walkFilm && window.__walkFilm.ready, null, { timeout: 180000 });

const route = async (id) => {
  const p = await page.evaluate((id) => window.__walkFilm.route(id), id);
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / Math.max(0.01, cum[i] - cum[i - 1]);
    return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
  };
  return { at, len: cum[cum.length - 1] };
};

// A street shot: eye height, looking ahead along the route, a slow walk.
const street = (r, s0, metres, lift = 1.75, pitch = 0.04) => (t) => {
  const s = s0 + metres * t;
  const [x, z] = r.at(s), [ax, az] = r.at(s + 30);
  return [[x, lift, z], [ax, lift + Math.tan(pitch) * 30, az]];
};
const arbat = await route("arbat"), dostyk = await route("dostyk");
const shots = [
  // Over the city towards the snowy range, the camera gliding in a gentle arc.
  ["air", (t) => {
    // Coming down towards the roofs: from a wide view of the grid to the old centre's streets.
    const e = ease(t), yaw = Math.PI + lerp(0.24, -0.12, e), r = lerp(1450, 820, e), pitch = lerp(0.33, 0.21, e);
    const tx = lerp(-60, 0, e), tz = lerp(120, 360, e);
    return [[tx + Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r, tz + Math.cos(yaw) * Math.cos(pitch) * r], [tx, 0, tz]];
  }],
  ["arbat", street(arbat, 40, 30, 1.8, 0.13)],
  ["dostyk", street(dostyk, 60, 36, 1.8, 0.1)],
];

let n = 0;
for (const [name, cam] of shots) {
  const frames = process.env.TEST ? 3 : Math.round(SHOT_S * FPS);
  for (let i = 0; i < frames; i++) {
    const [pos, look] = cam(i / (frames - 1));
    const url = await page.evaluate(([p, l, dt]) => window.__walkFilm.frame(p, l, dt), [pos, look, 1 / FPS]);
    await writeFile(path.join(OUT, `${name}-${String(i).padStart(4, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
    n++;
    if (n % 24 === 0) console.log(name, i + 1, "/", frames);
  }
}
await browser.close();
console.log("frames", n);
