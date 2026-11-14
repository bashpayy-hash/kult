"""Draws the detailed Almaty plan for the venue map (src/components/CityMap.tsx).

14 Nov 2026, owner: «нужна более детальная и реалистичная, концептуальная
карта в стиле всего сайта с анимациями приближения». The plan is printed like a
city map of the 1970s in the site's palette: paper, relief by hill shading and
contour lines, rivers, parks, building blocks, streets as light channels with
brown edges, main avenues in brick.

Input:  design/map-source/{roads,land,buildings,places}.json (OpenStreetMap,
        © OpenStreetMap contributors, ODbL) and design/map-source/dem/*.png
        (AWS Terrain Tiles, Terrarium encoding), pulled by
        scripts/fetch-map-raw.mjs on a Netlify build.
Output: public/maps/almaty/relief.webp  hill shading on paper, opaque
        public/maps/almaty/base.svg     water, green, contours, rail, main roads
        public/maps/almaty/detail.svg   buildings and minor streets (shown when zoomed)
        src/lib/almatyPlan.generated.json  frame, sizes, labels, landmarks

Run: python3 scripts/draw-almaty-plan.py   (needs numpy, pillow, shapely,
scikit-image; the frame must match src/lib/cities.ts).
"""
import json
import math
import os
import re
from collections import defaultdict

import numpy as np
from PIL import Image
from shapely.geometry import LineString, Polygon, box
from shapely.ops import linemerge, unary_union
from skimage import measure

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design", "map-source")
OUT = os.path.join(ROOT, "public", "maps", "almaty")
F = dict(south=43.17, west=76.86, north=43.29, east=77.0)
W = 1000.0
MID = math.radians((F["north"] + F["south"]) / 2)
H = W * (F["north"] - F["south"]) / ((F["east"] - F["west"]) * math.cos(MID))
FRAME = box(-12, -12, W + 12, H + 12)

# Print palette (src/app/tokens.css and DESIGN.md).
PAPER = (233, 215, 181)
INK = "#231917"
INK2 = "#503523"
INK3 = "#6d4c2e"
WATER = "#7f91d7"
WATER_FILL = "#a9b6df"
PARK = "#cbc391"
FOREST = "#b9b37e"
GREEN_INK = "#7b7a3c"
BUILDING = "#d3bd94"
BRICK = "#b8553a"


def P(lon, lat):
    return ((lon - F["west"]) / (F["east"] - F["west"]) * W, (F["north"] - lat) / (F["north"] - F["south"]) * H)


def load(name):
    with open(os.path.join(SRC, f"{name}.json"), encoding="utf8") as f:
        return json.load(f)["elements"]


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def path_d(coords, close=False):
    """Absolute first point, then relative steps: about half the bytes."""
    pts = [(round(x, 1), round(y, 1)) for x, y in coords]
    out = [f"M{fmt(pts[0][0])} {fmt(pts[0][1])}"]
    px, py = pts[0]
    steps = []
    for x, y in pts[1:]:
        dx, dy = round(x - px, 1), round(y - py, 1)
        if dx == 0 and dy == 0:
            continue
        steps.append(f"{fmt(dx)} {fmt(dy)}".replace(" -", "-"))
        px, py = x, y
    if not steps:
        return ""
    return out[0] + "l" + " ".join(steps).replace(" -", "-") + ("z" if close else "")


