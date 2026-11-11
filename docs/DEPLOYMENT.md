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

生产构建已通过，高低画质与手机尺寸已验证。Pages workflow 已配置；需在 GitHub 仓库启用 Pages 的 GitHub Actions 发布方式，并将提交推送到 `main`，才能获得公网地址并验收。
