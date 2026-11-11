import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/** 帧率与渲染统计，写到 window.__perf，URL 带 ?stats 时显示在左上角 */
export function Perf() {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ frames: 0, t0: performance.now() })
  const last = useRef({ calls: 0, triangles: 0 })
  useFrame(() => {
    // 关闭自动重置，统计一整帧（含后期各 pass）的绘制调用和三角面
    gl.info.autoReset = false
    last.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
    gl.info.reset()
    const a = acc.current
    a.frames++
    const now = performance.now()
    if (now - a.t0 >= 1000) {
      const fps = (a.frames * 1000) / (now - a.t0)
      const info = last.current
      const perf = { fps: Math.round(fps * 10) / 10, calls: info.calls, triangles: info.triangles }
      ;(window as unknown as Record<string, unknown>).__perf = perf
      const el = document.getElementById('perf')
      if (el) el.textContent = `${perf.fps} fps · ${perf.calls} calls · ${(perf.triangles / 1e6).toFixed(2)}M tris`
      a.frames = 0
      a.t0 = now
    }
  })
  return null
}

/** 基准：同步渲染 n 帧（含后期），用 readPixels 等待 GPU 完成，返回平均毫秒。用于面板在后台被节流时测性能 */
export function BenchHook() {
  const advance = useThree((s) => s.advance)
  const gl = useThree((s) => s.gl)
  ;(window as unknown as Record<string, unknown>).__advanceOnce = () => advance(performance.now())
  ;(window as unknown as Record<string, unknown>).__bench = (n = 60) => {
    const ctx = gl.getContext()
    const px = new Uint8Array(4)
    const t0 = performance.now()
    for (let i = 0; i < n; i++) {
      advance(performance.now())
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    }
    const ms = (performance.now() - t0) / n
    return { msPerFrame: Math.round(ms * 100) / 100, fpsEquivalent: Math.round(1000 / ms), w: gl.domElement.width, h: gl.domElement.height }
  }
  return null
}

/** 开发用：同步渲染 frames 帧后把画布保存到 docs/screenshots/<name>.png */
export function ShotHook() {
  const advance = useThree((s) => s.advance)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const useThreeSetDpr = useThree((s) => s.setDpr)
  ;(window as unknown as Record<string, unknown>).__scene = scene
  ;(window as unknown as Record<string, unknown>).__setDpr = (d: number) => useThreeSetDpr(d)
  ;(window as unknown as Record<string, unknown>).__shot = async (name = 'shot', frames = 3) => {
    for (let i = 0; i < frames; i++) advance(performance.now())
    const data = gl.domElement.toDataURL('image/png')
    const r = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: data })
    return r.text()
  }
  return null
}
