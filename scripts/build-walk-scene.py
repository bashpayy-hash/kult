"""Scene data for the 3D walk through central Almaty (src/components/CityWalk.tsx).

14 Nov 2026, owner: «иммерзнуться именно в сам город… ретро-стиль… пару улиц
сделать и там гулять». Builds public/maps/almaty/walk.json from the OSM pull
(design/map-source/walk-*.json, roads.json, land.json; © OpenStreetMap
contributors, ODbL) and the elevation tiles (design/map-source/dem/, AWS
Terrain Tiles): building footprints with heights and colours, streets, parks,
rivers, trees, three walking routes and the mountains to the south.

Units are metres around the origin; x grows east, z grows south.
Run: python3 scripts/build-walk-scene.py
"""
import base64
import json
import math
import os
import re
from collections import defaultdict

import numpy as np
from PIL import Image
from shapely.geometry import LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import linemerge, unary_union
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design", "map-source")
OUT = os.path.join(ROOT, "public", "maps", "almaty", "walk.json")
LAT0, LON0 = 43.249, 76.947
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
AREA = box(-1700, -2200, 1700, 2200)  # the walk's square, metres
CORE = box(-1450, -1950, 1450, 1950)


def P(lon, lat):
    return ((lon - LON0) * KX, (LAT0 - lat) * KZ)


def load(name):
    with open(os.path.join(SRC, f"{name}.json"), encoding="utf8") as f:
        return json.load(f)["elements"]


def flat(coords, nd=1):
    out = []
    for x, z in coords:
        out += [round(x, nd), round(z, nd)]
    return out


def num(v):
    if v is None:
        return None
    m = re.match(r"\s*(-?[\d.]+)", str(v).replace(",", "."))
    return float(m.group(1)) if m else None


def hsh(s):
    h = 2166136261
    for ch in str(s):
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


# ── Buildings ──────────────────────────────────────────────────────────────
def outer_rings(members):
    segs = [[P(g["lon"], g["lat"]) for g in m["geometry"]] for m in members if m.get("type") == "way" and m.get("geometry") and m.get("role", "outer") == "outer"]
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


items = []
for el in load("walk-buildings"):
    t = el.get("tags", {})
    rings = outer_rings(el.get("members", [])) if el["type"] == "relation" else ([[P(g["lon"], g["lat"]) for g in el["geometry"]]] if el.get("geometry") else [])
    for r in rings:
        try:
            pg = Polygon(r)
            if not pg.is_valid:
                pg = pg.buffer(0)
        except Exception:
            continue
        if pg.is_empty or pg.area < 12:
            continue
        pg = pg.intersection(AREA)
        for g in ([pg] if pg.geom_type == "Polygon" else [x for x in getattr(pg, "geoms", []) if x.geom_type == "Polygon"]):
            if g.area >= 12:
                items.append((g, t))

# An outline that holds building:parts is drawn by its parts.
parts = [(g, t) for g, t in items if t.get("building:part") and not t.get("building")]
tree = STRtree([g for g, _ in parts]) if parts else None
kept = []
for g, t in items:
    if t.get("building") and tree is not None:
        hits = tree.query(g)
        if any(g.contains(parts[i][0].representative_point()) for i in hits):
            continue
    kept.append((g, t))

CATHEDRAL = Point(*P(76.9531, 43.2588))
BAZAAR = Point(*P(76.9549, 43.2637))
PAL = ["#e8d4ad", "#dcab66", "#b9c1dc", "#efe5cf", "#c47a52", "#bcc59f"]
buildings = []
for g, t in kept:
    h = num(t.get("height"))
    lv = num(t.get("building:levels"))
    mh = num(t.get("min_height")) or ((num(t.get("building:min_level")) or 0) * 3.2)
    kind = t.get("building") or t.get("building:part") or "yes"
    if h is None:
        if lv:
            h = lv * 3.2 + (1.5 if lv > 2 else 0.8)
        else:
            a = g.area
            h = 3.5 if a < 60 or kind in ("garage", "garages", "shed", "kiosk", "roof") else 6.5 if a < 220 else 10 if a < 650 else 15.5 if a < 2200 else 18.5
    h = max(h, mh + 2.5)
    name = t.get("name", "") + " " + t.get("name:ru", "")
    flag = 0
    if g.contains(CATHEDRAL):
        flag = 2
    elif g.contains(BAZAAR) and g.area > 2000:
        flag = 3
    if flag:
        pass
    elif "Қазақстан Қонақ" in name or "гостиница Казахстан" in name.lower() or ("Казахстан" in name and "остиниц" in name):
        flag = 1
    elif "Вознесенск" in name or ("собор" in name.lower() and "Вознесен" in name):
        flag = 2
    elif "Көк Базар" in name or "Зелёный базар" in name or "Зеленый базар" in name:
        flag = 3
    seed = hsh(f"{g.centroid.x:.0f}{g.centroid.y:.0f}")
    if flag == 2:
        c = 3
    elif flag == 3:
        c = 5
    elif h > 24:
        c = [0, 2, 3, 3, 0][seed % 5]
    else:
        c = [0, 1, 1, 3, 4, 5, 0, 2][seed % 8]
    s = g.simplify(0.35, preserve_topology=True)
    ring = list(s.exterior.coords)[:-1]
    if len(ring) < 3:
        continue
    buildings.append([round(h, 1), round(mh, 1), c, flag] + flat(ring))