def lines_of(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    if hasattr(geom, "geoms"):
        return [g for g in geom.geoms if g.geom_type == "LineString"]
    return []


def polys_of(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if hasattr(geom, "geoms"):
        return [g for g in geom.geoms if g.geom_type == "Polygon"]
    return []


def line_d(ls, tol):
    s = ls.simplify(tol, preserve_topology=False)
    return path_d(list(s.coords)) if len(s.coords) > 1 else ""


def poly_d(pg, tol, min_area):
    pg = pg.simplify(tol, preserve_topology=True)
    if pg.is_empty or pg.area < min_area:
        return ""
    parts = [path_d(list(pg.exterior.coords)[:-1], True)]
    for hole in pg.interiors:
        if Polygon(hole).area >= min_area:
            parts.append(path_d(list(hole.coords)[:-1], True))
    return "".join(p for p in parts if p)


def rings(members):
    """Joins the member ways of an OSM multipolygon into closed rings."""
    segs = [[P(g["lon"], g["lat"]) for g in m["geometry"]] for m in members if m.get("type") == "way" and m.get("geometry") and m.get("role", "outer") != "inner"]
    out = []
    while segs:
        ring = segs.pop(0)
        grew = True
        while ring[0] != ring[-1] and grew:
            grew = False
            for i, s in enumerate(segs):
                if ring[-1] == s[0]:
                    ring += s[1:]
                elif ring[-1] == s[-1]:
                    ring += s[::-1][1:]
                else:
                    continue
                segs.pop(i)
                grew = True
                break
        if len(ring) > 3:
            out.append(ring)
    return out


def shapes(el):
    if el["type"] == "relation":
        return [Polygon(r) for r in rings(el.get("members", [])) if len(r) > 3]
    g = el.get("geometry")
    if not g:
        return []
    pts = [P(p["lon"], p["lat"]) for p in g if p]
    return [pts]


# ── Streets ────────────────────────────────────────────────────────────────
ROAD_CLASS = {
    "motorway": "major", "trunk": "major", "primary": "major", "motorway_link": "major", "trunk_link": "major", "primary_link": "major",
    "secondary": "secondary", "secondary_link": "secondary",
    "tertiary": "tertiary", "tertiary_link": "tertiary", "unclassified": "tertiary",
    "residential": "minor", "living_street": "minor", "pedestrian": "minor",
}
roads = defaultdict(list)
named = defaultdict(list)
for el in load("roads"):
    t = el.get("tags", {})
    cls = ROAD_CLASS.get(t.get("highway"))
    if not cls or not el.get("geometry"):
        continue
    ls = LineString([P(p["lon"], p["lat"]) for p in el["geometry"]])
    clipped = ls.intersection(FRAME)
    for part in lines_of(clipped):
        roads[cls].append(part)
        if cls in ("major", "secondary") and (t.get("name") or t.get("name:ru")) and not t["highway"].endswith("_link"):
            named[(t.get("name:ru") or t.get("name"), t.get("name:kk") or t.get("name"))].append(part)

# ── Water, green, rail ─────────────────────────────────────────────────────
L = defaultdict(list)
for el in load("land"):
    t = el.get("tags", {})
    for g in shapes(el):
        if t.get("waterway") or t.get("railway"):
            if isinstance(g, Polygon):
                continue
            ls = LineString(g).intersection(FRAME)
            key = "rail" if t.get("railway") else ("stream" if t.get("waterway") == "stream" else "river")
            L[key] += lines_of(ls)
            continue
        try:
            pg = g if isinstance(g, Polygon) else Polygon(g)
            if not pg.is_valid:
                pg = pg.buffer(0)
            pg = pg.intersection(FRAME)
        except Exception:
            continue
        if t.get("natural") == "water":
            L["water"] += polys_of(pg)
        elif t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest":
            L["forest"] += polys_of(pg)
        elif t.get("leisure") in ("park", "garden") or t.get("landuse") in ("grass", "meadow", "recreation_ground", "cemetery"):
            L["park"] += polys_of(pg)
        elif t.get("leisure") in ("stadium", "pitch"):
            L["pitch"] += polys_of(pg)

# ── Buildings (core only) ──────────────────────────────────────────────────
buildings = []
for el in load("buildings"):
    g = el.get("geometry")
    if not g or len(g) < 4:
        continue
    try:
        pg = Polygon([P(p["lon"], p["lat"]) for p in g if p])
        if not pg.is_valid:
            pg = pg.buffer(0)
    except Exception:
        continue
    buildings += polys_of(pg.intersection(FRAME))

# ── Relief from the elevation tiles ────────────────────────────────────────
tiles = {}
for fn in os.listdir(os.path.join(SRC, "dem")):
    m = re.match(r"(\d+)_(\d+)_(\d+)\.png", fn)
    if m:
        z, x, y = map(int, m.groups())
        tiles[(x, y)] = os.path.join(SRC, "dem", fn)
Z = 13
xs = sorted({k[0] for k in tiles})
ys = sorted({k[1] for k in tiles})
dem = np.zeros((len(ys) * 256, len(xs) * 256), dtype=np.float32)
for (x, y), fn in tiles.items():
    a = np.asarray(Image.open(fn).convert("RGB")).astype(np.float32)
    h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    dem[(y - ys[0]) * 256:(y - ys[0] + 1) * 256, (x - xs[0]) * 256:(x - xs[0] + 1) * 256] = h
N = 2 ** Z


def merc_px(lon, lat):
    """Global pixel at zoom Z → index in the stitched grid."""
    gx = (lon + 180) / 360 * N * 256
    r = np.radians(lat)
    gy = (1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * N * 256
    return gx - xs[0] * 256, gy - ys[0] * 256


def px_lonlat(col, row):
    gx = col + xs[0] * 256
    gy = row + ys[0] * 256
    lon = gx / (N * 256) * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * gy / (N * 256)))))
    return lon, lat


