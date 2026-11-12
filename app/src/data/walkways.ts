import { style } from '../config/style'
import { lngLatToScene, sceneToUV, TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { causeways, inBridge, pointAt } from './causeways'
import { landmarks, sampleMask, type SceneData } from './loaders'
import { octSDF } from '../scene/terrainHeight'

/**
 * 阶段 10：步道网络（纯数据，Paths.tsx 负责画，Trees.tsx 和 Buildings.tsx 用来避让）。
 * - 堤上步道：沿苏堤、白堤中线，遇桥断开，由桥面接续；两端接到环湖步道。
 * - 环湖步道：水域遮罩 B 通道（陆上离水距离）在 ringInland 像素处的等值线，取环绕西湖的那一圈，平滑后重采样。
 * - 景点小路：从环湖步道上最近的点直线通到景点脚下，中途不过水。湖心岛上的景点不接。
 */

const P = style.paths

export type Walkway = { kind: 'dike' | 'ring' | 'spur'; pts: [number, number][]; width: number }

type V2 = [number, number]

function resample(pts: V2[], step: number, closed = false): V2[] {
  const src = closed ? [...pts, pts[0]] : pts
  const out: V2[] = [src[0]]
  let carry = 0
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    let t = step - carry
    while (t < l) { out.push([a[0] + (b[0] - a[0]) * t / l, a[1] + (b[1] - a[1]) * t / l]); t += step }
    carry = l - (t - step)
  }
  if (!closed) out.push(src[src.length - 1])
  return out
}

function chaikin(pts: V2[], closed: boolean): V2[] {
  const out: V2[] = []
  const n = pts.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
  }
  if (!closed) { out.unshift(pts[0]); out.push(pts[n - 1]) }
  return out
}

/** 在遮罩 B 通道上做等值线（marching squares），返回所有闭合或开放的折线（场景坐标） */
function contours(d: SceneData, level: number): V2[][] {
  const m = d.maskSize
  const v = new Float32Array(m * m)
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const x = ((i + 0.5) / m - 0.5) * TERRAIN_W, z = ((j + 0.5) / m - 0.5) * TERRAIN_D
    // 八边形外当作远离水面，等值线不会沿边界生成
    v[j * m + i] = octSDF(x, z) > -14 ? 255 : (d.mask[(j * m + i) * 4] > 127 ? 0 : d.mask[(j * m + i) * 4 + 2])
  }
  const point = new Map<number, V2>()
  const adj = new Map<number, number[]>()
  const link = (a: number, b: number) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a) }
  // 边编号：水平边 (i,j)-(i+1,j) 为 2k，竖直边 (i,j)-(i,j+1) 为 2k+1
  const edge = (i: number, j: number, vertical: boolean) => {
    const id = 2 * (j * m + i) + (vertical ? 1 : 0)
    if (!point.has(id)) {
      const a = v[j * m + i], b = vertical ? v[(j + 1) * m + i] : v[j * m + i + 1]
      const t = (level - a) / (b - a || 1e-6)
      const pi = vertical ? i : i + t, pj = vertical ? j + t : j
      point.set(id, [((pi + 0.5) / m - 0.5) * TERRAIN_W, ((pj + 0.5) / m - 0.5) * TERRAIN_D])
    }
    return id
  }
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
    const a = v[j * m + i] >= level ? 1 : 0, b = v[j * m + i + 1] >= level ? 1 : 0
    const c = v[(j + 1) * m + i + 1] >= level ? 1 : 0, e = v[(j + 1) * m + i] >= level ? 1 : 0
    const code = a | (b << 1) | (c << 2) | (e << 3)
    if (code === 0 || code === 15) continue
    const top = () => edge(i, j, false), right = () => edge(i + 1, j, true), bottom = () => edge(i, j + 1, false), left = () => edge(i, j, true)
    switch (code) {
      case 1: case 14: link(left(), top()); break
      case 2: case 13: link(top(), right()); break
      case 3: case 12: link(left(), right()); break
      case 4: case 11: link(right(), bottom()); break
      case 6: case 9: link(top(), bottom()); break
      case 7: case 8: link(left(), bottom()); break
      case 5: link(left(), top()); link(right(), bottom()); break
      case 10: link(top(), right()); link(left(), bottom()); break
    }
  }
  const seen = new Set<number>()
  const lines: V2[][] = []
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const line: V2[] = []
    let prev = -1, cur = start
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur)
      line.push(point.get(cur)!)
      const next: number | undefined = (adj.get(cur) ?? []).find((n) => n !== prev && !seen.has(n))
      prev = cur
      cur = next as number
    }
    if (line.length > 8) lines.push(line)
  }
  return lines
}

