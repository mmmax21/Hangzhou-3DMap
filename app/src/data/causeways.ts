import { style } from '../config/style'
import { lngLatToScene, TERRAIN_D, TERRAIN_W } from '../geo/geo'
import type { HeightMeta } from './loaders'

/**
 * 阶段 10：苏堤与白堤。
 *
 * 走向取自 OSM（pipeline/cache/osm.json）里名为「苏堤」「白堤」的步行道。
 * 苏堤的 OSM 步道被切成七段，相邻两段之间有六处 24 到 39 米的空缺，正是六座桥的位置，
 * 自南向北依次为映波、锁澜、望山、压堤、东浦、跨虹（OSM 没有给这六座桥单独打标签）。
 * 白堤中段有一处 121 米的空缺，是锦带桥；东端是 OSM 里的断桥（way 28538289）。
 *
 * 载入数据时（loaders.ts）按这里的走向改写高度图和水域遮罩：
 * 堤面抬到水面以上并加宽，桥下开出水道，白堤接成连续的一条。之后地形、湖面、树、游船、荷花、阴影遮罩都读改写后的数据。
 */

type LL = [number, number]

const SUDI: LL[] = [
  [120.1397, 30.230942], [120.139428, 30.231514], [120.138738, 30.232833],
  [120.138629, 30.233078], [120.138147, 30.233931], [120.137887, 30.234415], [120.137527, 30.234938], [120.137364, 30.235185], [120.136434, 30.236757],
  [120.13628, 30.237081], [120.136188, 30.237322], [120.135526, 30.239069], [120.135335, 30.239686], [120.134894, 30.24111], [120.134855, 30.241233],
  [120.134755, 30.241563], [120.134615, 30.242043], [120.133423, 30.246152], [120.13339, 30.246273],
  [120.133326, 30.24648], [120.13323, 30.246773], [120.132711, 30.248357], [120.132298, 30.249516], [120.131986, 30.25039], [120.131963, 30.250464],
  [120.131873, 30.25076], [120.131307, 30.252665],
  [120.131236, 30.252897], [120.131075, 30.253366], [120.131042, 30.253458], [120.130862, 30.253961],
]
const BAIDI: LL[] = [
  [120.140206, 30.253512], [120.140491, 30.253802], [120.140815, 30.254114], [120.141102, 30.254393], [120.141282, 30.254566],
  [120.141425, 30.2547], [120.141679, 30.254937], [120.142415, 30.255559], [120.143286, 30.256574],
  [120.144034, 30.257454], [120.145822, 30.259558], [120.14643, 30.260219], [120.14665, 30.260457],
  [120.147411, 30.261344], [120.147492, 30.261445], [120.147597, 30.261613],
]

/** 八座桥。model 为 true 的是景点模型（断桥），由 Landmarks 渲染，这里只负责开水道和对齐方向 */
const BRIDGES: { id: string; name: string; dike: 'sudi' | 'baidi'; at: LL; landmark?: string }[] = [
  { id: 'yingbo', name: '映波桥', dike: 'sudi', at: [120.1386832, 30.2329551] },
  { id: 'suolan', name: '锁澜桥', dike: 'sudi', at: [120.13635705, 30.2369192] },
  { id: 'wangshan', name: '望山桥', dike: 'sudi', at: [120.13480495, 30.241398] },
  { id: 'yadi', name: '压堤桥', dike: 'sudi', at: [120.1333581, 30.2463764] },
  { id: 'dongpu', name: '东浦桥', dike: 'sudi', at: [120.13191825, 30.2506121] },
  { id: 'kuahong', name: '跨虹桥', dike: 'sudi', at: [120.13127175, 30.2527813] },
  { id: 'jindai', name: '锦带桥', dike: 'baidi', at: [120.14366015, 30.257014] },
  { id: 'duanqiao', name: '断桥', dike: 'baidi', at: [120.14703035, 30.26090085], landmark: 'duanqiao' },
]

/** duanqiao.glb 的包围盒：长（x）与高（y）之比、宽（z）与高之比 */
export const BRIDGE_ASPECT = { length: 65534 / 24930, width: 25074 / 24930 }

export type Bridge = { id: string; name: string; dike: string; x: number; z: number; s: number; tx: number; tz: number; rotation: number; length: number; landmark?: string }
export type Causeway = { id: 'sudi' | 'baidi'; pts: [number, number][]; cum: number[]; length: number; bridges: Bridge[] }

const C = style.causeways

function build(id: 'sudi' | 'baidi', ll: LL[]): Causeway {
  const pts = ll.map(([a, b]) => lngLatToScene(a, b))
  // 两端沿切线向岸上延伸
  const ext = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dx, dz) || 1
    return [a[0] + (dx / l) * C.extend, a[1] + (dz / l) * C.extend]
  }
  pts.unshift(ext(pts[0], pts[1]))
  pts.push(ext(pts[pts.length - 1], pts[pts.length - 2]))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const cw: Causeway = { id, pts, cum, length: cum[cum.length - 1], bridges: [] }
  for (const b of BRIDGES.filter((b) => b.dike === id)) {
    const [x, z] = lngLatToScene(...b.at)
    const q = project(cw, x, z)
    const length = b.landmark ? style.landmarks.sizes[b.landmark] * BRIDGE_ASPECT.length : C.bridgeLength
    cw.bridges.push({ id: b.id, name: b.name, dike: id, x: q.x, z: q.z, s: q.s, tx: q.tx, tz: q.tz, rotation: Math.atan2(-q.tz, q.tx), length, landmark: b.landmark })
  }
  return cw
}

