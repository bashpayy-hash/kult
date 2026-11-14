// One-off data pull for the detailed Almaty plan (14 Nov 2026, owner: «нужна
// более детальная и реалистичная, концептуальная карта в стиле всего сайта с
// анимациями приближения»).
//
// The cloud session cannot reach OpenStreetMap or elevation servers; the
// Netlify build machine can. So on Netlify, and only until the material has
// been pulled into the repo (design/map-source/pulled.json), this downloads it into
// public/maps/raw/, where it is served for one deploy, fetched into the repo's
// design/map-source/ and drawn by scripts/draw-almaty-plan.mjs. It never
// fails the build. Data: © OpenStreetMap contributors (ODbL); elevation —
// AWS Terrain Tiles (Terrarium), Mapzen/USGS SRTM and others, public domain.
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "maps", "raw");
const BB = { south: 43.12, west: 76.8, north: 43.32, east: 77.1 };
const CORE = { south: 43.2, west: 76.88, north: 43.275, east: 76.99 };
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const bb = (b) => `${b.south},${b.west},${b.north},${b.east}`;

const QUERIES = {
  roads: `[out:json][timeout:240];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${bb(BB)});out tags geom qt;`,
  land: `[out:json][timeout:240];(
    way["waterway"~"^(river|stream|canal)$"](${bb(BB)});
    way["natural"~"^(water|wood|scrub)$"](${bb(BB)});
    relation["natural"~"^(water|wood)$"](${bb(BB)});
    way["leisure"~"^(park|garden|stadium|pitch)$"](${bb(BB)});
    relation["leisure"~"^(park|garden)$"](${bb(BB)});
    way["landuse"~"^(forest|grass|cemetery|meadow|allotments|recreation_ground)$"](${bb(BB)});
    relation["landuse"~"^(forest|cemetery)$"](${bb(BB)});
    way["railway"="rail"](${bb(BB)});
  );out tags geom qt;`,
  buildings: `[out:json][timeout:300];way["building"](${bb(CORE)});out skel geom qt;`,
  places: `[out:json][timeout:120];(
    node["place"~"^(suburb|neighbourhood|quarter)$"](${bb(BB)});
    nwr["tourism"~"^(attraction|museum|viewpoint)$"](${bb(BB)});
    nwr["tourism"="hotel"]["name"~"Казахстан"](${bb(BB)});
    nwr["man_made"~"^(tower|mast)$"]["name"](${bb(BB)});
    nwr["amenity"="marketplace"]["name"](${bb(BB)});
    nwr["boundary"="administrative"]["admin_level"="9"](${bb(BB)});
  );out tags center qt;`,
};

async function overpass(name, q) {
  let last;
  for (const url of [...OVERPASS, ...OVERPASS]) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "bolek-map-build/1.0" }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(320_000) });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const text = await res.text();
      await writeFile(path.join(OUT, `${name}.json`), text);
      console.log(`map-raw: ${name} ${(text.length / 1048576).toFixed(1)} MB from ${url}`);
      return true;
    } catch (e) { last = e; }
  }
  console.warn(`map-raw: ${name} failed (${last?.message})`);
  return false;
}

// Terrarium tiles: height = R*256 + G + B/256 − 32768 metres.
const tile = (lat, lon, z) => { const n = 2 ** z; const x = Math.floor(((lon + 180) / 360) * n); const r = (lat * Math.PI) / 180; const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n); return { x, y }; };
async function dem(z) {
  const a = tile(BB.north, BB.west, z), b = tile(BB.south, BB.east, z);
  await mkdir(path.join(OUT, "dem"), { recursive: true });
  let ok = 0;
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) {
    try {
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(path.join(OUT, "dem", `${z}_${x}_${y}.png`), Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (e) { console.warn(`map-raw: dem ${z}/${x}/${y} failed (${e.message})`); }
  }
  console.log(`map-raw: dem z${z} ${ok} tiles, x ${a.x}–${b.x}, y ${a.y}–${b.y}`);
  return { z, x0: a.x, x1: b.x, y0: a.y, y1: b.y, ok };
}

const pulled = await access(path.join(process.cwd(), "design", "map-source", "pulled.json")).then(() => true, () => false);
// The walkable centre (14 Nov 2026, owner: «иммерзнуться именно в сам город…
// пару улиц сделать и там гулять»): buildings with their levels and names,
// trees, for the 3D walk. Pulled once, gated by its own marker.
const WALK = { south: 43.229, west: 76.926, north: 43.269, east: 76.968 };
const walkPulled = await access(path.join(process.cwd(), "design", "map-source", "walk-pulled.json")).then(() => true, () => false);
const WALK_QUERIES = {
  "walk-buildings": `[out:json][timeout:240];(way["building"](${bb(WALK)});way["building:part"](${bb(WALK)});relation["building"](${bb(WALK)}););out tags geom qt;`,
  "walk-trees": `[out:json][timeout:180];(node["natural"="tree"](${bb(WALK)});way["natural"="tree_row"](${bb(WALK)}););out tags geom qt;`,
};
if (process.env.NETLIFY === "true" && !walkPulled) {
  try {
    await mkdir(OUT, { recursive: true });
    for (const [k, q] of Object.entries(WALK_QUERIES)) await overpass(k, q);
  } catch (e) {
    console.warn(`map-raw: walk skipped (${e.message})`);
  }
}
if (process.env.NETLIFY === "true" && !pulled) {
  try {
    await mkdir(OUT, { recursive: true });
    const done = {};
    for (const [k, q] of Object.entries(QUERIES)) done[k] = await overpass(k, q);
    done.dem = await dem(13);
    await writeFile(path.join(OUT, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), bbox: BB, core: CORE, done }, null, 1));
  } catch (e) {
    console.warn(`map-raw: skipped (${e.message})`);
  }
}