def blur(a, r):
    k = np.exp(-0.5 * (np.arange(-r * 3, r * 3 + 1) / r) ** 2)
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, len(k) // 2, mode="edge"), k, mode="valid"), 1, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, len(k) // 2, mode="edge"), k, mode="valid"), 0, a)


dem_s = blur(dem, 1.6)

# Contours every 50 m; every 250 m is an index line.
contours = {"c": [], "i": []}
labels_contour = []
for level in range(700, 3200, 50):
    if level < dem_s.min() or level > dem_s.max():
        continue
    for c in measure.find_contours(dem_s, level):
        if len(c) < 12:
            continue
        pts = [P(*px_lonlat(col, row)) for row, col in c]
        ls = LineString(pts).intersection(FRAME)
        for part in lines_of(ls):
            if part.length < 25:
                continue
            key = "i" if level % 250 == 0 else "c"
            contours[key].append(part)
            if key == "i" and part.length > 260 and level >= 1000:
                mid = part.interpolate(0.5, normalized=True)
                a = part.interpolate(0.5 - 8 / part.length, normalized=True)
                b = part.interpolate(0.5 + 8 / part.length, normalized=True)
                ang = math.degrees(math.atan2(b.y - a.y, b.x - a.x))
                if ang > 90:
                    ang -= 180
                if ang < -90:
                    ang += 180
                if 0 < mid.x < W and 0 < mid.y < H:
                    labels_contour.append({"t": str(level), "x": round(mid.x / W * 100, 2), "y": round(mid.y / H * 100, 2), "a": round(ang, 1)})

# Hill shading at 2× the plan, baked onto paper.
RW, RH = 2000, int(round(H * 2))
gx = np.linspace(F["west"], F["east"], RW)
gy = np.linspace(F["north"], F["south"], RH)
LON, LAT = np.meshgrid(gx, gy)
cx, cy = merc_px(LON, LAT)
# Slope and aspect on the DEM grid (metres per pixel at this latitude).
mpp = 40075016.686 * math.cos(MID) / (N * 256)
dzdx = np.gradient(dem_s, axis=1) / mpp
dzdy = np.gradient(dem_s, axis=0) / mpp
az, alt = math.radians(315), math.radians(42)
slope = np.arctan(np.hypot(dzdx, dzdy) * 1.6)
aspect = np.arctan2(-dzdx, dzdy)
shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect - math.pi / 2)
flat = math.sin(alt)


def sample(a, cx, cy):
    x0 = np.clip(np.floor(cx).astype(int), 0, a.shape[1] - 2)
    y0 = np.clip(np.floor(cy).astype(int), 0, a.shape[0] - 2)
    fx, fy = cx - x0, cy - y0
    return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy) + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy)


sh = sample(shade, cx, cy) / flat
el = sample(dem_s, cx, cy)
paper = np.array(PAPER, dtype=np.float32)
light = np.array((246, 238, 222), dtype=np.float32)
shadow = np.array((120, 84, 58), dtype=np.float32)
d = np.clip(1 - sh, 0, 1)[..., None]
l = np.clip(sh - 1, 0, 0.6)[..., None] / 0.6
img = paper * (1 - 0.62 * d) + shadow * 0.62 * d
img = img * (1 - 0.55 * l) + light * 0.55 * l
# The foothills grow a touch lighter with height, the snowline lighter still.
hl = np.clip((el - 1100) / 1200, 0, 1)[..., None]
img = img * (1 - 0.28 * hl) + light * 0.28 * hl
img = np.clip(img, 0, 255).astype(np.uint8)
os.makedirs(OUT, exist_ok=True)
Image.fromarray(img).save(os.path.join(OUT, "relief.webp"), quality=80, method=6)