# ── Streets, parks, water ──────────────────────────────────────────────────
CLS = {"motorway": 0, "trunk": 0, "primary": 0, "secondary": 1, "tertiary": 2, "unclassified": 2, "residential": 3, "living_street": 3, "pedestrian": 4,
       "primary_link": 0, "secondary_link": 1, "tertiary_link": 2}
roads = []
named = defaultdict(list)
for el in load("roads"):
    t = el.get("tags", {})
    c = CLS.get(t.get("highway"))
    if c is None or not el.get("geometry"):
        continue
    ls = LineString([P(p["lon"], p["lat"]) for p in el["geometry"]]).intersection(AREA.buffer(150))
    for part in ([ls] if ls.geom_type == "LineString" else [x for x in getattr(ls, "geoms", []) if x.geom_type == "LineString"]):
        if part.length < 4:
            continue
        roads.append([c] + flat(part.simplify(0.6).coords))
        nm = t.get("name:ru") or t.get("name") or ""
        named[(nm, t.get("highway"))].append(part)

parks, rivers = [], []
for el in load("land"):
    t = el.get("tags", {})
    g = el.get("geometry")
    if not g:
        continue
    pts = [P(p["lon"], p["lat"]) for p in g if p]
    if t.get("waterway") in ("river", "canal", "stream"):
        ls = LineString(pts).intersection(AREA.buffer(300))
        for part in ([ls] if ls.geom_type == "LineString" else [x for x in getattr(ls, "geoms", []) if x.geom_type == "LineString"]):
            if part.length > 10:
                rivers.append([1 if t["waterway"] == "stream" else 2] + flat(part.simplify(1).coords))
    elif t.get("leisure") in ("park", "garden") or t.get("landuse") in ("grass", "forest", "meadow", "recreation_ground") or t.get("natural") == "wood":
        if len(pts) < 4:
            continue
        try:
            pg = Polygon(pts)
            if not pg.is_valid:
                pg = pg.buffer(0)
            pg = pg.intersection(AREA)
        except Exception:
            continue
        for x in ([pg] if pg.geom_type == "Polygon" else [y for y in getattr(pg, "geoms", []) if y.geom_type == "Polygon"]):
            if x.area > 150:
                parks.append(flat(list(x.simplify(1).exterior.coords)[:-1]))

# ── Trees: the mapped ones, rows along streets, and the parks' own ─────────
rng = np.random.default_rng(7)
trees = []
for el in load("walk-trees"):
    if el["type"] == "node":
        x, z = P(el["lon"], el["lat"])
        trees.append((x, z))
    elif el.get("geometry"):
        ls = LineString([P(p["lon"], p["lat"]) for p in el["geometry"]])
        n = max(1, int(ls.length / 7))
        for i in range(n + 1):
            q = ls.interpolate(i / n, normalized=True)
            trees.append((q.x, q.y))
park_polys = [Polygon(list(zip(p[0::2], p[1::2]))) for p in parks]
for pg in park_polys:
    n = min(260, int(pg.area / 180))
    minx, miny, maxx, maxy = pg.bounds
    got = 0
    for _ in range(n * 4):
        if got >= n:
            break
        x, z = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
        if pg.contains(Point(x, z)):
            trees.append((x, z))
            got += 1
