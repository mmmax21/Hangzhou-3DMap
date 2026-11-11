import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene } from '../geo/geo'
import { landmarks, useSceneData } from '../data/loaders'
import { lerpColor, uNight } from '../state/night'
import { terrainY } from './terrainHeight'

const L = style.landmarks

/** 阶段 3：景点占位方块，放在校准后的坐标上。阶段 6 替换为 GLB */
export function Landmarks() {
  const d = useSceneData()
  const items = useMemo(
    () =>
      landmarks.map((l) => {
        const [x, z] = lngLatToScene(l.lng, l.lat)
        const y = Math.max(terrainY(d, x, z), 0)
        return { ...l, x, y, z, marker: !l.model }
      }),
    [d],
  )
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), [])
  const markerMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), [])
  const glow = useRef(new THREE.Color())
  useFrame(() => {
    lerpColor(style.colors.placeholder, mat.color)
    markerMat.color.copy(mat.color)
    lerpColor(style.colors.light, glow.current, 1)
    mat.emissive.copy(glow.current).multiplyScalar(uNight.value * L.nightGlow * 0.6)
    markerMat.emissive.copy(mat.emissive)
  })
  const [sx, sy, sz] = L.placeholderSize
  return (
    <group>
      {items.map((it) =>
        it.marker ? (
          <mesh key={it.id} position={[it.x, it.y + 1, it.z]} material={markerMat} userData={{ landmark: it.id }}>
            <cylinderGeometry args={[2.2, 2.2, 2, 16]} />
          </mesh>
        ) : (
          <mesh key={it.id} position={[it.x, it.y + sy / 2, it.z]} material={mat} userData={{ landmark: it.id }}>
            <boxGeometry args={[sx, sy, sz]} />
          </mesh>
        ),
      )}
    </group>
  )
}
