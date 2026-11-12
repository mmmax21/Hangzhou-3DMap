import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene } from '../geo/geo'
import { sampleMask, useSceneData } from '../data/loaders'
import { sceneToUV } from '../geo/geo'
import { colorPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'
import { glslShadow, shadowUniforms } from '../state/shadows'
import { octSDF, terrainY } from './terrainHeight'

const R = style.roads
const C = style.colors

// ---------------------------------------------------------------- 道路：白天浅色小路，夜晚暖色灯带
const roadVert = /* glsl */ `
varying vec3 vPos;
void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const roadFrag = /* glsl */ `
${glslCommon}
${glslShadow}
uniform vec3 cRoad[2]; uniform vec3 cLight[2];
varying vec3 vPos;
void main() {
  if (octSDF(vPos.xz) > -6.0) discard;
  vec3 col = mix(DNC(cRoad), DNC(cLight) * ${R.nightGlow.toFixed(2)}, uNight * ${R.nightMix.toFixed(2)});
  float shade = groundShade(vPos.xz); // 阶段 8：路面跟随地面一起进影
  col *= (1.0 - shade * 0.55) * shadeTint(shade);
  float a = mix(${R.dayOpacity.toFixed(2)}, ${R.nightOpacity.toFixed(2)}, uNight);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`

export function Roads() {
  const d = useSceneData()
  const geometry = useMemo(() => {
    const { origin, scale, roads } = d.roads
    const pos: number[] = []
    const step = 3
    for (const item of roads) {
      const w = (R.width[item[0] as string] ?? 1) / 2
      // 只保留主干道和环湖道路，避免像导航地图
      const keepAll = (R.keepClasses as readonly string[]).includes(item[0] as string)
      const pts: [number, number][] = []
      for (let i = 1; i + 1 < item.length; i += 2) {
        pts.push(lngLatToScene(origin[0] + (item[i] as number) * scale, origin[1] + (item[i + 1] as number) * scale))
      }
      // 细分，便于贴合地形
      const dense: [number, number][] = []
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step))
        for (let k = 0; k < n; k++) dense.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n])
      }
      dense.push(pts[pts.length - 1])
      for (let i = 0; i < dense.length - 1; i++) {
        const [x0, z0] = dense[i], [x1, z1] = dense[i + 1]
        if (octSDF(x0, z0) > -6) continue
        if (!keepAll) {
          const [u, v] = sceneToUV(x0, z0)
          if (sampleMask(d, u, v, 2) > R.lakeReach) continue
        }
        const len = Math.hypot(x1 - x0, z1 - z0) || 1
        const nx = (-(z1 - z0) / len) * w, nz = ((x1 - x0) / len) * w
        const y0 = terrainY(d, x0, z0) + R.lift, y1 = terrainY(d, x1, z1) + R.lift
        pos.push(x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz)
        pos.push(x0 - nx, y0, z0 - nz, x1 - nx, y1, z1 - nz, x1 + nx, y1, z1 + nz)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeBoundingSphere()
    return g
  }, [d])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: roadVert,
        fragmentShader: roadFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: { ...shared, ...shadowUniforms, cRoad: colorPair(C.road), cLight: colorPair(C.light) },
      }),
    [],
  )
  return <mesh geometry={geometry} material={material} renderOrder={1} />
}

// ---------------------------------------------------------------- 湖岸灯点（只在夜晚）
const ptVert = /* glsl */ `
uniform float uSize;
uniform float uScale;
attribute float aSeed;
varying float vSeed;
varying vec2 vXZ;
void main() {
  vSeed = aSeed;
  vXZ = position.xz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const ptFrag = /* glsl */ `
${glslCommon}
uniform vec3 cLight[2];
uniform float uGlow;
varying float vSeed;
varying vec2 vXZ;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  a = a * a;
  float flick = 0.85 + 0.15 * sin(uTime * 2.0 + vSeed * 40.0);
  gl_FragColor = vec4(DNC(cLight) * uGlow * a * flick * lightsOn(vXZ, vSeed), 1.0);
}
`

export function ShoreLights() {
  const d = useSceneData()
  const geometry = useMemo(() => {
    const [lx, lz] = lngLatToScene(120.141, 30.246)
    const pos: number[] = []
    const seeds: number[] = []
    const sp = style.shoreLights.spacing
    for (const f of d.water.features) {
      const g = f.geometry
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][]
      for (const poly of polys) {
        for (const ring of poly) {
          const pts = ring.map(([lng, lat]) => lngLatToScene(lng, lat))
          let acc = 0
          for (let i = 0; i < pts.length - 1; i++) {
            const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]
            const len = Math.hypot(x1 - x0, z1 - z0)
            while (acc < len) {
              const t = acc / len
              const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t
              if (Math.hypot(x - lx, z - lz) < 330 && octSDF(x, z) < -10) {
                pos.push(x, Math.max(terrainY(d, x, z), 0) + 1.2, z)
                seeds.push(Math.random())
              }
              acc += sp
            }
            acc -= len
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
    return geo
  }, [d])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ptVert,
        fragmentShader: ptFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          ...shared,
          cLight: colorPair(C.light),
          uSize: { value: style.shoreLights.size },
          uScale: { value: 400 },
          uGlow: { value: style.shoreLights.glow },
        },
      }),
    [],
  )
  useFrame(({ camera, gl }) => {
    const cam = camera as THREE.PerspectiveCamera
    // 世界尺寸 -> 像素：缓冲区高度 / (2 tan(fov/2))
    material.uniforms.uScale.value = gl.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360))
  })
  return <points geometry={geometry} material={material} renderOrder={2} />
}
