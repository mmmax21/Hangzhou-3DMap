# 静态站点发布

本项目没有服务端。发布目录为 `app/dist/`，仓库自带 GitHub Actions workflow 发布 GitHub Pages。

## 构建与本地验收

在仓库根目录运行：

```sh
npm --prefix app ci
npm --prefix app run build
npm --prefix app run preview -- --host 127.0.0.1 --port 4173
```

浏览器打开 `http://127.0.0.1:4173/`。验收入场、昼夜切换、景点选择与关闭、拖拽缩放。

## 发布设置

- GitHub 仓库 Settings -> Pages -> Build and deployment 选择 GitHub Actions。
- 推送到 `main` 会运行 `.github/workflows/pages.yml` 并发布站点。
- workflow 在构建时设置仓库 Pages 子路径 `/Hangzhou-3DMap/`。
- 静态资源：`data/`、`models/` 与 `assets/` 必须可直接访问。
- 不需要服务端环境变量。生产构建不包含开发截图保存接口。
- 更新时替换完整构建目录；不要长期缓存 `index.html`，带哈希的 `assets/` 可长期缓存。

手动发布时，在仓库根目录运行 `VITE_BASE_PATH=/Hangzhou-3DMap/ npm --prefix app run build`，然后上传 `app/dist/`。自定义域名根路径部署时可使用默认 `/`。

## 景点资产

现有 9 个成品 GLB 已接入，高档显示精模；低档以轻量占位保留交互。构建时自动发现模型；缺失或加载失败时回退占位。三潭印月由亭子加三座石塔组成，苏堤复用断桥模型。

## 本次状态（2026-11-11）

已连接 `https://github.com/mmmax21/Hangzhou-3DMap.git`，全部实现提交已推送到 `main`，仓库 Pages 已启用为 `workflow` 构建方式。

- 公网地址：https://mmmax21.github.io/Hangzhou-3DMap/
- 首次成功发布：https://github.com/mmmax21/Hangzhou-3DMap/actions/runs/43035130457 （提交 `54f8375`，build / deploy 均成功）。
- 已在线检查入场后的场景、昼夜切换、雷峰塔精模、选择飞行与卡片关闭，浏览器控制台无 error；子路径下的数据和模型正常加载。
- 线上截图：`docs/screenshots/deployed-day.jpg`、`docs/screenshots/deployed-night.jpg`。
- 高低画质和 390×844 布局已在本地验证；M1 和目标手机的实际帧率仍待设备验收。

首次 workflow 因 Pages 尚未启用而失败，启用后手动触发成功。后续推送 `main` 自动发布，无需再次配置。Actions 目前有 Node 20 action runtime 弃用警告，不影响此次发布；应用构建使用 Node 22。