# Almaty's aryk rows: both sides of residential and tertiary streets, where nothing was mapped.
WIDTH = {0: 26, 1: 19, 2: 14, 3: 9, 4: 10}
for r in roads:
    c = r[0]
    if c not in (1, 2, 3):
        continue
    ls = LineString(list(zip(r[1::2], r[2::2])))
    if ls.length < 30:
        continue
    for side in (1, -1):
        try:
            off = ls.offset_curve(side * (WIDTH[c] / 2 + 2.2))
        except Exception:
            continue
        if off.is_empty or off.geom_type != "LineString":
            continue
        n = int(off.length / 11)
        for i in range(1, n):
            q = off.interpolate(i * 11 + rng.uniform(-2, 2))
            trees.append((q.x, q.y))
trees = [(x, z) for x, z in trees if CORE.contains(Point(x, z))]
btree = STRtree([g for g, _ in kept])
geoms = [g for g, _ in kept]


def in_building(pt, pad=0.0):
    probe = pt.buffer(pad) if pad else pt
    return any(geoms[i].intersects(probe) if pad else geoms[i].contains(pt) for i in btree.query(probe))

# ── Walking routes ─────────────────────────────────────────────────────────
def route(names, hw, keep_box=None, offset=0.0):
    parts_ = []
    for (nm, h), segs in named.items():
        if h in hw and any(n in nm for n in names):
            parts_ += segs
    if not parts_:
        return None
    u = unary_union(parts_)
    m = linemerge(u) if u.geom_type == "MultiLineString" else u
    segs = [m] if m.geom_type == "LineString" else list(m.geoms)
    if keep_box is not None:
        segs = [s.intersection(keep_box) for s in segs]
        segs = [x for s in segs for x in ([s] if s.geom_type == "LineString" else [y for y in getattr(s, "geoms", []) if y.geom_type == "LineString"])]
    if not segs:
        return None
    ls = max(segs, key=lambda s: s.length)
    if offset:
        o = ls.offset_curve(offset)
        if o.geom_type == "LineString" and not o.is_empty:
            ls = o
    return ls


def walk_box(lat_s, lon_w, lat_n, lon_e):
    x0, z1 = P(lon_w, lat_s)
    x1, z0 = P(lon_e, lat_n)
    return box(x0, z0, x1, z1)


ROUTES = [
    ("arbat", "Арбат", "Арбат", route(["Жибек Жолы", "Жібек Жолы"], ("pedestrian",), walk_box(43.255, 76.93, 43.266, 76.96))),
    ("panfilov", "Панфилова", "Панфилов", route(["Панфилова", "Панфилов"], ("pedestrian", "living_street"), walk_box(43.245, 76.93, 43.266, 76.96))),
    ("dostyk", "Достык", "Достық", route(["Достык", "Достық"], ("primary", "secondary"), walk_box(43.231, 76.95, 43.2475, 76.965), offset=15)),
]
routes = []
route_lines = []
lamps = []
for rid, ru, kk, ls in ROUTES:
    if ls is None or ls.length < 150:
        print("route missing:", rid)
        continue
    n = int(ls.length / 4)
    pts = [ls.interpolate(i / n, normalized=True) for i in range(n + 1)]
    # Dostyk walks south, towards the mountains; the others walk north.
    flipped = (rid == "dostyk") == (pts[0].y > pts[-1].y)
    if flipped:
        pts = pts[::-1]
    # Dostyk is walked on its sidewalk, 15 m left of the carriageway's line:
    # "road" says on which hand of the walker the carriageway lies (+1 left).
    road = 0 if rid != "dostyk" else (1 if flipped else -1)
    routes.append({"id": rid, "ru": ru, "kk": kk, "len": round(ls.length), "road": road, "p": flat([(q.x, q.y) for q in pts])})
    route_lines.append(ls)
    # Retro lamp posts: both sides of the two pedestrian streets, the road side of Dostyk.
    step, sides = (19, (4.6, -4.6)) if rid != "dostyk" else (27, (-5.2,))
    for side in sides:
        try:
            off = ls.offset_curve(side)
        except Exception:
            continue
        if off.is_empty or off.geom_type != "LineString":
            continue
        k = int(off.length / step)
        for i in range(1, k):
            q = off.interpolate(i * step + (step / 2 if side < 0 else 0))
            if not in_building(q, 0.8):
                lamps += [round(q.x, 1), round(q.y, 1)]

