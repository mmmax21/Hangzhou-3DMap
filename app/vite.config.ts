import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 仅开发环境：POST /__shot?name=xxx，body 为 PNG dataURL，保存到 docs/screenshots/xxx.png。
 * 浏览器里调用 window.__shot('day')（见 src/scene/Perf.tsx），用于和定稿图并排对比。
 */
function screenshotSaver(): Plugin {
  return {
    name: 'screenshot-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x')
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_')
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          const dir = path.resolve(__dirname, '../docs/screenshots')
          fs.mkdirSync(dir, { recursive: true })
          const file = path.join(dir, name + '.png')
          fs.writeFileSync(file, Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'))
          res.end(file)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), screenshotSaver()],
  server: { port: 5173, strictPort: true },
})
