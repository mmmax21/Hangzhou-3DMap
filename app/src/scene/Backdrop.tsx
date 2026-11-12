import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { glslCommon } from '../shaders/common'
import { colorPair, shared } from '../state/night'

const B = style.backdrop

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// 天空渐变加三层远山剪影，像长卷的背景。只取方向，不受相机距离影响
const frag = /* glsl */ `
${glslCommon}
uniform vec3 cTop[2]; uniform vec3 cHorizon[2]; uniform vec3 cFar[2]; uniform vec3 cNear[2];
varying vec3 vDir;
float ridge(float a, float seed, float freq) {
  return fbm(vec2(a * freq + seed, seed * 1.7)) * 0.7 + vnoise(vec2(a * freq * 3.1 + seed, 4.0)) * 0.3;
}
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));      // 仰角（弧度）
  float az = atan(d.z, d.x);
  vec3 col = mix(DNC(cHorizon), DNC(cTop), smoothstep(-0.02, 0.55, el));
  // 远山：越远越淡、越高
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float h = ${B.ridgeBase.toFixed(3)} + (2.0 - fi) * ${B.ridgeStep.toFixed(3)} + (ridge(az, 11.0 + fi * 7.3, 2.2 + fi * 1.1) - 0.5) * ${B.ridgeHeight.toFixed(3)} * (1.0 + (2.0 - fi) * 0.35);
    float m = 1.0 - smoothstep(h - 0.004, h + 0.012, el);
    vec3 c = mix(DNC(cFar), DNC(cNear), fi / 2.0);
    // 山脚溶进雾里
    float haze = smoothstep(h - ${B.hazeDepth.toFixed(3)}, h, el);
    col = mix(col, mix(DNC(cHorizon), c, 0.25 + 0.75 * haze), m * (0.45 + 0.25 * fi));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

/** 包住整个场景的背景球，始终跟随相机 */
export function Backdrop() {
  const ref = useRef<THREE.Mesh>(null!)
  const camera = useThree((s) => s.camera)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          ...shared,
          cTop: colorPair(B.top),
          cHorizon: colorPair(B.horizon),
          cFar: colorPair(B.far),
          cNear: colorPair(B.near),
        },
      }),
    [],
  )
  useFrame(() => ref.current.position.copy(camera.position))
  return (
    <mesh ref={ref} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[B.radius, 48, 24]} />
    </mesh>
  )
}
