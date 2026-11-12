import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene } from '../geo/geo'
import { colorPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'

const K = style.skyLanterns

const vert = /* glsl */ `
${glslCommon}
uniform float uScale;
attribute float aSeed;
varying float vFade;
varying float vSeed;
void main() {
  vSeed = aSeed;
  // 每盏灯循环上升：从水面附近升到高空后淡出，再从头开始
  float t = fract(uTime * ${K.speed.toFixed(4)} * (0.7 + 0.6 * aSeed) + aSeed * 7.31);
  vec3 p = position;
  p.y += t * ${K.rise.toFixed(1)};
  p.x += sin(uTime * 0.21 + aSeed * 40.0) * ${K.sway.toFixed(1)} + t * ${K.drift.toFixed(1)};
  p.z += cos(uTime * 0.17 + aSeed * 23.0) * ${K.sway.toFixed(1)};
  vFade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.7, 1.0, t)) * lightsOn(position.xz, aSeed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = ${K.size.toFixed(1)} * (0.7 + 0.6 * aSeed) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const frag = /* glsl */ `
${glslCommon}
uniform vec3 cLight[2];
varying float vFade;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // 灯身略高于宽，中心亮、外圈是柔和的光晕
  float r = length(c * vec2(2.3, 1.9));
  float core = smoothstep(0.42, 0.18, r);
  float halo = pow(max(1.0 - r, 0.0), 2.0) * 0.5;
  float flick = 0.85 + 0.15 * sin(uTime * 3.0 + vSeed * 50.0);
  vec3 col = DNC(cLight) * (core * ${K.glow.toFixed(2)} + halo) * flick * vFade;
  gl_FragColor = vec4(col, 1.0);
}
`

/** 孔明灯：夜晚从湖面一带缓缓升起 */
export function SkyLanterns() {
  const geometry = useMemo(() => {
    const [lx, lz] = lngLatToScene(120.143, 30.244)
    let s = 9173
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
    const pos: number[] = [], seeds: number[] = []
    for (let i = 0; i < K.count; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * K.radius
      pos.push(lx + Math.cos(a) * r, 6 + rand() * 10, lz + Math.sin(a) * r)
      seeds.push(rand())
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
    return g
  }, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...shared, cLight: colorPair(style.colors.light), uScale: { value: 400 } },
  }), [])
  useFrame(({ camera, gl }) => {
    const cam = camera as THREE.PerspectiveCamera
    material.uniforms.uScale.value = gl.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360))
  })
  return <points geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />
}
