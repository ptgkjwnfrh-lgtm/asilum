#!/usr/bin/env python3
# scripts/fetch-paris-roads.py — build public/paris-roads.json from REAL
# OpenStreetMap data (© OpenStreetMap contributors, ODbL). The passport
# hologram (redesign/passport-uv) renders this file; nothing in it is drawn
# by hand. Re-run to refresh. Requires network; no external packages.
#
# Layers fetched around Paris centre (48.8566, 2.3522):
#   major:     motorway/trunk/primary within 31 km (fills passport-scale
#              screens edge to edge — upload-station r5 warp landing)
#   secondary: secondary within 22 km
#   minor:     tertiary + residential-grade within 4.6 km (full city core)
#   buildings: building footprints within 1.2 km
# The viewBox stays 1420x1000: the passport document still crops to the
# same frame; the wider tiers only exist for full-screen renderings.
# Stars: junction clusters in the full-detail core where >= 5 road arms
# genuinely meet (roundabout plazas like l'Étoile collapse to one cluster).

import json, math, sys, time, urllib.request

CENTER = (48.8566, 2.3522)
W, H = 1420, 1000
M_PER_PX = 15.5  # ~22 km across the viewBox
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

def overpass(query):
    body = ("data=" + urllib.parse.quote("[out:json][timeout:300];" + query)).encode()
    last = None
    for url in MIRRORS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=body, headers={
                    "User-Agent": "asilum-passport-hologram/1.0"})
                with urllib.request.urlopen(req, timeout=360) as r:
                    return json.load(r)
            except Exception as e:
                last = e
                print(f"  retry ({url}): {e}", file=sys.stderr)
                time.sleep(8)
    raise SystemExit(f"overpass unreachable: {last}")

LAT0, LON0 = CENTER
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110574.0

def project(lat, lon):
    return ((lon - LON0) * KX / M_PER_PX + W / 2,
            -(lat - LAT0) * KY / M_PER_PX + H / 2)

def dp(points, eps):
    # Douglas-Peucker simplification.
    if len(points) < 3:
        return points
    ax, ay = points[0]; bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    norm = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, -1.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dx * (ay - py) - dy * (ax - px)) / norm
        if d > dmax:
            imax, dmax = i, d
    if dmax > eps:
        left = dp(points[:imax + 1], eps)
        return left[:-1] + dp(points[imax:], eps)
    return [points[0], points[-1]]

# wide tiers keep everything a passport-scale screen can show (desktop,
# ultrawide, tall phones); core tiers keep the old tight crop
ROAD_BOUNDS = (-900, W + 900, -700, H + 600)
CORE_BOUNDS = (-80, W + 80, -80, H + 80)

def path_of(ways_geom, eps, closed=False, bounds=CORE_BOUNDS):
    x0, x1, y0, y1 = bounds
    parts, pts_total = [], 0
    for geom in ways_geom:
        pts = [project(g["lat"], g["lon"]) for g in geom]
        pts = [(x, y) for x, y in pts if x0 <= x <= x1 and y0 <= y <= y1] \
            if not closed else pts
        if len(pts) < 2:
            continue
        pts = dp(pts, eps)
        if len(pts) < 2:
            continue
        d = f"M{pts[0][0]:.0f} {pts[0][1]:.0f}"
        for x, y in pts[1:]:
            d += f"L{x:.0f} {y:.0f}"
        if closed:
            d += "Z"
        parts.append(d)
        pts_total += len(pts)
    return "".join(parts), pts_total

print("fetching major roads…", file=sys.stderr)
major = overpass('way["highway"~"^(motorway|trunk|primary)$"](around:31000,%f,%f);out geom qt;' % CENTER)
print("fetching secondary…", file=sys.stderr)
second = overpass('way["highway"="secondary"](around:22000,%f,%f);out geom qt;' % CENTER)
print("fetching core streets (with node refs)…", file=sys.stderr)
core = overpass('way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)$"](around:4600,%f,%f);out body qt;>;out skel qt;' % CENTER)
print("fetching buildings…", file=sys.stderr)
blds = overpass('way["building"](around:1200,%f,%f);out geom qt;' % CENTER)

