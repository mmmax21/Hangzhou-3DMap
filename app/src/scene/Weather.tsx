import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { style } from '../config/style'
import { lowQuality } from '../config/quality'
import { shared } from '../state/night'
import { weather } from '../state/weather'
import { glslCommon } from '../shaders/common'

const K = style.weather

const vert = /* glsl */ `
${glslCommon}
uniform vec3 uCenter; uniform float uAmount; uniform float uSnow; uniform float uScale;
attribute float aSeed;
varying float vA;
void main() {
  vec3 box = vec3(${(K.radius * 2).toFixed(1)}, ${K.height.toFixed(1)}, ${(K.radius * 2).toFixed(1)});
  float speed = mix(${K.petalSpeed.toFixed(2)}, ${K.snowSpeed.toFixed(2)}, uSnow) * (0.6 + 0.8 * aSeed);
  // 粒子固定在世界里，只是活动范围跟着镜头注视点走
  vec3 w;
  w.x = uCenter.x + (fract(position.x - uCenter.x / box.x) - 0.5) * box.x;
  w.z = uCenter.z + (fract(position.z - uCenter.z / box.z) - 0.5) * box.z;
  float fy = fract(position.y - uTime * speed / box.y);
  w.y = fy * box.y;
  float sway = mix(${K.petalSway.toFixed(1)}, ${K.snowSway.toFixed(1)}, uSnow);
  w.x += sin(uTime * 0.9 + aSeed * 31.0) * sway;
  w.z += cos(uTime * 0.7 + aSeed * 17.0) * sway;
  // 用 seed 决定这一粒是否出现，强度越大粒子越多
  vA = step(fract(aSeed * 7.13), uAmount) * smoothstep(0.0, 0.08, fy) * (1.0 - smoothstep(0.9, 1.0, fy));
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_PointSize = min(mix(${K.petalSize.toFixed(2)}, ${K.snowSize.toFixed(2)}, uSnow) * (0.6 + 0.8 * aSeed) * uScale / -mv.z, ${K.maxPx.toFixed(1)} * uScale / 400.0);
  gl_Position = projectionMatrix * mv;
}
`
const frag = /* glsl */ `
${glslCommon}
uniform float uSnow; uniform vec3 uSnowColor; uniform vec3 uPetalColor;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, r) * vA;
  vec3 col = mix(uPetalColor, uSnowColor, uSnow) * mix(1.0, 0.6, uNight);
  gl_FragColor = vec4(col, a * ${K.opacity.toFixed(2)});
  #include <colorspace_fragment>
}
`

/** 雪和落花。平时不显示，由导览按站打开 */
export function Weather() {
  const ref = useRef<THREE.Points>(null!)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const geometry = useMemo(() => {
    const n = lowQuality ? Math.round(K.count / 2) : K.count
    let s = 7741
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
    const pos: number[] = [], seeds: number[] = []
    for (let i = 0; i < n; i++) { pos.push(rand(), rand(), rand()); seeds.push(rand()) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
    return g
  }, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    uniforms: {
      ...shared, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uSnow: { value: 0 }, uScale: { value: 400 },
      uSnowColor: { value: new THREE.Color(K.snowColor) }, uPetalColor: { value: new THREE.Color(K.petalColor) },
    },
  }), [])
  useFrame(({ camera, gl }) => {
    const amount = Math.max(weather.snow, weather.petals)
    ref.current.visible = amount > 0.01
    if (!ref.current.visible) return
    const cam = camera as THREE.PerspectiveCamera
    material.uniforms.uScale.value = gl.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360))
    material.uniforms.uAmount.value = amount
    material.uniforms.uSnow.value = weather.snow / (weather.snow + weather.petals + 1e-4)
    if (controls) material.uniforms.uCenter.value.copy(controls.target)
  })
  return <points ref={ref} geometry={geometry} material={material} renderOrder={4} frustumCulled={false} />
}
