import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { glslCommon } from '../shaders/common'
import { colorPair, lerp, lerpColor, shared, uNight } from '../state/night'

const Lg = style.lighting
const _v0 = new THREE.Vector3()
const _v1 = new THREE.Vector3()

/** 背景色、three.js 灯光（给 GLB 用）、共享 uniforms 的逐帧更新，全部由 uNight 插值 */
export function Atmosphere() {
  const scene = useThree((s) => s.scene)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const dir = useRef<THREE.DirectionalLight>(null!)
  const bg = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    shared.uTime.value += dt
    const t = uNight.value
    scene.background = lerpColor(style.colors.background, bg)
    _v0.set(...Lg.sunDir.day).normalize()
    _v1.set(...Lg.sunDir.night).normalize()
    shared.uSunDir.value.copy(_v0).lerp(_v1, t).normalize()
    if (hemi.current) {
      lerpColor(Lg.hemiSky, hemi.current.color)
      lerpColor(Lg.hemiGround, hemi.current.groundColor)
      hemi.current.intensity = lerp(Lg.hemiIntensity)
    }
    if (dir.current) {
      lerpColor(Lg.sunColor, dir.current.color)
      dir.current.intensity = lerp(Lg.dirIntensity)
      dir.current.position.copy(shared.uSunDir.value).multiplyScalar(1000)
    }
  })
  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={dir} />
      <Moon />
    </>
  )
}

const moonFrag = /* glsl */ `
${glslCommon}
uniform vec3 cMoon[2];
uniform float uGlow;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;           // 0 中心 → 1 面片边缘
  float disc = 1.0 - smoothstep(0.30, 0.315, r);
  float mare = fbm(c * 9.0 + 2.0);
  vec3 col = DNC(cMoon) * uGlow * (0.88 + 0.2 * mare) * disc;
  float halo = pow(max(1.0 - r, 0.0), 2.5) * 0.35 * (1.0 - disc);
  col += DNC(cMoon) * halo;
  float a = max(disc, halo) * uNight;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * uNight, 1.0);
}
`

function Moon() {
  const ref = useRef<THREE.Mesh>(null!)
  const camera = useThree((s) => s.camera)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: moonFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...shared, cMoon: colorPair(style.colors.moon), uGlow: { value: style.moon.glow } },
      }),
    [],
  )
  useFrame(() => {
    // 月亮固定在画面右上方（作为背景），方向同步给水面倒影
    const m = ref.current
    const cam = camera as THREE.PerspectiveCamera
    const ty = Math.tan((cam.fov * Math.PI) / 360)
    const tx = ty * cam.aspect
    _v0.set(style.moon.screen[0] * tx, style.moon.screen[1] * ty, -1).applyQuaternion(cam.quaternion).normalize()
    shared.uMoonDir.value.copy(_v0)
    m.position.copy(cam.position).addScaledVector(_v0, style.moon.distance)
    m.quaternion.copy(camera.quaternion)
    m.visible = uNight.value > 0.001
  })
  const s = style.moon.size * 3.2
  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[s, s]} />
    </mesh>
  )
}
