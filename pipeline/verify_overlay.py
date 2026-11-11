#!/usr/bin/env python3
"""验收：把 water.geojson 轮廓和校准后的景点叠到 Esri World Imagery（WGS-84 对齐）上。
输出 docs/verify/water-overlay.jpg。只覆盖西湖湖区，缩放级别 16（约 2.1 米/像素）。
"""
import io
import json
import math
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache" / "tiles"
Z = 16
W, S, E, N = 120.125, 30.228, 120.160, 30.266


def tile_xy(lng, lat, z):
    n = 2 ** z
    x = (lng + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    x0, y0 = tile_xy(W, N, Z)
    x1, y1 = tile_xy(E, S, Z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    img = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            f = CACHE / f"{Z}_{tx}_{ty}.jpg"
            if not f.exists():
                url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}"
                req = urllib.request.Request(url, headers={"User-Agent": "citymap-pipeline/1.0"})
                f.write_bytes(urllib.request.urlopen(req, timeout=30).read())
            img.paste(Image.open(f), ((tx - tx0) * 256, (ty - ty0) * 256))

    def px(lng, lat):
        x, y = tile_xy(lng, lat, Z)
        return (x - tx0) * 256, (y - ty0) * 256

    d = ImageDraw.Draw(img)
    water = json.load(open(ROOT / "app/public/data/water.geojson"))
    for ft in water["features"]:
        g = ft["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                d.line([px(*c) for c in ring], fill=(0, 255, 255), width=2)
    for lm in json.load(open(ROOT / "pipeline/landmarks.calibrated.json")):
        x, y = px(lm["lng"], lm["lat"])
        r = 14  # 半径约 30 米
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 40, 40), width=3)
        d.text((x + r + 3, y - 6), lm["id"], fill=(255, 255, 0))
    cx0, cy0 = px(W, N)
    cx1, cy1 = px(E, S)
    img = img.crop((int(cx0), int(cy0), int(cx1), int(cy1)))
    out = ROOT / "docs/verify"
    out.mkdir(parents=True, exist_ok=True)
    img.save(out / "water-overlay.jpg", quality=82)
    print(out / "water-overlay.jpg", img.size)


if __name__ == "__main__":
    main()
