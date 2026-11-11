import * as THREE from 'three'
import { decode } from 'fast-png'
import landmarksJson from './landmarks.json'
import { style } from '../config/style'

export type Landmark = {
  id: string
  name: string
  lat: number
  lng: number
  poem: string
  poemSource: string
  intro: string
  model: string | null
}
export const landmarks = landmarksJson as Landmark[]

export type HeightMeta = {
  size: number
  minElevation: number
  maxElevation: number
  waterLevel: number
  lakeFloor: number
}

export type SceneData = {
  meta: HeightMeta
  /** 海拔（米），行优先，第 0 行在北 */
  elevation: Float32Array
  heightTex: THREE.DataTexture
  /** watermask RGBA8：R 遮罩，G 水内离岸距离，B 陆上离水距离 */
  mask: Uint8Array
  maskSize: number
  maskTex: THREE.DataTexture
  /** ridges.png：R 到山脊距离（/16 像素），G 山脊强度 */
  ridgeTex: THREE.DataTexture
  buildings: { origin: [number, number]; scale: number; buildings: number[][] }
  roads: { origin: [number, number]; scale: number; roads: (string | number)[][] }
  green: { polygons: { outer: number[][]; holes: number[][][] }[]; dikes: number[][][] }
  water: GeoJSON
}

type GeoJSON = { features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] }

const base = import.meta.env.BASE_URL + 'data/'

async function png(url: string) {
  const buf = await (await fetch(url)).arrayBuffer()
  return decode(buf)
}

async function load(): Promise<SceneData> {
  const [meta, hm, wm, rd, buildings, roads, water, green] = await Promise.all([
    fetch(base + 'heightmap.json').then((r) => r.json()),
    png(base + 'heightmap.png'),
    png(base + 'watermask.png'),
    png(base + 'ridges.png'),
    fetch(base + 'buildings.json').then((r) => r.json()),
    fetch(base + 'roads.json').then((r) => r.json()),
    fetch(base + 'water.geojson').then((r) => r.json()),
    fetch(base + 'green.json').then((r) => r.json()),
  ])
  const n = hm.width
  const src = hm.data as Uint16Array
  const elevation = new Float32Array(n * n)
  const k = (meta.maxElevation - meta.minElevation) / 65535
  for (let i = 0; i < n * n; i++) elevation[i] = meta.minElevation + src[i * hm.channels] * k
  // Smooth the DEM gently while keeping the lake floor exactly flat.
  const smoothed = new Float32Array(elevation.length)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      if (elevation[i] <= meta.waterLevel) {
        smoothed[i] = elevation[i]
        continue
      }
      let sum = elevation[i] * style.terrain.smoothingWeights[0]
      let weight: number = style.terrain.smoothingWeights[0]
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue
        const xx = Math.min(n - 1, Math.max(0, x + ox))
        const yy = Math.min(n - 1, Math.max(0, y + oy))
        const j = yy * n + xx
        if (elevation[j] <= meta.waterLevel) continue
        const w = style.terrain.smoothingWeights[ox === 0 || oy === 0 ? 1 : 2]
        sum += elevation[j] * w
        weight += w
      }
      smoothed[i] = sum / weight
    }
  }
  elevation.set(smoothed)
  const heightTex = new THREE.DataTexture(elevation, n, n, THREE.RedFormat, THREE.FloatType)
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping
  heightTex.needsUpdate = true

  const m = wm.width
  const mask = new Uint8Array(m * m * 4)
  const wd = wm.data as Uint8Array
  for (let i = 0; i < m * m; i++) {
    for (let c = 0; c < 3; c++) mask[i * 4 + c] = wd[i * wm.channels + c]
    mask[i * 4 + 3] = 255
  }
  const maskTex = new THREE.DataTexture(mask, m, m, THREE.RGBAFormat, THREE.UnsignedByteType)
  maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter
  maskTex.needsUpdate = true

  const rgba = (p: typeof rd) => {
    const out = new Uint8Array(p.width * p.height * 4)
    const src8 = p.data as Uint8Array
    for (let i = 0; i < p.width * p.height; i++) {
      for (let c = 0; c < 3; c++) out[i * 4 + c] = src8[i * p.channels + c]
      out[i * 4 + 3] = 255
    }
    const t = new THREE.DataTexture(out, p.width, p.height, THREE.RGBAFormat, THREE.UnsignedByteType)
    t.magFilter = t.minFilter = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }
  const ridgeTex = rgba(rd)

  return { meta, elevation, heightTex, mask, maskSize: m, maskTex, ridgeTex, buildings, roads, water, green }
}

let promise: Promise<SceneData> | null = null
let result: SceneData | null = null

/** Suspense 方式读取场景数据 */
export function useSceneData(): SceneData {
  if (result) return result
  if (!promise) promise = load().then((r) => (result = r))
  throw promise
}

/** 双线性采样海拔（米），uv 与贴图一致 */
export function sampleElevation(d: SceneData, u: number, v: number) {
  const n = d.meta.size
  const x = Math.min(Math.max(u * n - 0.5, 0), n - 1.001)
  const y = Math.min(Math.max(v * n - 0.5, 0), n - 1.001)
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const e = d.elevation
  const i = y0 * n + x0
  return (e[i] * (1 - fx) + e[i + 1] * fx) * (1 - fy) + (e[i + n] * (1 - fx) + e[i + n + 1] * fx) * fy
}

export function sampleMask(d: SceneData, u: number, v: number, channel = 0) {
  const n = d.maskSize
  const x = Math.min(Math.max(Math.round(u * n - 0.5), 0), n - 1)
  const y = Math.min(Math.max(Math.round(v * n - 0.5), 0), n - 1)
  return d.mask[(y * n + x) * 4 + channel] / 255
}