# ── The street's furniture: 1980s Alma-Ata with today's café life ──────────
# 14 Nov 2026, owner: «keep the old 80s almaty warm nostalgic aesthetic but
# with modern elements». Retro: shop lettering, rooftop letters, mosaic
# panels, a kvass barrel, a fountain, benches, pastel Zhigulis and Volgas.
# Today: café terraces under umbrellas (string lights and glass towers are
# drawn by the browser).
SHOP_WORDS = ["КНИГИ", "ГАСТРОНОМ", "ЦВЕТЫ", "КУЛИНАРИЯ", "ЧАСЫ", "ОДЕЖДА", "КАФЕ", "СУВЕНИРЫ", "ФОТО", "ОБУВЬ"]
ROOF_WORDS = ["АЛМА-АТА", "ҚОШ КЕЛДІҢІЗ", "ДОБРО ПОЖАЛОВАТЬ"]
route_by_id = {rid: ls for (rid, _, _, ls) in ROUTES if ls is not None and ls.length >= 150}
signs, mosaics, roof_signs, props = [], [], [], []
taken = [(Point(lamps[i], lamps[i + 1]), 0.4) for i in range(0, len(lamps), 2)]  # what is placed, kept apart


def free(pt, r):
    return not in_building(pt, r) and all(pt.distance(p) > r + rr for p, rr in taken)


def place(kind, x, z, yaw, r):
    pt = Point(x, z)
    if not free(pt, r):
        return False
    taken.append((pt, r))
    props.append([kind, round(x, 1), round(z, 1), round(yaw, 2)])
    return True


# Walls facing a walk: shop lettering over the awnings, mosaics higher up.
walk_lines = unary_union(list(route_by_id.values()))
cands = []
for g, t in kept:
    if g.distance(walk_lines) > 32:
        continue
    pg = orient(g.simplify(0.35, preserve_topology=True), sign=1.0)
    hb = num(t.get("height")) or ((num(t.get("building:levels")) or 0) * 3.2 + 1.5) or 0
    ring = list(pg.exterior.coords)[:-1]
    for i in range(len(ring)):
        (ax, az), (bx, bz) = ring[i], ring[(i + 1) % len(ring)]
        L = math.hypot(bx - ax, bz - az)
        if L < 7:
            continue
        nx, nz = (bz - az) / L, -(bx - ax) / L
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        near = walk_lines.interpolate(walk_lines.project(Point(mx, mz))) if walk_lines.geom_type == "LineString" else min((l.interpolate(l.project(Point(mx, mz))) for l in walk_lines.geoms), key=lambda q: q.distance(Point(mx, mz)))
        dx, dz = near.x - mx, near.y - mz
        dist = math.hypot(dx, dz) or 1
        facing = (nx * dx + nz * dz) / dist
        if facing > 0.55 and dist < 30:
            cands.append((L, hb, ax, az, bx, bz, nx, nz, dist))
