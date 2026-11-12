import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene, sceneToUV } from '../geo/geo'
import { sampleMask, useSceneData } from '../data/loaders'
import { lerpColor, shared, uNight } from '../state/night'
import { OCT } from './terrainHeight'

const K = style.boats

/** 与 GLSL 的 lightsOn 一致：越靠东越早亮 */
function lightsOn(x: number, seed: number) {
  const k = Math.min(Math.max(x / OCT.hx * 0.5 + 0.5, 0), 1)
  const d = (1 - k) * 0.55 + seed * 0.1
  const t = Math.min(Math.max((uNight.value - d) / 0.3, 0), 1)
  return t * t * (3 - 2 * t)
}

/** 湖上的画舫：沿水面上的圆形航线缓慢行驶，夜晚船舱亮灯 */
export function Boats() {
  const d = useSceneData()
  const routes = useMemo(() => {
    const [lx, lz] = lngLatToScene(120.143, 30.244)
    let s = 4421
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
    const open = (x: number, z: number) => { const [u, v] = sceneToUV(x, z); return sampleMask(d, u, v) > 0.5 && sampleMask(d, u, v, 1) > K.shoreClear }
    const out: { cx: number; cz: number; r: number; phase: number; dir: number; seed: number }[] = []
    for (let tries = 0; tries < 600 && out.length < K.count; tries++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * K.spread
      const cx = lx + Math.cos(a) * rr, cz = lz + Math.sin(a) * rr, r = K.minRadius + rand() * (K.maxRadius - K.minRadius)
      let ok = true
      for (let i = 0; i < 20 && ok; i++) ok = open(cx + Math.cos(i / 20 * Math.PI * 2) * r, cz + Math.sin(i / 20 * Math.PI * 2) * r)
      if (ok && !out.some(o => Math.hypot(o.cx - cx, o.cz - cz) < o.r + r + 8)) out.push({ cx, cz, r, phase: rand() * Math.PI * 2, dir: rand() > 0.5 ? 1 : -1, seed: rand() })
    }
    return out
  }, [d])
  const mats = useMemo(() => ({
    hull: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    cabin: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
  }), [])
  const refs = useRef<(THREE.Group | null)[]>([])
  const light = useMemo(() => new THREE.Color(style.colors.light.night), [])
  useFrame(() => {
    lerpColor(K.hull, mats.hull.color); lerpColor(K.cabin, mats.cabin.color); lerpColor(K.roof, mats.roof.color)
    let glow = 0
    routes.forEach((r, i) => {
      const g = refs.current[i]; if (!g) return
      const a = r.phase + r.dir * shared.uTime.value * K.speed / r.r
      g.position.set(r.cx + Math.cos(a) * r.r, 0.15 + Math.sin(shared.uTime.value * 1.3 + r.seed * 9) * 0.06, r.cz + Math.sin(a) * r.r)
      g.rotation.y = -a - r.dir * Math.PI / 2
      glow = Math.max(glow, lightsOn(g.position.x, r.seed))
    })
    mats.cabin.emissive.copy(light); mats.cabin.emissiveIntensity = glow * K.glow
  })
  const L = K.length
  return <group>{routes.map((_, i) => (
    <group key={i} ref={el => { refs.current[i] = el }}>
      <mesh material={mats.hull} position={[0, L * 0.06, 0]}><boxGeometry args={[L, L * 0.12, L * 0.3]} /></mesh>
      <mesh material={mats.hull} position={[L * 0.53, L * 0.09, 0]} rotation={[0, 0, 0.45]}><boxGeometry args={[L * 0.16, L * 0.08, L * 0.22]} /></mesh>
      <mesh material={mats.cabin} position={[-L * 0.04, L * 0.22, 0]}><boxGeometry args={[L * 0.55, L * 0.2, L * 0.24]} /></mesh>
      <mesh material={mats.roof} position={[-L * 0.04, L * 0.35, 0]}><boxGeometry args={[L * 0.66, L * 0.045, L * 0.33]} /></mesh>
    </group>
  ))}</group>
}
