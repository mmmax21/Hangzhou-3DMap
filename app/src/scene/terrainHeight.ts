import { style } from '../config/style'
import { TERRAIN_D, TERRAIN_W, metersToUnits, sceneToUV } from '../geo/geo'
import { sampleElevation, type SceneData } from '../data/loaders'

/** 八边形（切角矩形）有符号距离，内部为负。JS 与 GLSL（octSDF）保持一致 */
export const OCT = {
  hx: TERRAIN_W / 2,
  hz: TERRAIN_D / 2,
  c: style.base.chamfer * Math.min(TERRAIN_W, TERRAIN_D),
}
export function octSDF(x: number, z: number, grow = 0) {
  const ax = Math.abs(x), az = Math.abs(z)
  const d = Math.max(ax - OCT.hx, az - OCT.hz, (ax + az - (OCT.hx + OCT.hz - OCT.c)) / Math.SQRT2)
  return d - grow
}

/**
 * 海拔（米）-> 场景 y，水位在 y=0。
 * 线性夸张 exaggeration，再对高处乘 (1 + peakCurve * min(h / peakRef, 1)) 让山顶更陡。
 * GLSL 里的 terrainYm() 与此一致（见 shaders/common.ts）。
 */
export function elevationToY(d: SceneData, e: number) {
  const T = style.terrain
  const h = e - d.meta.waterLevel
  const k = 1 + T.peakCurve * Math.min(Math.max(h / T.peakRef, 0), 1)
  return metersToUnits(h * T.exaggeration * k)
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** 场景 (x,z) 处地表高度，含八边形边缘压低 */
export function terrainY(d: SceneData, x: number, z: number) {
  const [u, v] = sceneToUV(x, z)
  const y = elevationToY(d, sampleElevation(d, u, v))
  const f = smoothstep(0, style.terrain.edgeFalloff, -octSDF(x, z))
  return style.base.topY + (y - style.base.topY) * f
}
