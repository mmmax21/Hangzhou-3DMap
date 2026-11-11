# 地理数据管线（阶段 2）

```bash
pip install numpy pillow scipy shapely tifffile imagecodecs
./pipeline/fetch.sh                  # 下载 DEM 瓦片和 OSM 到 pipeline/cache/（不入库）
python3 pipeline/build_data.py       # 生成 app/public/data/* 和 landmarks.calibrated.json
python3 pipeline/verify_overlay.py   # 叠 Esri 卫星图验收，输出 docs/verify/water-overlay.jpg
```

要点：

- 范围、分辨率、湖底深度等常量在 `build_data.py` 顶部。
- 所有栅格（heightmap、watermask）像素中心对齐范围：像素 (i, j) 的中心在 `west + (i+0.5)/1024*(east-west)`，第 0 行在北。与贴图 UV 一致，直接把整张图铺满范围矩形即可。
- DEM 是 DSM（含楼宇和树冠）。平原区用 9x9 灰度开运算抹掉楼宇，山区只做 3x3，按高程平滑过渡。
- 水体：低分位高程与西湖水位相差 8 米以内的 OSM 水面都计入遮罩，并统一压平到西湖水位（钱塘江实际低几米，按 2 倍夸张折合不到 1 个场景单位，可忽略）。山间高处的小池塘被跳过，列表见运行日志。
- `watermask.png` 三个通道：R 抗锯齿遮罩；G 水内离岸距离（255 = 48 像素以上）；B 陆上离水距离（同上）。
- `buildings.json` / `roads.json` 用整数编码经纬度以减小体积，解码规则写在文件的 `encoding` 字段里。OSM 里绝大多数建筑没有高度和层数，按 PRD 给 12 米。
- 景点校准所选的 OSM 要素写在 `build_data.py` 的 `calib` 列表和输出的 `landmarks.calibrated.json` 中。
