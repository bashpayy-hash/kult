// Map drawings for the venue map (src/components/CityMap.tsx):
//
//   public/maps/<city>.svg   — streets and water of the city's frame, from
//                              OpenStreetMap (© OpenStreetMap contributors, ODbL)
//   public/maps/kazakhstan.svg — the country's outline, from geoBoundaries
//                              (CC BY 4.0), for the inset that shows both cities
//
//   node scripts/build-city-maps.mjs ensure     # build step: draw any missing city
//                                               # plan, never fails the build
//   node scripts/build-city-maps.mjs fetch      # download OSM into .osm-cache/
//   node scripts/build-city-maps.mjs draw       # draw city plans from the cache
//   node scripts/build-city-maps.mjs country <regions.topo.json>
//
// The city frames must match src/lib/cities.ts: a plan is an equirectangular
// projection of exactly that frame, so the site places venues on it with two
// linear formulas. No text in the SVGs: labels are HTML and follow the
// site's language. Why `ensure` runs in the Netlify build: the session that
// wrote this could not reach Overpass (12 Nov 2026), the build machine can.
// Once a plan exists in public/maps/ it is committed and never refetched.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CITIES = {
  // Almaty is drawn in detail by scripts/draw-almaty-plan.py (public/maps/almaty/);
  // the plain almaty.svg here is only the fallback and keeps its old frame.
  almaty: { south: 43.19, west: 76.86, north: 43.29, east: 77.0 },
  astana: { south: 51.08, west: 71.33, north: 51.2, east: 71.52 },
};
const WIDTH = 1000;
const CACHE = path.join(process.cwd(), ".osm-cache");
const OUT = path.join(process.cwd(), "public", "maps");
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Print palette (src/app/tokens.css). The plan lies on a .bg-paper box, so
// the SVG has no background of its own.
const INK = { park: "#cdbd8f", water: "#9fb0e0", river: "#7f91d7", major: "#6d4c2e", minor: "#8a6a48" };

function query({ south, west, north, east }) {
  const m = 0.01; // lines run off the edge instead of stopping at it
  const bb = `${south - m},${west - m},${north + m},${east + m}`;
  return `[out:json][timeout:170];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](${bb});
  way["waterway"~"^(river|canal)$"](${bb});
  way["natural"="water"](${bb});
  relation["natural"="water"](${bb});
  way["leisure"="park"](${bb});
  relation["leisure"="park"](${bb});
);
out geom tags;`;
}