major_path, n1 = path_of([w["geometry"] for w in major["elements"] if "geometry" in w], 1.6, bounds=ROAD_BOUNDS)
second_path, n2 = path_of([w["geometry"] for w in second["elements"] if "geometry" in w], 1.4, bounds=ROAD_BOUNDS)

nodes = {e["id"]: (e["lat"], e["lon"]) for e in core["elements"] if e["type"] == "node"}
core_ways = [e for e in core["elements"] if e["type"] == "way"]
minor_geoms = []
for wy in core_ways:
    cls = wy.get("tags", {}).get("highway", "")
    if cls in ("motorway", "trunk", "primary", "secondary"):
        continue  # already drawn by the wide tiers
    geom = [{"lat": nodes[n][0], "lon": nodes[n][1]} for n in wy["nodes"] if n in nodes]
    minor_geoms.append(geom)
minor_path, n3 = path_of(minor_geoms, 1.0)

bld_path, n4 = path_of([w["geometry"] for w in blds["elements"] if "geometry" in w], 0.9, closed=True)

# ---- 5+-arm junction clusters (real graph degree) ----
arms = {}
use = {}
for wy in core_ways:
    nds = [n for n in wy["nodes"] if n in nodes]
    for i, n in enumerate(nds):
        arms[n] = arms.get(n, 0) + (1 if i in (0, len(nds) - 1) else 2)
        use[n] = use.get(n, 0) + 1
junction = {n for n, u in use.items() if u >= 2}

CELL = 60.0 / M_PER_PX  # cluster radius ~60 m
grid = {}
for n in junction:
    x, y = project(*nodes[n])
    grid.setdefault((int(x / CELL), int(y / CELL)), []).append(n)

seen, clusters = set(), []
for key, members in grid.items():
    if key in seen:
        continue
    stack, cl = [key], []
    while stack:
        k = stack.pop()
        if k in seen or k not in grid:
            continue
        seen.add(k)
        cl.extend(grid[k])
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nk = (k[0] + dx, k[1] + dy)
                if nk in grid and nk not in seen:
                    stack.append(nk)
    clusters.append(set(cl))

cluster_of = {}
for ci, cl in enumerate(clusters):
    for n in cl:
        cluster_of[n] = ci
internal = [0] * len(clusters)
for wy in core_ways:
    nds = [n for n in wy["nodes"] if n in nodes]
    for a, b in zip(nds, nds[1:]):
        ca, cb = cluster_of.get(a), cluster_of.get(b)
        if ca is not None and ca == cb:
            internal[ca] += 1

stars = []
for ci, cl in enumerate(clusters):
    total = sum(arms.get(n, 0) for n in cl) - 2 * internal[ci]
    if total >= 5:
        xs = [project(*nodes[n]) for n in cl]
        x = sum(p[0] for p in xs) / len(xs)
        y = sum(p[1] for p in xs) / len(xs)
        if 0 <= x <= W and 0 <= y <= H:
            stars.append((round(x), round(y), total))

# Dense city = many honest 5-ways; keep the strongest if it gets silly.
stars.sort(key=lambda s: -s[2])
if len(stars) > 220:
    stars = [s for s in stars if s[2] >= 6][:220]

out = {
    "attribution": "map data (c) OpenStreetMap contributors (ODbL)",
    "generated": time.strftime("%Y-%m-%d"),
    "center": CENTER, "mPerPx": M_PER_PX, "w": W, "h": H,
    "major": major_path, "secondary": second_path,
    "minor": minor_path, "buildings": bld_path,
    "stars": [[s[0], s[1]] for s in stars],
}
dest = "public/paris-roads.json"
with open(dest, "w") as f:
    json.dump(out, f, separators=(",", ":"))
size = len(json.dumps(out)) // 1024
print(f"wrote {dest}: {size} KiB — pts major/sec/minor/bld = {n1}/{n2}/{n3}/{n4}, stars = {len(stars)}", file=sys.stderr)
