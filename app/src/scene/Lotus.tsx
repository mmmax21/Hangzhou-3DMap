import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { style } from '../config/style'
import { landmarks, sampleMask, useSceneData } from '../data/loaders'
import { lngLatToScene, sceneToUV } from '../geo/geo'
import { lerpColor, shared, uNight } from '../state/night'
import { usePerfTier } from '../state/perf'
import { octSDF } from './terrainHeight'
import { boatRoutes } from './Boats'

const K = style.lotus

/**
 * 阶段 8：曲院风荷水面的荷叶与荷花（「接天莲叶无穷碧，映日荷花别样红」）。
 * 三个实例化网格：浮叶、立叶（带叶柄，高出水面并倾斜）、荷花。用 three 自带材质，受场景灯光照明，
 * 因此随 uNight 一起变暗，也会出现在湖面的真实倒影里。第 2 档画质只保留一部分。
 */

/** 荷叶：带一道缺口的圆盘，边缘微微上翘，中心略亮 */
function leafGeometry() {
  const g = new THREE.CircleGeometry(1, 24, 0.2, Math.PI * 2 - 0.4)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const col: number[] = []
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z)
    p.setY(i, 0.16 * r * r - 0.03 + 0.03 * Math.sin(Math.atan2(z, x) * 5) * r)
    const k = 1.12 - 0.22 * r
    col.push(k, k * 1.02, k * 0.95)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

function stem(height: number, radius: number, shade: number) {
  const g = new THREE.CylinderGeometry(radius, radius * 1.2, height, 5, 1, true).translate(0, -height / 2, 0)
  const n = g.attributes.position.count
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(shade), 3))
  return g
}

/** 荷花：两层花瓣（外层张开、内层收拢），花瓣根部偏白、尖端粉红，中间一点莲蓬黄 */
function flowerGeometry() {
  const pink = new THREE.Color(K.flower.day), core = new THREE.Color(K.flowerCore.day), white = new THREE.Color('#FFF4F2')
  const parts: THREE.BufferGeometry[] = []
  const petal = (count: number, tilt: number, len: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const g = new THREE.SphereGeometry(1, 6, 5)
      g.scale(0.34, 0.12, len).translate(0, 0, len * 0.85)
      g.rotateX(-tilt)
      g.rotateY((i / count) * Math.PI * 2 + offset)
      const p = g.attributes.position as THREE.BufferAttribute
      const col: number[] = []
      const c = new THREE.Color()
      for (let k = 0; k < p.count; k++) {
        const t = Math.min(Math.hypot(p.getX(k), p.getZ(k)) / (len * 1.6), 1)
        c.copy(white).lerp(pink, Math.pow(t, 1.3))
        col.push(c.r, c.g, c.b)
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      parts.push(g)
    }
  }
  petal(8, 0.55, 0.55, 0)
  petal(5, 1.05, 0.45, 0.3)
  const pod = new THREE.CylinderGeometry(0.22, 0.14, 0.2, 8).translate(0, 0.12, 0)
  const podCol: number[] = []
  for (let i = 0; i < pod.attributes.position.count; i++) podCol.push(core.r, core.g, core.b)
  pod.setAttribute('color', new THREE.Float32BufferAttribute(podCol, 3))
  parts.push(pod.toNonIndexed())
  const s = stem(K.flowerLift / K.flowerSize, 0.05, 0.42)
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  const merged = mergeGeometries([...nonIndexed, s.toNonIndexed()])
  merged.computeVertexNormals()
  parts.forEach((g) => g.dispose())
  return merged
}

