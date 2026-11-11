#!/usr/bin/env python3
"""从已缓存的 Overpass 导出绿地多边形与白堤、苏堤折线；无需重新下载。"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def coords(e):
    return [[p['lon'], p['lat']] for p in e.get('geometry', []) if p]

def join(parts):
    rings = []
    while parts:
        cur = parts.pop()
        while cur and cur[0] != cur[-1]:
            for i, p in enumerate(parts):
                if cur[-1] == p[0]: cur += p[1:]; break
                if cur[-1] == p[-1]: cur += p[-2::-1]; break
                if cur[0] == p[-1]: cur = p[:-1] + cur; break
                if cur[0] == p[0]: cur = p[:0:-1] + cur; break
            else: break
            parts.pop(i)
        if len(cur) >= 4 and cur[0] == cur[-1]: rings.append(cur)
    return rings

def main():
    elements = json.loads((ROOT / 'pipeline/cache/osm.json').read_text())['elements']
    polygons, dikes = [], []
    for e in elements:
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('name') in ('苏堤', '白堤') and 'highway' in t:
            dikes.append(coords(e))
        if not (t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('forest', 'grass') or t.get('natural') == 'wood'): continue
        if e['type'] == 'way': rings = join([coords(e)])
        elif e['type'] == 'relation':
            rings = join([coords(m) for m in e.get('members', []) if m.get('role', '') in ('outer', '') and m.get('type') == 'way'])
        else: continue
        holes = join([coords(m) for m in e.get('members', []) if m.get('role') == 'inner' and m.get('type') == 'way'])
        for ring in rings:
            if any(120.100 <= x <= 120.168 and 30.215 <= y <= 30.270 for x, y in ring):
                polygons.append({'outer': ring, 'holes': holes})
    out = ROOT / 'app/public/data/green.json'
    out.write_text(json.dumps({'source': 'cached OSM parks, gardens, forest, grass and wood; WGS-84', 'polygons': polygons, 'dikes': dikes}, separators=(',', ':')))
    print(f'{len(polygons)} green polygons, {len(dikes)} dike segments; {out.stat().st_size} bytes')
if __name__ == '__main__': main()
