/**
 * 坐标约定（PRD 第 3 节）：WGS-84 经纬度 -> 场景坐标。
 * 1 单位 = 10 米，原点在范围中心，X 向东，Z 向南，Y 向上。
 * 全项目只允许通过 lngLatToScene 做经纬度转换。
 */
export const BBOX = { west: 120.085, east: 120.185, south: 30.205, north: 30.285 } as const

const LNG0 = (BBOX.west + BBOX.east) / 2
const LAT0 = (BBOX.south + BBOX.north) / 2
const UNIT_M = 10
// 范围中心纬度处每度经纬的米数（WGS-84 椭球近似公式）
const phi = (LAT0 * Math.PI) / 180
const M_PER_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
const M_PER_DEG_LNG = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)

/** 经纬度 -> 场景 [x, z]（唯一的转换函数） */
export function lngLatToScene(lng: number, lat: number): [number, number] {
  return [((lng - LNG0) * M_PER_DEG_LNG) / UNIT_M, (-(lat - LAT0) * M_PER_DEG_LAT) / UNIT_M]
}

/** 范围矩形在场景中的宽（东西）和深（南北），单位：场景单位 */
export const [TERRAIN_W, TERRAIN_D] = (() => {
  const [x0, z0] = lngLatToScene(BBOX.west, BBOX.north)
  const [x1, z1] = lngLatToScene(BBOX.east, BBOX.south)
  return [x1 - x0, z1 - z0]
})()

/** 米 -> 场景单位 */
export const metersToUnits = (m: number) => m / UNIT_M

/** 场景 xz -> 贴图 UV（v=0 在北，与 heightmap/watermask 第 0 行一致） */
export function sceneToUV(x: number, z: number): [number, number] {
  return [x / TERRAIN_W + 0.5, z / TERRAIN_D + 0.5]
}
