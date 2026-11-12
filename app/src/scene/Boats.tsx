import { useEffect, useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene, sceneToUV } from '../geo/geo'
import { sampleMask, useSceneData, type SceneData } from '../data/loaders'
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

export type BoatRoute = { cx: number; cz: number; r: number; phase: number; dir: number; seed: number }
const routeCache = new WeakMap<SceneData, BoatRoute[]>()
/** 游船的圆形航线（确定性随机，荷花铺设也用它来避开航线） */
export function boatRoutes(d: SceneData): BoatRoute[] {
  const hit = routeCache.get(d)
  if (hit) return hit
  const out = (() => {
    const [lx, lz] = lngLatToScene(120.143, 30.244)
    let s = 4421
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
    const open = (x: number, z: number) => { const [u, v] = sceneToUV(x, z); return sampleMask(d, u, v) > 0.5 && sampleMask(d, u, v, 1) > K.shoreClear }
    const out: BoatRoute[] = []
    for (let tries = 0; tries < 600 && out.length < K.count; tries++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * K.spread
      const cx = lx + Math.cos(a) * rr, cz = lz + Math.sin(a) * rr, r = K.minRadius + rand() * (K.maxRadius - K.minRadius)
      let ok = true
      for (let i = 0; i < 20 && ok; i++) ok = open(cx + Math.cos(i / 20 * Math.PI * 2) * r, cz + Math.sin(i / 20 * Math.PI * 2) * r)
      if (ok && !out.some(o => Math.hypot(o.cx - cx, o.cz - cz) < o.r + r + 8)) out.push({ cx, cz, r, phase: rand() * Math.PI * 2, dir: rand() > 0.5 ? 1 : -1, seed: rand() })
    }
    return out
  })()
  routeCache.set(d, out)
  return out
}

/** 湖上的画舫：沿水面上的圆形航线缓慢行驶，夜晚船舱亮灯 */
export function Boats() {
  const d = useSceneData()
  const routes = useMemo(() => boatRoutes(d), [d])
  const meshes = useMemo(() => buildBoats(routes.length), [routes.length])
  useEffect(() => () => { for (const m of Object.values(meshes)) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } }, [meshes])
  const light = useMemo(() => new THREE.Color(style.colors.light.night), [])
  const M = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  useFrame(() => {
    const m = meshes
    lerpColor(K.hull, (m.hull.material as THREE.MeshStandardMaterial).color)
    lerpColor(K.cabin, (m.cabin.material as THREE.MeshStandardMaterial).color)
    lerpColor(K.roof, (m.roof.material as THREE.MeshStandardMaterial).color)
    lerpColor(K.lantern, (m.lantern.material as THREE.MeshStandardMaterial).color)
    let glow = 0
    routes.forEach((r, i) => {
      const a = r.phase + r.dir * shared.uTime.value * K.speed / r.r
      const x = r.cx + Math.cos(a) * r.r, z = r.cz + Math.sin(a) * r.r
      const bob = Math.sin(shared.uTime.value * 1.3 + r.seed * 9) * 0.04
      q.setFromAxisAngle(up, -a - r.dir * Math.PI / 2)
      M.compose(v.set(x, 0.05 + bob, z), q, one)
      m.hull.setMatrixAt(i, M); m.cabin.setMatrixAt(i, M); m.roof.setMatrixAt(i, M); m.lantern.setMatrixAt(i, M)
      M.compose(v.set(x, 0.04, z), q, one)
      m.wake.setMatrixAt(i, M)
      glow = Math.max(glow, lightsOn(x, r.seed))
    })
    for (const k of ['hull', 'cabin', 'roof', 'lantern', 'wake'] as const) m[k].instanceMatrix.needsUpdate = true
    const cabin = m.cabin.material as THREE.MeshStandardMaterial
    cabin.emissive.copy(light); cabin.emissiveIntensity = glow * K.cabinGlow
    const lantern = m.lantern.material as THREE.MeshStandardMaterial
    lantern.emissive.copy(lantern.color); lantern.emissiveIntensity = 0.25 + glow * K.lanternGlow
  })
  return <group>{Object.values(meshes).map((mesh, i) => <primitive key={i} object={mesh} />)}</group>
}

/**
 * 阶段 11：西湖画舫。船头船尾翘起的弧形船身、带檐的船舱、深色拱篷、船头一盏灯笼；船后一道很淡的尾迹。
 * 全部用代码生成，五个实例化网格，每帧只更新实例矩阵。船头朝 +x。
 */