async function fetchCity(key) {
  let last;
  // Each mirror twice: a busy Overpass answers 429/504 and is fine a minute later.
  for (const url of [...OVERPASS, ...OVERPASS]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "shaqyru-map-build/1.0" },
        body: new URLSearchParams({ data: query(CITIES[key]) }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const text = await res.text();
      await mkdir(CACHE, { recursive: true });
      await writeFile(path.join(CACHE, `${key}.json`), text);
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// ── Geometry ────────────────────────────────────────────────────────────────
function projector(f) {
  const mid = ((f.north + f.south) / 2) * (Math.PI / 180);
  const height = (WIDTH * (f.north - f.south)) / ((f.east - f.west) * Math.cos(mid));
  return { height, p: ([lon, lat]) => [((lon - f.west) / (f.east - f.west)) * WIDTH, ((f.north - lat) / (f.north - f.south)) * height] };
}

// Douglas–Peucker on projected points. A closed ring (first point = last)
// has no chord to measure against, so it is simplified as two halves.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a0, z0] = [pts[0], pts[pts.length - 1]];
  if (pts.length > 4 && a0[0] === z0[0] && a0[1] === z0[1]) {
    const mid = Math.floor(pts.length / 2);
    return simplify(pts.slice(0, mid + 1), tol).concat(simplify(pts.slice(mid), tol).slice(1));
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    let max = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r = (n) => Math.round(n * 10) / 10;
const inView = (pts, w, h) => pts.some(([x, y]) => x > -50 && x < w + 50 && y > -50 && y < h + 50);
const d = (pts, close) => "M" + pts.map(([x, y]) => `${r(x)} ${r(y)}`).join("L") + (close ? "Z" : "");

// Joins the member ways of an OSM multipolygon into closed rings.
function rings(members) {
  const segs = members.filter((m) => m.type === "way" && m.geometry?.length).map((m) => m.geometry.map((g) => [g.lon, g.lat]));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const out = [];
  while (segs.length) {
    let ring = segs.shift();
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = ring[ring.length - 1];
        if (same(end, s[0])) ring = ring.concat(s.slice(1));
        else if (same(end, s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        segs.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

async function drawCity(key) {
  const { height, p } = projector(CITIES[key]);
  const raw = JSON.parse(await readFile(path.join(CACHE, `${key}.json`), "utf8"));
  const L = { park: [], water: [], river: [], major: [], minor: [] };
  for (const el of raw.elements) {
    const t = el.tags || {};
    const shapes = el.type === "relation" ? rings(el.members || []) : el.geometry ? [el.geometry.map((g) => [g.lon, g.lat])] : [];
    for (const g of shapes) {
      const pts = g.map(p);
      if (!inView(pts, WIDTH, height)) continue;
      if (t.highway) L[["motorway", "trunk", "primary"].includes(t.highway) ? "major" : "minor"].push(d(simplify(pts, 0.8), false));
      else if (t.waterway) L.river.push(d(simplify(pts, 0.8), false));
      else if (t.natural === "water" || t.leisure === "park") {
        const s = simplify(pts, 0.6);
        const xs = s.map((q) => q[0]), ys = s.map((q) => q[1]);
        if (s.length < 4 || (Math.max(...xs) - Math.min(...xs) < 3 && Math.max(...ys) - Math.min(...ys) < 3)) continue;
        L[t.natural === "water" ? "water" : "park"].push(d(s, true));
      }
    }
  }
  const line = (stroke, w, paths) => `<path fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${paths.join("")}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${r(height)}" preserveAspectRatio="none">
<path fill="${INK.park}" fill-rule="evenodd" d="${L.park.join("")}"/>
<path fill="${INK.water}" fill-rule="evenodd" d="${L.water.join("")}"/>
${line(INK.river, 2.4, L.river)}
${line(INK.minor, 1.1, L.minor)}
${line(INK.major, 2.1, L.major)}
</svg>
`;
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, `${key}.svg`), svg);
  console.log("map:", key, Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length])), `${(svg.length / 1024).toFixed(0)} KB`);
}

// ── Country outline from a TopoJSON of the regions ─────────────────────────
async function drawCountry(file) {
  const topo = JSON.parse(await readFile(file, "utf8"));
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });
  const geoms = Object.values(topo.objects)[0].geometries;
  const polys = geoms.flatMap((g) => (g.type === "Polygon" ? [g.arcs] : g.arcs));
  const f = { west: 46.4, east: 87.4, south: 40.5, north: 55.5 };
  const { height, p } = projector(f);
  const ringPts = (ring) => ring.flatMap((a, k) => { const pts = a < 0 ? arcs[~a].slice().reverse() : arcs[a]; return k ? pts.slice(1) : pts; });
  const shape = polys.map((poly) => poly.map((ring) => d(simplify(ringPts(ring).map(p), 1.2), true)).join("")).join("");
  // Only the country's edge is drawn, not the regions (the 2022 regions are
  // not in this snapshot): every region gets a thick brown outline, then the
  // paper fill with a narrower paper stroke covers the shared inner edges,
  // leaving the brown only outside the country.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${r(height)}">
<path fill="none" stroke="#6d4c2e" stroke-width="7" stroke-linejoin="round" d="${shape}"/>
<path fill="#e9d7b5" stroke="#e9d7b5" stroke-width="3" stroke-linejoin="round" d="${shape}"/>
</svg>
`;
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "kazakhstan.svg"), svg);
  console.log("country:", polys.length, "polygons,", `${(svg.length / 1024).toFixed(0)} KB, frame`, JSON.stringify(f));
}

const exists = (f) => access(f).then(() => true, () => false);
const cmd = process.argv[2] ?? "ensure";
if (cmd === "fetch") for (const k of Object.keys(CITIES)) await fetchCity(k);
else if (cmd === "draw") for (const k of Object.keys(CITIES)) await drawCity(k);
else if (cmd === "country") await drawCountry(process.argv[3]);
else if (cmd === "ensure") {
  // Only on Netlify's build machine (or MAPS_FETCH=1): elsewhere a missing
  // plan just means the grid, and a local build should not wait on Overpass.
  const online = process.env.NETLIFY === "true" || process.env.MAPS_FETCH === "1";
  for (const k of Object.keys(CITIES)) {
    if (!online) break;
    if (await exists(path.join(OUT, `${k}.svg`))) continue;
    try {
      await fetchCity(k);
      await drawCity(k);
    } catch (e) {
      console.warn(`map: no street plan for ${k} (${e.message}); the site shows the grid only`);
    }
  }
  // Tells the page which plans exist, so it never asks for a missing file.
  const plans = {};
  for (const k of Object.keys(CITIES)) plans[k] = await exists(path.join(OUT, `${k}.svg`));
  await writeFile(path.join(process.cwd(), "src", "lib", "cityPlans.generated.json"), JSON.stringify(plans, null, 1) + "\n");
  console.log("map: plans", JSON.stringify(plans));
}