# ── Write the SVG layers ───────────────────────────────────────────────────
def stroke(paths, color, width, extra=""):
    d = "".join(p for p in paths if p)
    cap = "" if "stroke-linecap" in extra else ' stroke-linecap="round"'
    return f'<path fill="none" stroke="{color}" stroke-width="{width}"{cap} stroke-linejoin="round"{extra} d="{d}"/>' if d else ""


def fill(paths, color, extra=""):
    d = "".join(p for p in paths if p)
    return f'<path fill="{color}" fill-rule="evenodd"{extra} d="{d}"/>' if d else ""


head = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(W)} {fmt(H)}" preserveAspectRatio="none">'
park_d = [poly_d(p, 0.6, 8) for p in L["park"]]
forest_d = [poly_d(p, 0.6, 8) for p in L["forest"]]
water_d = [poly_d(p, 0.3, 1) for p in L["water"]]
pitch_d = [poly_d(p, 0.4, 6) for p in L["pitch"]]
major = [line_d(x, 0.35) for x in roads["major"]]
secondary = [line_d(x, 0.35) for x in roads["secondary"]]
tertiary = [line_d(x, 0.35) for x in roads["tertiary"]]
minor = [line_d(x, 0.3) for x in roads["minor"]]
base = "\n".join(filter(None, [
    head,
    '<defs><pattern id="wood" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.45" height="3" fill="' + GREEN_INK + '" opacity="0.55"/></pattern></defs>',
    fill(park_d, PARK, ' opacity="0.85"'),
    fill(forest_d, FOREST, ' opacity="0.8"'),
    fill(forest_d, "url(#wood)"),
    fill(pitch_d, "#d9cba1"),
    stroke([line_d(x, 0.4) for x in contours["c"]], INK3, 0.35, ' opacity="0.35"'),
    stroke([line_d(x, 0.4) for x in contours["i"]], INK3, 0.7, ' opacity="0.55"'),
    fill(water_d, WATER_FILL),
    stroke([line_d(x, 0.4) for x in L["stream"]], WATER, 0.7),
    stroke([line_d(x, 0.4) for x in L["river"]], WATER, 1.6),
    stroke([line_d(x, 0.4) for x in L["rail"]], INK2, 1.6),
    stroke([line_d(x, 0.4) for x in L["rail"]], "#e9d7b5", 0.9, ' stroke-dasharray="3 3" stroke-linecap="butt"'),
    stroke(tertiary, "#a38763", 1.9),
    stroke(secondary, INK3, 2.7),
    stroke(major, "#5b2a1d", 3.3),
    stroke(tertiary, "#f3e9d4", 1.2),
    stroke(secondary, "#f6eedc", 2.1),
    stroke(major, BRICK, 2.3),
    "</svg>",
]))
with open(os.path.join(OUT, "base.svg"), "w", encoding="utf8") as f:
    f.write(base + "\n")

bld = [poly_d(p, 0.12, 0.25) for p in buildings]
detail = "\n".join(filter(None, [
    head,
    fill(bld, BUILDING),
    stroke(minor, "#b49b74", 1.05),
    stroke(minor, "#f3e9d4", 0.6),
    "</svg>",
]))
with open(os.path.join(OUT, "detail.svg"), "w", encoding="utf8") as f:
    f.write(detail + "\n")

# ── Labels ─────────────────────────────────────────────────────────────────
def short(name):
    return (name.replace("проспект ", "пр. ").replace(" проспект", " пр.").replace("улица ", "ул. ").replace(" улица", " ул.")
            .replace("даңғылы", "даңғ.").replace("көшесі", "к-сі"))


