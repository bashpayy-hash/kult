// Renders the Almaty plan (relief.webp + base.svg + detail.svg) into WebP
// tiles, so the map moves bitmaps on the GPU instead of re-drawing 28 000
// vector buildings on every frame (15 Nov 2026, owner on the phone: «очень
// много лагов… мощнейшая оптимизация»).
//
// Levels, by the plate's width in pixels; every tile is 1024 × 1024 (the last
// row is cut to the plate's height):
//   base-0   1024   relief + streets, for the whole-city view
//   base-1   2048
//   near-1   2048   + buildings, for the close view
//   near-2   4096
//   near-3   8192
// Run: node scripts/render-map-tiles.mjs (needs Playwright's Chromium).
import { createRequire } from "node:module";
import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// Playwright is not a dependency of the site: use the one installed globally.
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "public", "maps", "almaty");
const OUT = path.join(SRC, "tiles");
const TILE = 1024;
const RATIO = 1176.4 / 1000; // the plate's height over its width (base.svg's viewBox)
const LEVELS = [
  { id: "base-0", w: 1024, near: false },
  { id: "base-1", w: 2048, near: false },
  { id: "near-1", w: 2048, near: true },
  { id: "near-2", w: 4096, near: true },
  { id: "near-3", w: 8192, near: true },
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: TILE, height: TILE }, deviceScaleFactor: 1 });
const html = path.join(SRC, ".tiles.html");
const manifest = { tile: TILE, ratio: RATIO, levels: [] };
let bytes = 0;

for (const L of LEVELS) {
  const H = Math.round(L.w * RATIO);
  const cols = Math.ceil(L.w / TILE), rows = Math.ceil(H / TILE);
  const layer = (src) => `<img src="${src}" style="position:absolute;left:0;top:0;width:${L.w}px;height:${H}px">`;
  await writeFile(html, `<!doctype html><html><body style="margin:0;background:#e9d7b5;overflow:hidden"><div id="p" style="position:absolute;left:0;top:0;width:${L.w}px;height:${H}px">${layer("relief.webp")}${layer("base.svg")}${L.near ? layer("detail.svg") : ""}</div></body></html>`);
  await page.goto(`file://${html}`, { waitUntil: "load" });
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      await page.evaluate(([x, y]) => { document.getElementById("p").style.transform = `translate(${-x}px, ${-y}px)`; }, [c * TILE, r * TILE]);
      const h = Math.min(TILE, H - r * TILE);
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: TILE, height: h } });
      const webp = await sharp(png).webp({ quality: L.near ? 70 : 76, effort: 6 }).toBuffer();
      bytes += webp.length;
      await writeFile(path.join(OUT, `${L.id}-${r}-${c}.webp`), webp);
    }
  manifest.levels.push({ id: L.id, w: L.w, h: H, cols, rows, near: L.near });
  console.log(L.id, `${cols}×${rows}`, Math.round(bytes / 1024), "KB so far");
}
await rm(html);
await writeFile(path.join(OUT, "tiles.json"), JSON.stringify(manifest));
await browser.close();
