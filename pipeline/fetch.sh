#!/usr/bin/env bash
# 下载原始地理数据到 pipeline/cache/（已被 .gitignore 忽略）
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p cache

# Copernicus GLO-30 DEM，覆盖 N30-31 E120-121 的 1 度瓦片
DEM=Copernicus_DSM_COG_10_N30_00_E120_00_DEM
if [ ! -f cache/dem_N30_E120.tif ]; then
  curl -fSL -o cache/dem_N30_E120.tif \
    "https://copernicus-dem-30m.s3.amazonaws.com/${DEM}/${DEM}.tif"
fi

# OSM：水系、建筑、道路、绿地、景点名称（查询见 osm-query.overpass）
if [ ! -f cache/osm.json ]; then
  for url in https://overpass-api.de/api/interpreter \
             https://overpass.kumi.systems/api/interpreter; do
    if curl -fsS -A "citymap-pipeline/1.0" -X POST \
         --data-urlencode data@osm-query.overpass -o cache/osm.json "$url" \
       && grep -q '"elements"' cache/osm.json; then
      echo "OSM from $url"; break
    fi
  done
fi
ls -la cache