avenues = []
for (ru, kk), parts in named.items():
    u = unary_union(parts)
    merged = linemerge(u) if u.geom_type == "MultiLineString" else u
    segs = lines_of(merged)
    if not segs:
        continue
    total = sum(s.length for s in segs)
    longest = max(segs, key=lambda s: s.length)
    if total < 180 or longest.length < 90 or len(ru) > 22:
        continue
    pt = longest.interpolate(0.5, normalized=True)
    a = longest.interpolate(max(0, 0.5 - 12 / longest.length), normalized=True)
    b = longest.interpolate(min(1, 0.5 + 12 / longest.length), normalized=True)
    ang = math.degrees(math.atan2(b.y - a.y, b.x - a.x))
    if ang > 90:
        ang -= 180
    if ang < -90:
        ang += 180
    avenues.append({"ru": short(ru), "kk": short(kk), "x": round(pt.x / W * 100, 2), "y": round(pt.y / H * 100, 2), "a": round(ang, 1), "len": round(total)})
avenues.sort(key=lambda v: -v["len"])
avenues = avenues[:18]

districts = []
for el in load("places"):
    t = el.get("tags", {})
    if t.get("admin_level") == "9" and el.get("center"):
        x, y = P(el["center"]["lon"], el["center"]["lat"])
        if 40 < x < W - 40 and 40 < y < H - 40:
            districts.append({"ru": t.get("name:ru") or t.get("name"), "kk": t.get("name:kk") or t.get("name"), "x": round(x / W * 100, 2), "y": round(y / H * 100, 2)})

LANDMARKS = [
    # (id, ru, kk, lat, lon) — OSM points where the pull had them; the hotel by its address, Dostyk 52.
    ("tower", "Кок-Тобе", "Көк-Төбе", 43.2287, 76.9763),
    ("hotel", "Гостиница «Казахстан»", "«Қазақстан» қонақүйі", 43.2449, 76.9566),
    ("bazaar", "Зелёный базар", "Көк базар", 43.2637, 76.9549),
    ("cathedral", "Парк 28 панфиловцев", "28 панфиловшылар саябағы", 43.2588, 76.9531),
    ("square", "Площадь Республики", "Республика алаңы", 43.2384, 76.9451),
]
landmarks = []
for k, ru, kk, lat, lon in LANDMARKS:
    x, y = P(lon, lat)
    landmarks.append({"k": k, "ru": ru, "kk": kk, "x": round(x / W * 100, 2), "y": round(y / H * 100, 2)})
NEIGHBOURHOODS = [("Коктем", "Көктем", 43.2308, 76.9209), ("Горный Гигант", "Горный Гигант", 43.2162, 76.9497), ("Тау-Самал", "Тау-Самал", 43.1962, 76.9718),
                  ("Каменское плато", "Каменское плато", 43.1873, 76.9621), ("Орбита", "Орбита", 43.1986, 76.881), ("Тастак", "Тастақ", 43.2515, 76.876),
                  ("Малая станица", "Кіші станица", 43.2824, 76.9766), ("Аскартау", "Асқартау", 43.2016, 76.936)]
for ru, kk, lat, lon in NEIGHBOURHOODS:
    x, y = P(lon, lat)
    districts.append({"ru": ru, "kk": kk, "x": round(x / W * 100, 2), "y": round(y / H * 100, 2)})

plan = {
    "frame": F, "width": W, "height": round(H, 1), "aspect": round(W / H, 4),
    "avenues": avenues, "districts": districts, "landmarks": landmarks, "contours": labels_contour[:10],
    "credit": "© OpenStreetMap contributors; relief: AWS Terrain Tiles",
}
with open(os.path.join(ROOT, "src", "lib", "almatyPlan.generated.json"), "w", encoding="utf8") as f:
    json.dump(plan, f, ensure_ascii=False, indent=1)

sizes = {n: os.path.getsize(os.path.join(OUT, n)) // 1024 for n in os.listdir(OUT)}
print("plan", round(W), "x", round(H, 1), "sizes KB", sizes)
print("counts", {k: len(v) for k, v in roads.items()}, {k: len(v) for k, v in L.items()}, "buildings", len(buildings), "contours", {k: len(v) for k, v in contours.items()})
print("avenues", [a["ru"] for a in avenues])
print("districts", [d["ru"] for d in districts])
print("elevation", round(float(dem.min())), round(float(dem.max())))