for L, hb, ax, az, bx, bz, nx, nz, dist in cands:
    if hb < 6.5:
        continue
    # One shop every ~14 m of a long facade; most of them lettered.
    n = max(1, int(L // 14))
    for k in range(n):
        seed = hsh(f"{ax:.0f}{az:.0f}{k}")
        if seed % 5 >= 3:
            continue
        word = SHOP_WORDS[seed % len(SHOP_WORDS)]
        w = min(L / n * 0.75, 1.6 + len(word) * 0.62)
        c = (k + 0.5) / n
        f0, f1 = c - w / L / 2, c + w / L / 2
        signs.append([round(ax + (bx - ax) * f0, 2), round(az + (bz - az) * f0, 2), round(ax + (bx - ax) * f1, 2), round(az + (bz - az) * f1, 2), SHOP_WORDS.index(word)])
# Mosaics: the longest tall walls that look at each walk, at most two a walk.
for rid, ls in route_by_id.items():
    best = sorted([c for c in cands if c[0] > 13 and c[1] > 13 and Point((c[2] + c[4]) / 2, (c[3] + c[5]) / 2).distance(ls) < 34], key=lambda c: -c[0])
    for L, hb, ax, az, bx, bz, nx, nz, dist in best[:2]:
        w = min(L * 0.72, 12.0)
        hgt = min(w * 0.78, hb - 6.2)
        if hgt < 4:
            continue
        f0, f1 = 0.5 - w / L / 2, 0.5 + w / L / 2
        mosaics.append([round(ax + (bx - ax) * f0, 2), round(az + (bz - az) * f0, 2), round(ax + (bx - ax) * f1, 2), round(az + (bz - az) * f1, 2), 5.6, round(5.6 + hgt, 1), len(mosaics) % 3])

# Rooftop letters on the tallest mid-rise roof near each walk.
for k, (rid, ls) in enumerate(route_by_id.items()):
    best = None
    for g, t in kept:
        hb = num(t.get("height")) or ((num(t.get("building:levels")) or 0) * 3.2 + 1.5)
        if not hb or not (16 <= hb <= 48) or g.area < 500:
            continue
        d = g.distance(ls)
        if 10 < d < 160 and (best is None or hb > best[0]):
            best = (hb, g)
    if best:
        hb, g = best
        c = g.centroid
        mid = ls.interpolate(0.5, normalized=True)
        yaw = math.atan2(mid.x - c.x, mid.y - c.y)
        minx, miny, maxx, maxy = g.bounds
        roof_signs.append([round(c.x, 1), round(c.y, 1), round(hb, 1), round(yaw, 3), round(min(26.0, max(12.0, 0.8 * min(maxx - minx, maxy - miny))), 1), k % len(ROOF_WORDS)])

# Benches between the lamps; café terraces; a kvass barrel and a fountain on Arbat.
for rid, ls in route_by_id.items():
    if rid == "dostyk":
        continue
    for side in (3.3, -3.3):
        off = ls.offset_curve(side)
        if off.is_empty or off.geom_type != "LineString":
            continue
        for i in range(1, int(off.length / 19)):
            q, q2 = off.interpolate(i * 19 + 5), off.interpolate(i * 19 + 6)
            yaw = math.atan2(q2.x - q.x, q2.y - q.y) + (math.pi / 2 if side > 0 else -math.pi / 2)
            place(3, q.x, q.y, yaw, 1.0)
    for side in (8.0, -8.0):
        off = ls.offset_curve(side)
        if off.is_empty or off.geom_type != "LineString":
            continue
        s = 12.0
        while s < off.length - 12:
            if hsh(f"{rid}{side}{int(s)}") % 3 == 0:
                for j in range(3):
                    q = off.interpolate(s + j * 3.4)
                    place(0, q.x, q.y, (hsh(f"{q.x:.0f}") % 628) / 100, 1.5)
                s += 24
            else:
                s += 11
arb = route_by_id.get("arbat")
if arb is not None:
    # The first free spot beside the walk (never on the walking line itself).
    for kind, r, fracs in ((2, 1.4, [0.12 + 0.04 * i for i in range(12)]), (4, 3.2, [0.6 + 0.04 * i for i in range(8)])):
        done = False
        for frac in fracs:
            for side in (5.0, -5.0, 7.5, -7.5):
                q = arb.offset_curve(side).interpolate(frac, normalized=True)
                q2 = arb.interpolate(min(1, frac + 0.01), normalized=True)
                if place(kind, q.x, q.y, math.atan2(q2.x - q.x, q2.y - q.y), r):
                    done = True
                    break
            if done:
                break
# Parked Zhigulis and Volgas on Dostyk's kerb.
dos = route_by_id.get("dostyk")
if dos is not None:
    off = dos.offset_curve(-7.4)
    if not off.is_empty and off.geom_type == "LineString":
        s = 8.0
        while s < off.length - 8:
            q, q2 = off.interpolate(s), off.interpolate(s + 1)
            if hsh(f"car{int(s)}") % 5 < 2:
                place(1, q.x, q.y, math.atan2(q2.x - q.x, q2.y - q.y), 2.3)
            s += 6.2

# Trees: not inside buildings, not on the walking line itself.
paths = unary_union([l.buffer(3.6) for l in route_lines]) if route_lines else None
TX = np.array([p.x for p, _ in taken]); TZ = np.array([p.y for p, _ in taken]); TR = np.array([r for _, r in taken])
clear = []
for x, z in trees:
    pt = Point(x, z)
    if in_building(pt) or (paths is not None and paths.contains(pt)):
        continue
    if len(TX) and np.any((TX - x) ** 2 + (TZ - z) ** 2 < (TR + 1.6) ** 2):
        continue
    clear.append((x, z))
rng.shuffle(clear)
clear = clear[:11000]
tree_flat = []
for x, z in clear:
    s = hsh(f"{x:.0f}{z:.0f}")
    tree_flat += [round(x, 1), round(z, 1), s % 4]  # 0–2 round crowns, 3 a poplar

# ── Mountains from the elevation tiles ─────────────────────────────────────
tiles = {}
for fn in os.listdir(os.path.join(SRC, "dem")):
    m = re.match(r"(\d+)_(\d+)_(\d+)\.png", fn)
    if m:
        _, x, y = map(int, m.groups())
        tiles[(x, y)] = os.path.join(SRC, "dem", fn)
xs = sorted({k[0] for k in tiles})
ys = sorted({k[1] for k in tiles})
dem = np.zeros((len(ys) * 256, len(xs) * 256), dtype=np.float32)
for (x, y), fn in tiles.items():
    a = np.asarray(Image.open(fn).convert("RGB")).astype(np.float32)
    dem[(y - ys[0]) * 256:(y - ys[0] + 1) * 256, (x - xs[0]) * 256:(x - xs[0] + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
N = 2 ** 13


def elev(lon, lat):
    gx = (lon + 180) / 360 * N * 256 - xs[0] * 256
    r = np.radians(lat)
    gy = (1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * N * 256 - ys[0] * 256
    x0 = np.clip(np.floor(gx).astype(int), 0, dem.shape[1] - 2)
    y0 = np.clip(np.floor(gy).astype(int), 0, dem.shape[0] - 2)
    fx, fy = gx - x0, gy - y0
    return dem[y0, x0] * (1 - fx) * (1 - fy) + dem[y0, x0 + 1] * fx * (1 - fy) + dem[y0 + 1, x0] * (1 - fx) * fy + dem[y0 + 1, x0 + 1] * fx * fy


E0 = float(elev(np.array([LON0]), np.array([LAT0]))[0])
GW, GH = 220, 150
lons = np.linspace(76.80, 77.10, GW)
lats = np.linspace(43.30, 43.12, GH)
LO, LA = np.meshgrid(lons, lats)
H = elev(LO, LA) - E0
# The city floor stays flat around the walk; the ground rises outside it.
gx, gz = (LO - LON0) * KX, (LAT0 - LA) * KZ
d = np.maximum(np.abs(gx) / 1900, np.abs(gz) / 2400)
fade = np.clip((d - 1.0) / 0.25, 0, 1)
H = np.maximum(H, 0) * fade - 1.5
hm = np.round(H).astype(np.int16)
kx, kz = P(76.9763, 43.2287)
k_ground = float(elev(np.array([76.9763]), np.array([43.2287]))[0]) - E0

scene = {
    "origin": [LAT0, LON0], "k": [round(KX, 3), KZ], "pal": PAL,
    "b": buildings, "r": roads, "g": parks, "w": rivers, "t": tree_flat, "routes": routes, "lamps": lamps,
    "signs": signs, "mosaics": mosaics, "roofSigns": roof_signs, "props": props, "words": SHOP_WORDS, "roofWords": ROOF_WORDS,
    "dem": {"w": GW, "h": GH, "x0": round(float(gx[0, 0]), 1), "z0": round(float(gz[0, 0]), 1), "x1": round(float(gx[-1, -1]), 1), "z1": round(float(gz[-1, -1]), 1), "data": base64.b64encode(hm.tobytes()).decode()},
    "kokTobe": [round(kx, 1), round(kz, 1), round(k_ground, 1)],
    "credit": "© OpenStreetMap contributors; relief: AWS Terrain Tiles",
}
with open(OUT, "w", encoding="utf8") as f:
    json.dump(scene, f, separators=(",", ":"), ensure_ascii=False)
print("walk.json", os.path.getsize(OUT) // 1024, "KB;", len(buildings), "buildings,", len(roads), "roads,", len(parks), "parks,", len(clear), "trees,", [(r["id"], r["len"]) for r in routes], "E0", round(E0), "max h", int(hm.max()))
print("flags", {f: sum(1 for b in buildings if b[3] == f) for f in (1, 2, 3)}, "lamps", len(lamps) // 2, "signs", len(signs), "mosaics", len(mosaics), "roof", roof_signs, "props", {k: sum(1 for p in props if p[0] == k) for k in range(5)})
