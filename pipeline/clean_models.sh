#!/bin/sh
# 把 assets-raw/tripo/*.glb 清理成 app/public/models/*.glb
# 减面、贴图压到 1024 WebP、Meshopt 压缩。见 docs/ASSETS.md。
# 用 4.0.10 是因为更新的 CLI 需要 Node 20.12 以上。
set -e
cd "$(dirname "$0")/../assets-raw/tripo"
mkdir -p ../../app/public/models
for f in *.glb; do
  r=0.65
  case "$f" in
    leifeng*|baochu*) r=0.85 ;;   # 塔类预算 4 万面
    santan-stone*)    r=0.3  ;;   # 小石塔，会复制三座
  esac
  npx --yes @gltf-transform/cli@4.0.10 optimize "$f" "../../app/public/models/$f" \
    --compress meshopt --texture-compress webp --texture-size 1024 \
    --simplify true --simplify-ratio "$r" --simplify-error 0.002
done