/** 起伏动画：按实例位置给每片叶子一个相位，叶缘比叶心起伏大 */
function sway(material: THREE.MeshStandardMaterial, amount: number) {
  material.onBeforeCompile = (s) => {
    s.uniforms.uTime = shared.uTime
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    float ph = 0.0;
    #ifdef USE_INSTANCING
    ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
    #endif
    float w = uTime * ${K.swaySpeed.toFixed(2)} + ph;
    transformed.y += (sin(w) * 0.5 + sin(w * 1.7 + position.x * 1.3) * position.x * 0.8) * ${amount.toFixed(3)};
  }`)
  }
  material.customProgramCacheKey = () => 'lotus-sway-' + amount.toFixed(3)
}

function noise2(x: number, z: number) {
  const h = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz)
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1)
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }

export function Lotus() {
  const d = useSceneData()
  const tier = usePerfTier((s) => s.tier)

  const meshes = useMemo(() => {
    const q = landmarks.find((l) => l.id === 'quyuan')
    if (!q) return null
    const [qx, qz] = lngLatToScene(q.lng, q.lat)
    const cx = qx + K.center[0], cz = qz + K.center[1]
    const routes = boatRoutes(d)
    let seed = 9127
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const flat: THREE.Matrix4[] = [], stand: THREE.Matrix4[] = [], flowers: THREE.Matrix4[] = []
    const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3(), qt = new THREE.Quaternion(), tilt = new THREE.Quaternion(), e = new THREE.Euler()
    for (let x = cx - K.radius; x <= cx + K.radius; x += K.spacing) for (let z = cz - K.radius; z <= cz + K.radius; z += K.spacing) {
      const px = x + (rand() - 0.5) * K.spacing * 0.9, pz = z + (rand() - 0.5) * K.spacing * 0.9
      const dist = Math.hypot(px - cx, pz - cz)
      if (dist > K.radius || octSDF(px, pz) > -6) continue
      const [u, w] = sceneToUV(px, pz)
      if (sampleMask(d, u, w) < 0.5) continue
      const g = sampleMask(d, u, w, 1)
      if (g < K.shoreMin || g > K.shoreMax) continue
      if (Math.hypot(px - qx, pz - qz) < K.modelClear) continue
      if (routes.some((r) => Math.abs(Math.hypot(px - r.cx, pz - r.cz) - r.r) < K.boatClear)) continue
      const n = noise2(px * K.clusterScale, pz * K.clusterScale) * 0.7 + noise2(px * K.clusterScale * 2.7 + 5, pz * K.clusterScale * 2.7) * 0.3
      if (n < K.clusterCut) continue
      // 片区中心密、边缘稀；离岸越远越稀
      const keep = K.density * (1 - smooth(K.radius * 0.75, K.radius, dist)) * smooth(K.clusterCut, K.clusterCut + 0.1, n) * (1 - smooth(K.shoreMax * 0.7, K.shoreMax, g) * 0.6)
      if (rand() > keep) continue
      const size = K.leafSize[0] + (K.leafSize[1] - K.leafSize[0]) * Math.pow(rand(), 0.8)
      const isStand = rand() < K.standRatio
      const yaw = rand() * Math.PI * 2
      if (isStand) {
        const lift = K.leafLift[0] + (K.leafLift[1] - K.leafLift[0]) * (0.5 + 0.5 * rand())
        e.set((rand() - 0.5) * 0.7, yaw, (rand() - 0.5) * 0.7)
        qt.setFromEuler(e)
        stand.push(new THREE.Matrix4().compose(v.set(px, lift, pz), qt, s.set(size * 0.85, size * 0.85, size * 0.85)))
      } else {
        // 浮叶的高度错开几档，避免相互重叠的叶片闪烁
        const lift = K.leafLift[0] + (flat.length % 7) * 0.035
        qt.setFromAxisAngle(up, yaw)
        tilt.setFromEuler(e.set((rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.08))
        flat.push(new THREE.Matrix4().compose(v.set(px, lift, pz), qt.multiply(tilt), s.set(size, size, size)))
      }
      if (rand() < K.flowerRatio) {
        const fs = K.flowerSize * (0.8 + 0.4 * rand())
        e.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3)
        const ox = (rand() - 0.5) * size, oz = (rand() - 0.5) * size
        flowers.push(new THREE.Matrix4().compose(v.set(px + ox, K.flowerLift * (0.8 + 0.4 * rand()), pz + oz), qt.setFromEuler(e), s.set(fs, fs, fs)))
      }
    }
    // 打乱顺序，第 2 档按 count 截取前一部分时分布仍然均匀
    const shuffle = (a: THREE.Matrix4[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
    const make = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], swayAmount: number, roughness: number) => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, side: THREE.DoubleSide })
      sway(mat, swayAmount)
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1))
      shuffle(list).forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.userData.total = list.length
      return mesh
    }
    const leaf = leafGeometry()
    const standGeo = mergeGeometries([leaf.clone().toNonIndexed(), stem(1.6, 0.05, 0.55).toNonIndexed()])
    standGeo.computeVertexNormals()
    const out = {
      flat: make(leaf, flat, K.sway, 0.75),
      stand: make(standGeo, stand, K.sway * 1.6, 0.7),
      flowers: make(flowerGeometry(), flowers, K.sway * 0.8, 0.6),
    }
    console.info(`[lotus] 浮叶 ${flat.length}，立叶 ${stand.length}，荷花 ${flowers.length}`)
    return out
  }, [d])

  useEffect(() => () => { if (meshes) for (const m of Object.values(meshes)) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } }, [meshes])

  // 第 2 档只画一部分
  useEffect(() => {
    if (!meshes) return
    for (const m of Object.values(meshes)) m.count = Math.round(m.userData.total * (tier >= 2 ? K.lowFraction : 1))
  }, [meshes, tier])

  const flowerNight = useMemo(() => {
    const a = new THREE.Color(K.flower.day), b = new THREE.Color(K.flower.night)
    return new THREE.Color(b.r / Math.max(a.r, 0.01), b.g / Math.max(a.g, 0.01), b.b / Math.max(a.b, 0.01))
  }, [])
  useFrame(() => {
    if (!meshes) return
    lerpColor(K.leaf, (meshes.flat.material as THREE.MeshStandardMaterial).color)
    lerpColor(K.leafEdge, (meshes.stand.material as THREE.MeshStandardMaterial).color)
    // 荷花的颜色在顶点色里，材质色只负责入夜变暗
    ;(meshes.flowers.material as THREE.MeshStandardMaterial).color.setRGB(1, 1, 1).lerp(flowerNight, uNight.value)
  })

  if (!meshes) return null
  return <group>{Object.values(meshes).map((m, i) => <primitive key={i} object={m} />)}</group>
}
