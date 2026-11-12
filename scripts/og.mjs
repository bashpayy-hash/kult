// Renders public/og.png (1200×630), the link preview: the cover photograph
// on the left, the name and the promise on the right, in the site's one
// typeface. Run after changing the name, the cover or the tagline:
//   node scripts/og.mjs
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
// Playwright is not a dependency of the site: use the copy on the machine.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = process.cwd();
const font = path.join(root, "node_modules/@fontsource-variable/inter-tight/files/inter-tight-cyrillic-ext-wght-normal.woff2");
const font2 = path.join(root, "node_modules/@fontsource-variable/inter-tight/files/inter-tight-cyrillic-wght-normal.woff2");
const font3 = path.join(root, "node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2");
const hero = path.join(root, "public/plates/hero-1200.webp");
const icon = await readFile(path.join(root, "src/app/icon.svg"), "utf8");
const mark = icon.match(/<g[\s\S]*<\/g>/)[0].replace(/transform="[^"]*"/, "");

const html = `<!doctype html><html><head><style>
@font-face { font-family: IT; src: url("file://${font3}") format("woff2"); font-weight: 100 900; unicode-range: U+0000-00FF; }
@font-face { font-family: IT; src: url("file://${font2}") format("woff2"); font-weight: 100 900; unicode-range: U+0400-045F; }
@font-face { font-family: IT; src: url("file://${font}") format("woff2"); font-weight: 100 900; unicode-range: U+0460-052F; }
html, body { margin: 0; width: 1200px; height: 630px; background: #231917; font-family: IT, sans-serif; color: #e9d7b5; }
.wrap { display: grid; grid-template-columns: 504px 1fr; height: 630px; }
.photo { background: url("file://${hero}") center 40% / cover; }
.text { display: flex; flex-direction: column; padding: 56px 64px 60px; }
.top { display: flex; align-items: center; justify-content: space-between; padding-bottom: 24px; border-bottom: 1px solid #4a382e; }
.brand { display: flex; align-items: center; gap: 12px; font-size: 30px; font-weight: 700; letter-spacing: -0.045em; color: #f3ead6; }
.year { font-size: 30px; font-weight: 300; letter-spacing: -0.04em; color: #d1b475; font-variant-numeric: tabular-nums; }
h1 { margin: auto 0 0; font-size: 84px; line-height: 1.04; font-weight: 600; letter-spacing: -0.04em; color: #f3ead6; }
p { margin: 22px 0 0; font-size: 26px; font-weight: 400; letter-spacing: -0.015em; color: #c9b48f; }
</style></head><body><div class="wrap"><div class="photo"></div><div class="text">
<div class="top"><div class="brand"><svg viewBox="0 0 256 256" width="30" height="30">${mark}</svg>бөлек, Алматы</div><div class="year">2026</div></div>
<h1>Куда пойти<br>в Алматы</h1><p>Свободные столы, время и бонусы мест</p>
</div></div></body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
// A file page may load file:// fonts and the photo; about:blank may not.
const tmp = path.join(os.tmpdir(), `og-${process.pid}.html`);
await writeFile(tmp, html);
await p.goto("file://" + tmp, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(root, "public/og.png") });
await b.close();
await rm(tmp);
console.log("public/og.png written");
