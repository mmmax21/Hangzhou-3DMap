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

/** 海拔（米）-> 场景 y，水位在 y=0，含 2 倍地形夸张 */
export function elevationToY(d: SceneData, e: number) {
  return metersToUnits((e - d.meta.waterLevel) * style.terrain.exaggeration)
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
