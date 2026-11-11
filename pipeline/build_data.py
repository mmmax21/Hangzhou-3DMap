#!/usr/bin/env python3
"""阶段 2：地理数据管线。

输入：pipeline/cache/dem_N30_E120.tif（Copernicus GLO-30）、pipeline/cache/osm.json（Overpass）
输出（app/public/data/）：
  heightmap.png   1024x1024 16 位灰度，像素中心对齐范围（见 heightmap.json）
  heightmap.json  最低/最高海拔、水位、范围、编码说明
  water.geojson   水面多边形（WGS-84，已裁剪到范围）
  watermask.png   1024x1024 RGB：R=水面遮罩（抗锯齿），G=水内离岸距离，B=陆上离水距离
  buildings.json  建筑轮廓与高度（整数编码的经纬度，见文件内 encoding 字段）
  roads.json      主要道路折线（同样编码），夜晚灯带用
  landmarks.calibrated.json  OSM 校准后的景点坐标与所用 OSM 要素（供核对）

运行：python3 pipeline/build_data.py
依赖：numpy pillow scipy shapely tifffile imagecodecs
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString, MultiPolygon, Polygon, box, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
OUT = ROOT / "app" / "public" / "data"

# PRD 第 3 节范围（WGS-84），阶段 3 返工时缩小
WEST, EAST, SOUTH, NORTH = 120.100, 120.168, 30.215, 30.270
SIZE = 1024
# 山脊网络（PRD 6.3）：反转地形上做 D8 汇流累积，汇流大的地方就是原地形的山脊
RIDGE_SMOOTH = 2.5  # 提取前对高度图的高斯平滑（像素），去掉小起伏
RIDGE_MIN_RELIEF = 35.0  # 高出水位多少米以上才算山地
RIDGE_MIN_ACC = 500  # 汇流累积阈值（像素数），越大山脊越少
RIDGE_MIN_LEN = 30  # 删除短于此像素数的山脊碎段
RIDGE_DIST_MAX = 16.0  # 距离场编码上限（像素）
SUPER = 4  # 遮罩超采样倍数
LAKE_DEPTH_M = 1.5  # 湖底低于水位的深度（米）
LAND_MIN_ABOVE_WATER_M = 0.4  # 陆地最低比水位高多少（米）
SAME_LEVEL_TOL_M = 8.0  # 水体的低分位高程与西湖水位相差在此范围内才计入遮罩，并统一压平到西湖水位
LEVEL_PERCENTILE = 15  # DSM 在水边含树冠，用低分位数估计水体水位
BUILDING_DEFAULT_H = 12.0
LEVEL_H = 3.0
COORD_SCALE = 1e-6  # 整数编码的经纬度精度（约 0.1 米）
BBOX = box(WEST, SOUTH, EAST, NORTH)


# ---------------------------------------------------------------- 工具函数

def lnglat_to_px(lng, lat, n):
    """经纬度 -> 栅格像素坐标（像素中心在 (i+0.5)/n 处，与贴图 UV 一致）。"""
    x = (np.asarray(lng) - WEST) / (EAST - WEST) * n
    y = (NORTH - np.asarray(lat)) / (NORTH - SOUTH) * n
    return x, y


def grid_lnglat(n):
    t = (np.arange(n) + 0.5) / n
    lng = WEST + t * (EAST - WEST)
    lat = NORTH - t * (NORTH - SOUTH)
    return np.meshgrid(lng, lat)  # 行 = 纬度（北到南），列 = 经度（西到东）


def join_ways(ways):
    """把多段 way 的坐标首尾拼接成闭合环。ways: [[(lng,lat),...], ...]"""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s + cur[1:]
                elif s[0] == cur[0]:
                    cur = s[::-1] + cur[1:]
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(cur) >= 4 and cur[0] == cur[-1]:
            rings.append(cur)
    return rings


def way_coords(e):
    return [(p["lon"], p["lat"]) for p in e.get("geometry", []) if p]


def element_polygon(e):
    """way 或 multipolygon relation -> shapely (Multi)Polygon，失败返回 None。"""
    if e["type"] == "way":
        c = way_coords(e)
        if len(c) < 4 or c[0] != c[-1]:
            return None
        g = Polygon(c)
    elif e["type"] == "relation":
        outers = [way_coords(m) for m in e.get("members", []) if m.get("type") == "way" and m.get("role") in ("outer", "")]
        inners = [way_coords(m) for m in e.get("members", []) if m.get("type") == "way" and m.get("role") == "inner"]
        orings = [Polygon(r) for r in join_ways(outers)]
        irings = [Polygon(r) for r in join_ways(inners)]
        if not orings:
            return None
        g = unary_union([make_valid(p) for p in orings])
        if irings:
            g = g.difference(unary_union([make_valid(p) for p in irings]))
    else:
        return None
    if not g.is_valid:
        g = make_valid(g)
    g = g.intersection(BBOX)
    polys = [p for p in getattr(g, "geoms", [g]) if isinstance(p, Polygon) and not p.is_empty]
    if not polys:
        return None
    return polys[0] if len(polys) == 1 else MultiPolygon(polys)


def polygons_of(g):
    return [p for p in getattr(g, "geoms", [g]) if isinstance(p, Polygon)]


def rasterize(features, n):
    """features: [(geom, value)] 按顺序绘制。返回 n*n 的 uint8。"""
    img = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(img)
    for g, v in features:
        for p in polygons_of(g):
            x, y = lnglat_to_px(*np.array(p.exterior.coords).T, n)
            d.polygon(list(zip(x, y)), fill=v)
            for hole in p.interiors:
                hx, hy = lnglat_to_px(*np.array(hole.coords).T, n)
                d.polygon(list(zip(hx, hy)), fill=0 if v else 255)
    return np.array(img)


def enc(lng, lat):
    return round((lng - WEST) / COORD_SCALE), round((lat - SOUTH) / COORD_SCALE)


def parse_float(s):
    if s is None:
        return None
    m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)", str(s))
    return float(m.group(1)) if m else None


# ---------------------------------------------------------------- 读数据

def load_dem():
    t = tifffile.TiffFile(CACHE / "dem_N30_E120.tif")
    p = t.pages[0]
    sx, sy, _ = p.tags["ModelPixelScaleTag"].value
    _, _, _, lng0, lat0, _ = p.tags["ModelTiepointTag"].value
    dem = p.asarray().astype(np.float64)
    return dem, lng0, lat0, sx, sy


def sample_dem(dem, lng0, lat0, sx, sy, lng, lat):
    # GLO-30 的 tiepoint 是像素左上角，像素中心在 +0.5
    col = (lng - lng0) / sx - 0.5
    row = (lat0 - lat) / sy - 0.5
    return ndimage.map_coordinates(dem, [row, col], order=3, mode="nearest")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    osm = json.load(open(CACHE / "osm.json"))
    E = osm["elements"]
    by_id = {(e["type"], e["id"]): e for e in E}

    # ------------------------------------------------ DEM 预处理
    dem, lng0, lat0, sx, sy = load_dem()
    # 先在原分辨率上裁出带余量的窗口，做灰度开运算去掉建筑和树冠的小凸起
    c0 = int((WEST - 0.01 - lng0) / sx); c1 = int((EAST + 0.01 - lng0) / sx)
    r0 = int((lat0 - NORTH - 0.01) / sy); r1 = int((lat0 - SOUTH + 0.01) / sy)
    win = dem[r0:r1, c0:c1]
    # 山区只做轻度开运算保留山形；平原城区（DSM 含楼宇）用大窗口开运算把楼宇抹平
    light = ndimage.gaussian_filter(ndimage.grey_opening(win, size=(3, 3)), 0.8)
    strong = ndimage.gaussian_filter(ndimage.grey_opening(win, size=(9, 9)), 2.0)
    t = np.clip((strong - 25.0) / (70.0 - 25.0), 0, 1)
    t = t * t * (3 - 2 * t)
    opened = strong * (1 - t) + light * t
    dem_s = dem.copy()
    dem_s[r0:r1, c0:c1] = opened

    glng, glat = grid_lnglat(SIZE)
    h = sample_dem(dem_s, lng0, lat0, sx, sy, glng, glat)

    # ------------------------------------------------ 水系
    water_feats = []
    for e in E:
        t = e.get("tags", {})
        if t.get("natural") != "water" or e["type"] not in ("way", "relation"):
            continue
        g = element_polygon(e)
        if g is None or g.area <= 0:
            continue
        water_feats.append({"e": e, "g": g})
    water_feats.sort(key=lambda f: -f["g"].area)

    # 西湖主水面的水位：取西湖 relation 范围内 DEM 的中位数
    lake = next(f for f in water_feats if f["e"]["id"] == 2308774)
    lake_mask = rasterize([(lake["g"], 255)], SIZE) > 127
    water_level = float(np.median(h[lake_mask]))
    print(f"西湖水位（DEM 中位数）: {water_level:.2f} m")

    kept, dropped = [], []
    for f in water_feats:
        m = rasterize([(f["g"], 255)], SIZE) > 127
        lvl = float(np.percentile(h[m], LEVEL_PERCENTILE)) if m.any() else water_level
        f["level"] = lvl
        (kept if abs(lvl - water_level) <= SAME_LEVEL_TOL_M or not m.any() else dropped).append(f)
    for f in dropped:
        t = f["e"].get("tags", {})
        print(f"  跳过水位不一致的水体 {f['e']['type']}/{f['e']['id']} {t.get('name','')} 水位 {f['level']:.1f} m")
    # 较小的水体覆盖在较大水体上：岛内池塘需要 inner 被重新填回
    big = rasterize([(f["g"], 255) for f in kept], SIZE * SUPER)
    mask_img = Image.fromarray(big).resize((SIZE, SIZE), Image.BOX)
    mask = np.array(mask_img).astype(np.float64) / 255.0
    binm = mask > 0.5

    # water.geojson
    feats = []
    for f in kept:
        t = f["e"].get("tags", {})
        feats.append({
            "type": "Feature",
            "properties": {"osm": f"{f['e']['type']}/{f['e']['id']}", "name": t.get("name", ""),
                           "water": t.get("water", ""), "level_m": round(f["level"], 2)},
            "geometry": json.loads(json.dumps(mapping(f["g"].simplify(0.000005)), default=float)),
        })

    def round_coords(o):
        if isinstance(o, (list, tuple)):
            if o and isinstance(o[0], (int, float)):
                return [round(o[0], 6), round(o[1], 6)]
            return [round_coords(x) for x in o]
        return o

    for ft in feats:
        ft["geometry"]["coordinates"] = round_coords(ft["geometry"]["coordinates"])
    json.dump({"type": "FeatureCollection", "name": "water",
               "bbox": [WEST, SOUTH, EAST, NORTH], "features": feats},
              open(OUT / "water.geojson", "w"), ensure_ascii=False, separators=(",", ":"))

    # watermask.png：R 遮罩，G 水内离岸距离（0..1 对应 0..48 像素），B 陆上离水距离
    din = ndimage.distance_transform_edt(binm)
    dout = ndimage.distance_transform_edt(~binm)
    rgb = np.stack([
        mask * 255,
        np.clip(din / 48.0, 0, 1) * 255,
        np.clip(dout / 48.0, 0, 1) * 255,
    ], -1).round().astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(OUT / "watermask.png", optimize=True)

    # ------------------------------------------------ 地形：湖区压平
    hl = np.maximum(h, water_level + LAND_MIN_ABOVE_WATER_M)
    lake_floor = water_level - LAKE_DEPTH_M
    # 按抗锯齿遮罩在陆地与湖底之间过渡，岸线处轻微柔化
    soft = ndimage.gaussian_filter(mask, 0.7)
    hf = hl * (1 - soft) + lake_floor * soft
    hf = ndimage.gaussian_filter(hf, 0.6)
    hf[binm] = np.minimum(hf[binm], water_level - 0.3)

    hmin, hmax = float(hf.min()), float(hf.max())
    q = np.round((hf - hmin) / (hmax - hmin) * 65535).astype(np.uint16)
    Image.fromarray(q, mode="I;16").save(OUT / "heightmap.png", optimize=True)
    meta = {
        "source": "Copernicus GLO-30 DEM (DSM), grey-opened and smoothed; lakes flattened by watermask",
        "bbox": {"west": WEST, "south": SOUTH, "east": EAST, "north": NORTH},
        "size": SIZE,
        "pixelCenters": "pixel (i,j) center = (west + (i+0.5)/size*(east-west), north - (j+0.5)/size*(north-south)); row 0 = north",
        "encoding": "elevation_m = minElevation + value/65535*(maxElevation-minElevation)",
        "minElevation": round(hmin, 3),
        "maxElevation": round(hmax, 3),
        "waterLevel": round(water_level, 3),
        "lakeFloor": round(lake_floor, 3),
        "verticalDatum": "EGM2008",
    }
    json.dump(meta, open(OUT / "heightmap.json", "w"), ensure_ascii=False, indent=2)
    ridge_mask = ridges(hf, binm, water_level)
    print(f"高度图: {hmin:.1f} .. {hmax:.1f} m")

    # ------------------------------------------------ 建筑
    blds = []
    nolevel = 0
    for e in E:
        t = e.get("tags", {})
        if "building" not in t or t.get("building") == "no":
            continue
        g = element_polygon(e)
        if g is None:
            continue
        p = max(polygons_of(g), key=lambda p: p.area)
        if p.area < 1e-10:
            continue
        p = p.simplify(0.000003)
        if not BBOX.contains(p.centroid):
            continue
        hh = parse_float(t.get("height"))
        if hh is None:
            lv = parse_float(t.get("building:levels"))
            if lv is not None:
                hh = lv * LEVEL_H
        if hh is None:
            hh = BUILDING_DEFAULT_H
            nolevel += 1
        ring = list(p.exterior.coords)[:-1]
        flat = []
        for lng, lat in ring:
            flat += enc(lng, lat)
        blds.append([round(hh, 1)] + flat)
    json.dump({
        "encoding": "each item: [height_m, x0, y0, x1, y1, ...]; lng = origin[0] + x*scale, lat = origin[1] + y*scale; outer ring only, not closed",
        "origin": [WEST, SOUTH], "scale": COORD_SCALE, "count": len(blds), "buildings": blds,
    }, open(OUT / "buildings.json", "w"), separators=(",", ":"))
    print(f"建筑: {len(blds)} 栋，其中 {nolevel} 栋无高度/层数，按 {BUILDING_DEFAULT_H} m")

    # ------------------------------------------------ 道路
    roads = []
    for e in E:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") not in ("trunk", "primary", "secondary", "tertiary"):
            continue
        if t.get("tunnel") in ("yes", "building_passage") or t.get("layer", "0").startswith("-"):
            continue
        ls = LineString(way_coords(e)).intersection(BBOX)
        for part in getattr(ls, "geoms", [ls]):
            if isinstance(part, LineString) and len(part.coords) >= 2:
                flat = []
                for lng, lat in part.simplify(0.000005).coords:
                    flat += enc(lng, lat)
                roads.append([t["highway"]] + flat)
    json.dump({
        "encoding": "each item: [highway_class, x0, y0, x1, y1, ...]; same origin/scale as buildings.json",
        "origin": [WEST, SOUTH], "scale": COORD_SCALE, "count": len(roads), "roads": roads,
    }, open(OUT / "roads.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"道路: {len(roads)} 段")

    # ------------------------------------------------ 景点校准
    def centroid_of(t, i):
        e = by_id[(t, i)]
        if "lat" in e:
            return e["lat"], e["lon"], f"{t}/{i}"
        g = element_polygon(e)
        if g is None:  # 线状要素
            c = LineString(way_coords(e)).centroid
        else:
            c = g.centroid
        return c.y, c.x, f"{t}/{i}"

    def mid_of_named_ways(name, highway_only=True):
        segs = [way_coords(e) for e in E if e["type"] == "way" and e.get("tags", {}).get("name") == name
                and ("highway" in e.get("tags", {}) or not highway_only)]
        # 堤被桥分成多段：取全部线段的长度加权质心，再吸附到最近的堤上
        from shapely.ops import nearest_points
        line = unary_union([LineString(s) for s in segs])
        p = nearest_points(line, line.centroid)[0]
        ids = [e["id"] for e in E if e["type"] == "way" and e.get("tags", {}).get("name") == name and "highway" in e.get("tags", {})]
        return p.y, p.x, "way/" + ",".join(map(str, ids))

    calib = [
        ("duanqiao", "断桥", centroid_of("way", 28538289), "断桥 bridge way 中心"),
        ("baidi", "白堤", mid_of_named_ways("白堤"), "白堤 步行道折线中点"),
        ("sudi", "苏堤", mid_of_named_ways("苏堤"), "苏堤 步行道折线中点"),
        ("leifeng", "雷峰塔", centroid_of("way", 229726934), "雷峰塔 building=pagoda 轮廓质心"),
        ("santan", "三潭印月", centroid_of("relation", 5740510), "小瀛洲 place=island 质心"),
        ("huxinting", "湖心亭", centroid_of("way", 30086285), "湖心亭 building 轮廓质心"),
        ("baochu", "保俶塔", centroid_of("node", 5312284654), "保俶塔 man_made=tower 节点"),
        ("quyuan", "曲院风荷", centroid_of("node", 4685252590), "曲院风荷 tourism=attraction 节点"),
        ("huagang", "花港观鱼", centroid_of("node", 1881729397), "花港观鱼 tourism=viewpoint 节点"),
        ("yuewang", "岳王庙", centroid_of("way", 435906176), "岳王庙 tourism=attraction 区域质心"),
    ]
    out = []
    for lid, name, (lat, lng, src), note in calib:
        out.append({"id": lid, "name": name, "lat": round(lat, 6), "lng": round(lng, 6), "osm": src, "method": note})
        print(f"  {name}: {lat:.6f}, {lng:.6f}  ({note})")
    json.dump(out, open(ROOT / "pipeline" / "landmarks.calibrated.json", "w"), ensure_ascii=False, indent=2)

    # 叠加检查图（不进网页）
    preview(hf, mask, out, water_level, ridge_mask)


def ridges(hf, water, water_level):
    """输出 ridges.png：R = 到最近山脊像素的距离（0..RIDGE_DIST_MAX 像素映射到 0..255），
    G = 该山脊的强度（log 汇流累积归一化）。返回山脊二值图供预览。"""
    n = hf.shape[0]
    h = ndimage.gaussian_filter(hf, RIDGE_SMOOTH)
    pad = np.pad(h, 1, mode="edge")
    idx = np.arange(n * n).reshape(n, n)
    rec = idx.copy()
    best = np.zeros_like(h)
    yy, xx = np.mgrid[0:n, 0:n]
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            nb = pad[1 + dy:1 + dy + n, 1 + dx:1 + dx + n]
            slope = (nb - h) / math.hypot(dx, dy)  # 反转地形的下坡 = 原地形的上坡
            better = slope > best
            best[better] = slope[better]
            ny = np.clip(yy + dy, 0, n - 1)
            nx = np.clip(xx + dx, 0, n - 1)
            rec[better] = (ny * n + nx)[better]
    relief = h - water_level
    weight = ((relief > RIDGE_MIN_RELIEF) & ~water).astype(np.float64).ravel()
    acc = weight.copy().tolist()
    recl = rec.ravel().tolist()
    for i in np.argsort(h.ravel(), kind="stable").tolist():  # 从低到高传递
        r = recl[i]
        if r != i:
            acc[r] += acc[i]
    acc = np.array(acc).reshape(n, n)
    ridge = (acc > RIDGE_MIN_ACC) & (relief > RIDGE_MIN_RELIEF + 20)
    lab, nlab = ndimage.label(ridge, structure=np.ones((3, 3)))
    sizes = ndimage.sum(ridge, lab, range(1, nlab + 1))
    keep = np.isin(lab, np.nonzero(sizes >= RIDGE_MIN_LEN)[0] + 1)
    ridge = ridge & keep
    d, (iy, ix) = ndimage.distance_transform_edt(~ridge, return_indices=True)
    la = np.log(np.maximum(acc, 1))
    lo, hi = math.log(RIDGE_MIN_ACC), la[ridge].max() if ridge.any() else 1.0
    strength = np.clip((la[iy, ix] - lo) / max(hi - lo, 1e-6), 0, 1)
    rgb = np.stack([
        np.clip(d / RIDGE_DIST_MAX, 0, 1) * 255,
        strength * 255,
        np.zeros_like(d),
    ], -1).round().astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(OUT / "ridges.png", optimize=True)
    print(f"山脊: {int(ridge.sum())} 像素, {int((sizes >= RIDGE_MIN_LEN).sum())} 段")
    return ridge


def preview(hf, mask, landmarks, water_level, ridge=None):
    v = np.clip((hf - water_level) / 250.0, 0, 1) ** 0.5
    rgb = np.stack([60 + 180 * v, 120 + 110 * v, 60 + 160 * v], -1).astype(np.uint8)
    rgb[mask > 0.5] = (rgb[mask > 0.5] * 0.3 + np.array([40, 90, 200]) * 0.7).astype(np.uint8)
    if ridge is not None:
        rgb[ridge] = (230, 170, 40)
    img = Image.fromarray(rgb)
    d = ImageDraw.Draw(img)
    for lm in landmarks:
        x, y = lnglat_to_px(lm["lng"], lm["lat"], SIZE)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 0, 0), width=2)
    img.save(CACHE / "preview_terrain.png")


if __name__ == "__main__":
    sys.exit(main())