function buildBoats(count: number) {
  const L = K.length
  // 船身：沿船长方向扫掠五点截面，宽度向两头收拢，甲板线和龙骨线向两头翘起
  const hullGeo = (() => {
    const N = 18, pos: number[] = [], col: number[] = [], idx: number[] = []
    const deckC = new THREE.Color(K.deck.day), hullC = new THREE.Color(K.hull.day)
    const ratio = (c: THREE.Color) => [c.r / hullC.r, c.g / hullC.g, c.b / hullC.b]
    const deckK = ratio(deckC)
    for (let i = 0; i <= N; i++) {
      const t = i / N * 2 - 1, x = t * L / 2
      const w = (K.beam / 2) * L * Math.pow(Math.max(1 - t * t, 0), 0.6) + 0.02 * L
      const lift = Math.pow(Math.abs(t), 3.2) * K.sheer * L
      const yd = 0.12 * L + lift, yk = lift * 0.85
      const ring: [number, number, number, number[]][] = [
        [-w, yd, 0, deckK], [-w * 0.86, yk + (yd - yk) * 0.45, 0, [1, 1, 1]], [0, yk, 0, [0.85, 0.85, 0.85]], [w * 0.86, yk + (yd - yk) * 0.45, 0, [1, 1, 1]], [w, yd, 0, deckK],
        // 甲板面（两点，略低于船舷）
        [-w * 0.92, yd - 0.012 * L, 1, deckK], [w * 0.92, yd - 0.012 * L, 1, deckK],
      ]
      for (const [zz, y, , c] of ring) { pos.push(x, y, zz); col.push(...c) }
      if (i > 0) {
        const a = (i - 1) * 7, b = i * 7
        for (let k = 0; k < 4; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1)
        idx.push(a + 5, a + 6, b + 5, b + 5, a + 6, b + 6)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  })()
  const deckY = 0.12 * L
  // 船舱：四面墙加前后两道檐
  const cabinGeo = new THREE.BoxGeometry(L * 0.46, L * 0.16, L * 0.17).translate(-L * 0.03, deckY + L * 0.08, 0)
  // 拱篷：半个圆柱，比船舱宽，两头出檐
  const roofGeo = (() => {
    const g = new THREE.CylinderGeometry(L * 0.13, L * 0.13, L * 0.58, 12, 1, true, 0, Math.PI)
    g.rotateZ(Math.PI / 2)
    g.scale(1, 0.55, 1)
    g.translate(-L * 0.03, deckY + L * 0.16, 0)
    return g
  })()
  // 船头灯笼：一根细杆挂一盏灯
  const lanternGeo = (() => {
    const pole = new THREE.CylinderGeometry(L * 0.006, L * 0.006, L * 0.2, 4).translate(L * 0.36, deckY + L * 0.12, 0)
    const lamp = new THREE.SphereGeometry(L * 0.028, 8, 6).scale(1, 1.25, 1).translate(L * 0.36, deckY + L * 0.2, 0)
    const lamp2 = new THREE.SphereGeometry(L * 0.022, 8, 6).scale(1, 1.25, 1).translate(-L * 0.4, deckY + L * 0.14 + K.sheer * L * 0.5, 0)
    const g = mergeGeometries([pole.toNonIndexed(), lamp.toNonIndexed(), lamp2.toNonIndexed()])
    return g
  })()
  // 尾迹：船尾后方的一块平面，着色器里画两道张开的波纹和中间一条淡痕
  const wakeGeo = new THREE.PlaneGeometry(L * K.wake.length, L * K.wake.width, 1, 1).rotateX(-Math.PI / 2).translate(-L * (0.45 + K.wake.length / 2), 0, 0)
  const wakeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ...shared, uOpacity: { value: K.wake.opacity } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: `uniform float uNight; uniform float uTime; uniform float uOpacity; varying vec2 vUv;
      void main(){
        float u = 1.0 - vUv.x;            // 0 船尾 → 1 远处
        float v = abs(vUv.y - 0.5) * 2.0;  // 0 中线 → 1 边缘
        // 注意：pow 的底数为负时结果未定义（会出 NaN 并经辉光扩散成整屏黑），这里一律用平方
        float da = (v - u * 0.9) / 0.07, dt = v / (0.06 + u * 0.12);
        float arm = exp(-da * da);
        float trail = exp(-dt * dt) * 0.6;
        float ripple = 0.75 + 0.25 * sin(u * 40.0 - uTime * 3.0);
        float a = (arm + trail) * ripple * pow(clamp(1.0 - u, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.05, u) * uOpacity * (1.0 - 0.5 * uNight);
        gl_FragColor = vec4(vec3(1.0, 0.99, 0.95) * mix(1.0, 0.35, uNight), a);
      }`,
  })
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(count, 1))
    mesh.count = count
    mesh.frustumCulled = false // 实例每帧移动，包围球不准
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return mesh
  }
  return {
    hull: make(hullGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true, side: THREE.DoubleSide })),
    cabin: make(cabinGeo, cabinMaterial(L, deckY)),
    roof: make(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide })),
    lantern: make(lanternGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 })),
    wake: make(wakeGeo, wakeMat),
  }
}

/** 船舱材质：墙面是一格格的花窗，夜晚只有窗格发光，窗框和腰板保持暗色 */
function cabinMaterial(L: number, deckY: number) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85 })
  m.onBeforeCompile = (s) => {
    s.vertexShader = 'varying vec3 vCab;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCab = position;')
    s.fragmentShader = 'varying vec3 vCab;\n' + s.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float hy = (vCab.y - ${deckY.toFixed(3)}) / ${(L * 0.16).toFixed(3)};          // 0 舱底 → 1 舱顶
  float along = vCab.x / ${(L * 0.075).toFixed(3)} + vCab.z / ${(L * 0.06).toFixed(3)};
  float pane = step(0.18, fract(along)) * step(fract(along), 0.82) * step(0.38, hy) * step(hy, 0.88);
  diffuseColor.rgb *= mix(0.62, 1.0, pane);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= pane;')
  }
  m.customProgramCacheKey = () => 'boat-cabin'
  return m
}