const cache = new WeakMap<SceneData, Walkway[]>()

export function walkways(d: SceneData, step: number = P.step): Walkway[] {
  const hit = cache.get(d)
  if (hit && step === P.step) return hit
  const out: Walkway[] = []

  // 环湖步道：包住西湖中心、周长最长的那一圈
  const [lx, lz] = lngLatToScene(120.143, 30.244)
  const level = (P.ringInland / 48) * 255
  let ring: V2[] | null = null, best = 0
  for (const line of contours(d, level)) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of line) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z) }
    if (lx < minX || lx > maxX || lz < minZ || lz > maxZ) continue
    if (line.length > best) { best = line.length; ring = line }
  }
  if (ring) {
    let r = resample(ring, 2, true)
    for (let k = 0; k < P.ringSmooth; k++) r = chaikin(r, true)
    r = resample(r, step, true)
    r.push(r[0])
    out.push({ kind: 'ring', pts: r, width: P.ringWidth })
  }
  const ringPts = ring ? out[0].pts : []
  const nearestRing = (x: number, z: number) => {
    let bd = Infinity, bp: V2 = [x, z]
    for (const p of ringPts) { const dd = Math.hypot(p[0] - x, p[1] - z); if (dd < bd) { bd = dd; bp = p } }
    return { d: bd, p: bp }
  }
  const dryLine = (a: V2, b: V2) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (let t = 0; t <= l; t += 1) {
      const x = a[0] + (b[0] - a[0]) * t / l, z = a[1] + (b[1] - a[1]) * t / l
      const [u, w] = sceneToUV(x, z)
      if (sampleMask(d, u, w) > 0.5) return false
    }
    return true
  }

  // 堤上步道：遇桥断开（桥面接续），两端接到环湖步道
  for (const cw of causeways) {
    let piece: V2[] = []
    const flush = () => { if (piece.length > 1) out.push({ kind: 'dike', pts: piece, width: P.width }); piece = [] }
    for (let s = 0; s <= cw.length; s += step) {
      const br = inBridge(cw, s, -0.6)
      if (br) { flush(); continue }
      const p = pointAt(cw, s)
      piece.push([p.x, p.z])
    }
    flush()
    for (const end of [cw.pts[0], cw.pts[cw.pts.length - 1]]) {
      const nr = nearestRing(end[0], end[1])
      if (nr.d < 30 && nr.d > 1 && dryLine(end, nr.p)) out.push({ kind: 'spur', pts: resample([end, nr.p], step), width: P.width * 0.8 })
    }
  }

  // 景点小路
  for (const l of landmarks) {
    if (['sudi', 'baidi', 'duanqiao', 'huxinting', 'santan'].includes(l.id)) continue
    const [x, z] = lngLatToScene(l.lng, l.lat)
    const nr = nearestRing(x, z)
    if (nr.d > P.spurMax) continue
    const stop = (style.landmarks.sizes[l.id] ?? 8) * 0.32
    if (nr.d < stop + 2) continue
    const end: V2 = [x + (nr.p[0] - x) * stop / nr.d, z + (nr.p[1] - z) * stop / nr.d]
    if (!dryLine(nr.p, end)) continue
    out.push({ kind: 'spur', pts: resample([nr.p, end], step), width: P.spurWidth })
  }
  if (step === P.step) cache.set(d, out)
  return out
}

/** (x, z) 离最近步道边缘的距离（负数表示在步道上），用网格加速 */
const gridCache = new WeakMap<SceneData, { cell: number; map: Map<string, [V2, V2, number][]> }>()
export function walkwayClearance(d: SceneData, x: number, z: number) {
  let g = gridCache.get(d)
  if (!g) {
    const cell = 10, map = new Map<string, [V2, V2, number][]>()
    for (const w of walkways(d)) for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i]
      const i0 = Math.floor(Math.min(a[0], b[0]) / cell) - 1, i1 = Math.floor(Math.max(a[0], b[0]) / cell) + 1
      const j0 = Math.floor(Math.min(a[1], b[1]) / cell) - 1, j1 = Math.floor(Math.max(a[1], b[1]) / cell) + 1
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = `${i},${j}`; (map.get(k) ?? map.set(k, []).get(k)!).push([a, b, w.width / 2]) }
    }
    g = { cell, map }
    gridCache.set(d, g)
  }
  let best = Infinity
  for (const [a, b, hw] of g.map.get(`${Math.floor(x / g.cell)},${Math.floor(z / g.cell)}`) ?? []) {
    const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1
    const t = Math.min(Math.max(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0), 1)
    best = Math.min(best, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t) - hw)
  }
  return best
}

