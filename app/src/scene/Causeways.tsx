import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { style } from '../config/style'
import { bridges, causeways, inBridge, pointAt } from '../data/causeways'
import { uNight } from '../state/night'
import { injectTerrainShade, requestShadowUpdate } from '../state/shadows'
import { OCT } from './terrainHeight'

const L = style.landmarks
const C = style.causeways

/** 与 GLSL 的 lightsOn 一致：越靠东越早亮 */
function lightsOn(x: number) {
  const k = Math.min(Math.max(x / OCT.hx * 0.5 + 0.5, 0), 1), d = (1 - k) * 0.55 + 0.05, t = Math.min(Math.max((uNight.value - d) / 0.3, 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * 阶段 10：苏堤六桥和锦带桥，共七座，用 duanqiao.glb 实例化，一次绘制调用。
 * 断桥本身仍是景点模型（Landmarks.tsx），这里不画。桥按堤的切线方向摆放，桥脚落在水面（y = 0），桥下是 loaders 开出的水道。
 */
export function CausewayBridges() {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/duanqiao.glb`)
  const list = useMemo(() => bridges.filter((b) => !b.landmark), [])
  const mesh = useMemo(() => {
    const scene = gltf.scene.clone(true)
    scene.updateMatrixWorld(true)
    let src: THREE.Mesh | null = null
    scene.traverse((o) => { if (!src && o instanceof THREE.Mesh) src = o })
    if (!src) return null
    const m = src as THREE.Mesh
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
    // 归一化：长轴 x 缩放到 1，底部落在 y = 0，中心在原点
    const norm = new THREE.Matrix4().makeScale(1 / size.x, 1 / size.x, 1 / size.x)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z))
      .multiply(m.matrixWorld)
    const geo = m.geometry.clone().applyMatrix4(norm)
    const mat = (m.material as THREE.MeshStandardMaterial).clone()
    mat.roughness = L.modelRoughness; mat.metalness = 0; mat.metalnessMap = null; mat.roughnessMap = null; mat.emissiveMap = mat.map
    mat.emissive.set(style.colors.light.night)
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uModelSaturation = { value: L.modelSaturation }
      shader.uniforms.uModelGain = { value: L.modelGain }
      shader.fragmentShader = 'uniform float uModelSaturation;\nuniform float uModelGain;\n' + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))), diffuseColor.rgb, uModelSaturation) * uModelGain;')
      injectTerrainShade(shader)
    }
    mat.customProgramCacheKey = () => 'bridge-grade'
    const inst = new THREE.InstancedMesh(geo, mat, list.length)
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4()
    list.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rotation)
      M.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.length, b.length, b.length * C.bridgeWidth))
      inst.setMatrixAt(i, M)
    })
    inst.instanceMatrix.needsUpdate = true
    inst.castShadow = inst.receiveShadow = true
    inst.computeBoundingSphere()
    return inst
  }, [gltf, list])
  useEffect(() => { requestShadowUpdate(); return () => { if (mesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() } } }, [mesh])
  // 夜晚桥身微亮，取各桥位置的平均点亮进度
  const meanX = useMemo(() => list.reduce((a, b) => a + b.x, 0) / Math.max(list.length, 1), [list])
  useFrame(() => { if (mesh) (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = lightsOn(meanX) * L.nightGlow * C.bridgeGlow })
  if (!mesh) return null
  return <primitive object={mesh} />
}

/**
 * 苏堤、白堤的点击拾取体：沿堤的一串不可见长方体（不写颜色和深度），挂在景点 Marker 下面，
 * 悬停显示名称、点击飞过去的逻辑沿用 Marker。断桥那一段留空，让断桥自己的模型接收点击。
 */
export function CausewayPick({ id, origin }: { id: string; origin: [number, number, number] }) {
  const geometry = useMemo(() => {
    const cw = causeways.find((c) => c.id === id)
    if (!cw) return null
    const parts: THREE.BufferGeometry[] = []
    const step = 6
    for (let s = 0; s < cw.length; s += step) {
      const mid = s + step / 2
      const br = inBridge(cw, mid)
      if (br?.landmark) continue
      const p = pointAt(cw, mid)
      const g = new THREE.BoxGeometry(step + 0.5, C.pick, C.halfWidth * 2)
      g.rotateY(Math.atan2(-p.tz, p.tx))
      g.translate(p.x - origin[0], C.pick / 2 - origin[1], p.z - origin[2])
      parts.push(g)
    }
    const merged = mergeGeometries(parts)
    parts.forEach((g) => g.dispose())
    return merged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, origin[0], origin[1], origin[2]])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), [])
  useEffect(() => () => { geometry?.dispose(); material.dispose() }, [geometry, material])
  if (!geometry) return null
  return <mesh geometry={geometry} material={material} />
}
