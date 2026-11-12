// «Пройдись по неровностям»: one table of the things that drift between pages.
// For every route and width it reports
//   - where the header logo, the page title (h1 text) and the footer logo start
//     (they should share one edge);
//   - the title's font family, size and weight;
//   - horizontal overflow, tested by trying to scroll sideways (scrollWidth lies);
//   - blocks that miss the main column edge by 2–10px («near misses»);
//   - text cut by an ellipsis or a line clamp;
//   - the dark/filled buttons: height, radius, font size and weight.
// Screenshots of every page go to the output folder.
//
// Usage:
//   BASE_URL=http://localhost:4310 node tools/audit.mjs audit-out / /pricing /about
//   (routes may also come from tools/routes.txt, one per line)
// Selectors: LOGO_SELECTOR (default `header a[href="/"]`), FOOTER_SELECTOR
// (default `footer a[href="/"]`).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
// The project's own playwright first; else a global one (require honours NODE_PATH).
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }
const base = process.env.BASE_URL || "http://localhost:4310";
const out = process.argv[2] || "audit-out";
let routes = process.argv.slice(3);
if (!routes.length && existsSync("tools/routes.txt")) routes = readFileSync("tools/routes.txt", "utf8").split("\n").map(s => s.trim()).filter(Boolean);
if (!routes.length) routes = ["/"];
const widths = (process.env.WIDTHS || "1440,1024,768,390").split(",").map(Number);
const logoSel = process.env.LOGO_SELECTOR || 'header a[href="/"]';
const footSel = process.env.FOOTER_SELECTOR || 'footer a[href="/"]';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const rows = [];
for (const w of widths) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
  const p = await c.newPage(); const errors = [];
  p.on("pageerror", e => errors.push(String(e).slice(0, 120)));
  for (const route of routes) {
    await p.goto(base + route, { waitUntil: "load" }).catch(() => {});
    await p.waitForTimeout(600);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); });
    const r = await p.evaluate(({ logoSel, footSel }) => {
      const left = sel => { const el = document.querySelector(sel); if (!el) return "-"; const b = el.getBoundingClientRect(); return b.width ? Math.round(b.left) : "-"; };
      const h1 = document.querySelector("h1");
      let h1Left = "-", h1Font = "-";
      if (h1) {
        const range = document.createRange(); range.selectNodeContents(h1);
        const rect = range.getClientRects()[0]; if (rect) h1Left = Math.round(rect.left);
        const s = getComputedStyle(h1); h1Font = `${s.fontFamily.split(",")[0].replace(/"/g, "")} ${Math.round(parseFloat(s.fontSize))}px ${s.fontWeight}`;
      }
      scrollTo(400, 0); const overflow = scrollX > 0; scrollTo(0, 0);
      const vw = innerWidth, main = document.querySelector("main") || document.body;
      const blocks = [...main.querySelectorAll("section, article, header, div, form, ul, ol, p, h1, h2, h3, details, figure")].filter(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return r.width > vw * 0.35 && r.height > 8 && s.visibility !== "hidden" && s.display !== "none" && s.position !== "fixed" && s.position !== "absolute";
      });
      const tally = new Map();
      for (const el of blocks) { const x = Math.round(el.getBoundingClientRect().left); tally.set(x, (tally.get(x) || 0) + 1); }
      const col = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const near = new Set();
      for (const el of blocks) {
        const s = getComputedStyle(el);
        const visible = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.borderTopWidth !== "0px" || el.matches("h1,h2,h3,p");
        const d = Math.round(el.getBoundingClientRect().left) - col;
        if (visible && Math.abs(d) >= 2 && Math.abs(d) <= 10) near.add(`${el.tagName.toLowerCase()}${d > 0 ? "+" : ""}${d}`);
      }
      const cut = [...main.querySelectorAll("*")].filter(el => { const s = getComputedStyle(el); return el.childElementCount === 0 && el.textContent.trim().length > 3 && (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2); }).length;
      const buttons = [...main.querySelectorAll("a, button")].filter(el => {
        const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g); if (!m) return false;
        const [r, g, bb, a = 1] = m.map(Number); return a > 0.5 && el.getBoundingClientRect().width > 60 && (r + g + bb < 210 || r > 180 && g < 110);
      }).map(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return `h${Math.round(r.height)}/r${Math.round(parseFloat(s.borderTopLeftRadius))}/${s.fontSize}/${s.fontWeight}`; });
      return { header: left(logoSel), h1: h1Left, footer: left(footSel), col, h1Font, overflow, near: [...near].slice(0, 4).join(" "), cut, buttons: [...new Set(buttons)].join(" ") };
    }, { logoSel, footSel });
    rows.push({ width: w, route, ...r });
    await p.screenshot({ path: `${out}/${w}${route.replace(/[/?=&]+/g, "_") || "_"}.png`, fullPage: true }).catch(() => {});
  }
  if (errors.length) rows.push({ width: w, route: "PAGE ERRORS", note: errors.slice(0, 4).join(" ; ") });
  await c.close();
}
await b.close();
writeFileSync(`${out}/audit.json`, JSON.stringify(rows, null, 1));
for (const w of widths) {
  console.log(`\n== ${w}px   header | h1 | footer | column   title face   ${"".padEnd(4)}flags`);
  for (const r of rows.filter(r => r.width === w)) {
    if (r.note) { console.log(`${r.route}: ${r.note}`); continue; }
    const flags = [r.overflow && "OVERFLOW", r.near && `near-miss ${r.near}`, r.cut && `cut ${r.cut}`].filter(Boolean).join(" · ");
    console.log(`${r.route.padEnd(28)} ${String(r.header).padStart(4)} ${String(r.h1).padStart(4)} ${String(r.footer).padStart(4)} ${String(r.col).padStart(4)}   ${r.h1Font.padEnd(24)} ${flags}`);
    if (r.buttons) console.log(`${"".padEnd(28)} buttons ${r.buttons}`);
  }
}
console.log(`\nScreenshots and audit.json in ${out}/`);