/** 点到折线的最近点：距离 d、弧长 s、最近点坐标和切线 */
export function project(cw: Causeway, x: number, z: number) {
  let best = { d: Infinity, s: 0, x: 0, z: 0, tx: 1, tz: 0 }
  const p = cw.pts
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0], bz = p[i][1]
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1
    const t = Math.min(Math.max(((x - ax) * ex + (z - az) * ez) / l2, 0), 1)
    const qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(x - qx, z - qz)
    if (d < best.d) { const l = Math.sqrt(l2); best = { d, s: cw.cum[i - 1] + l * t, x: qx, z: qz, tx: ex / l, tz: ez / l } }
  }
  return best
}

/** 沿堤弧长 s 处的点和切线 */
export function pointAt(cw: Causeway, s: number) {
  const c = cw.cum
  let i = 1
  while (i < c.length - 1 && c[i] < s) i++
  const l = c[i] - c[i - 1] || 1, t = Math.min(Math.max((s - c[i - 1]) / l, 0), 1)
  const a = cw.pts[i - 1], b = cw.pts[i]
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l }
}

export const causeways: Causeway[] = [build('sudi', SUDI), build('baidi', BAIDI)]
export const bridges: Bridge[] = causeways.flatMap((c) => c.bridges)

/** (x, z) 是否落在某座桥的桥身范围内（沿堤方向） */
export function inBridge(cw: Causeway, s: number, pad = 0) {
  return cw.bridges.find((b) => Math.abs(s - b.s) < b.length / 2 + pad)
}

/** 离最近一条堤中线的距离，以及是否在桥身范围内（种树、放建筑时避让用） */
export function nearCauseway(x: number, z: number) {
  let d = Infinity, bridge = false
  for (const cw of causeways) {
    const q = project(cw, x, z)
    if (q.d < d) { d = q.d; bridge = !!inBridge(cw, q.s, 1) }
  }
  return { d, bridge }
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }

/**
 * 改写高度图（海拔，米）和水域遮罩（RGBA8：R 水，G 水内离岸距离，B 陆上离水距离，0..255 对应 0..48 像素）。
 * 两者都是 n×n、第 0 行在北，与 sceneToUV 一致。
 */
export function applyCauseways(meta: HeightMeta, elevation: Float32Array, n: number, mask: Uint8Array, m: number) {
  const top = meta.waterLevel + C.topMeters, floor = meta.lakeFloor
  const pxW = TERRAIN_W / m, pxD = TERRAIN_D / m, px = (pxW + pxD) / 2
  const toDist = (units: number) => Math.min(Math.max((units / px / 48) * 255, 0), 255)
  const reach = C.halfWidth + C.shoulder + 30 // 堤外这个范围内更新水内离岸距离
  for (const cw of causeways) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of cw.pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z) }
    const i0 = Math.max(0, Math.floor(((minX - reach) / TERRAIN_W + 0.5) * m)), i1 = Math.min(m - 1, Math.ceil(((maxX + reach) / TERRAIN_W + 0.5) * m))
    const j0 = Math.max(0, Math.floor(((minZ - reach) / TERRAIN_D + 0.5) * m)), j1 = Math.min(m - 1, Math.ceil(((maxZ + reach) / TERRAIN_D + 0.5) * m))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = ((i + 0.5) / m - 0.5) * TERRAIN_W, z = ((j + 0.5) / m - 0.5) * TERRAIN_D
      const q = project(cw, x, z)
      if (q.d > reach) continue
      const k = (j * m + i) * 4
      const e = (j * n + i) // 高度图与遮罩同为 1024，按同一像素处理
      const wasWater = mask[k] > 127
      const br = inBridge(cw, q.s)
      const open = br ? br.length * C.opening - Math.abs(q.s - br.s) : -1 // >0 在桥下水道内
      if (open > 0 && q.d < C.halfWidth + C.shoulder + 2) {
        // 桥下开水道：降到湖底，标为水面
        elevation[e] = Math.min(elevation[e], floor)
        mask[k] = 255
        mask[k + 1] = Math.min(toDist(open), wasWater ? mask[k + 1] : 255)
        mask[k + 2] = 0
        continue
      }
      if (q.d < C.halfWidth) {
        elevation[e] = Math.max(elevation[e], top)
        mask[k] = 0
        mask[k + 1] = 0
        // 陆上离水距离：到堤沿的距离，以及到桥下水道的距离，取小的
        const toOpen = br ? Math.abs(q.s - br.s) - br.length * C.opening : Infinity
        mask[k + 2] = wasWater ? toDist(Math.min(C.halfWidth - q.d, toOpen)) : Math.min(mask[k + 2], toDist(Math.min(C.halfWidth - q.d, toOpen)))
      } else if (q.d < C.halfWidth + C.shoulder) {
        const t = smooth(C.halfWidth, C.halfWidth + C.shoulder, q.d)
        const y = top + (floor - top) * t
        if (wasWater) {
          elevation[e] = Math.max(Math.min(elevation[e], meta.waterLevel), y)
          mask[k] = 255
          mask[k + 1] = Math.min(mask[k + 1], toDist(q.d - C.halfWidth))
          mask[k + 2] = 0
        } else elevation[e] = Math.max(elevation[e], y)
      } else if (wasWater) {
        mask[k + 1] = Math.min(mask[k + 1], toDist(q.d - C.halfWidth))
      }
    }
  }
}
