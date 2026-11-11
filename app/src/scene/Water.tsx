import { useMemo } from 'react'
import * as THREE from 'three'
import { style } from '../config/style'
import { TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { useSceneData } from '../data/loaders'
import { colorPair, numPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'

const W = style.water
const C = style.colors

const vert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}
`

const frag = /* glsl */ `
${glslCommon}
uniform sampler2D uMask;
uniform vec2 uSize;
uniform vec3 uMoonDir;
uniform vec3 cWater[2]; uniform vec3 cDeep[2]; uniform vec3 cShore[2];
uniform vec3 cMoonRefl[2]; uniform vec3 cLight[2];
uniform float pRipple[2];
varying vec3 vPos;

void main() {
  if (octSDF(vPos.xz) > -2.0) discard;
  vec2 uv = vPos.xz / uSize + 0.5;
  vec4 m = texture2D(uMask, uv);
  if (m.r < 0.5) discard;
  float depth = m.g;          // 0 岸边 → 1 远离岸边
  vec3 V = normalize(vPos - cameraPosition);

  // 波纹法线（白天几乎为零）
  vec2 p = vPos.xz * ${W.rippleScale.toFixed(3)};
  float t = uTime * 0.15;
  vec2 rip = vec2(vnoise(p * vec2(1.0, 4.0) + t) - 0.5, vnoise(p * vec2(4.0, 1.0) * 1.3 - t) - 0.5);
  vec3 n = normalize(vec3(rip.x * DNF(pRipple), 1.0, rip.y * DNF(pRipple)));

  vec3 col = mix(DNC(cWater), DNC(cDeep), smoothstep(0.05, 0.7, depth));
  col = mix(col, DNC(cShore), (1.0 - smoothstep(0.0, 0.12, depth)) * ${W.shoreTint.toFixed(2)});
  col *= 1.0 + (fbm(vPos.xz * 0.02) - 0.5) * 0.04;

  // 月光倒影带：反射向量对准月亮，沿视线方向拉长
  vec3 R = reflect(V, n);
  vec3 md = normalize(uMoonDir);
  float s = max(dot(normalize(R.xz), normalize(md.xz)), 0.0);
  float elev = 1.0 - abs(R.y - abs(md.y)) * ${W.moonBand.stretch.toFixed(2)};
  float band = pow(s, ${W.moonBand.power.toFixed(1)}) * clamp(elev, 0.0, 1.0);
  band *= 0.5 + 0.8 * vnoise(vPos.xz * vec2(0.6, 0.15) + t * 3.0);
  col += DNC(cMoonRefl) * band * ${W.moonBand.strength.toFixed(2)} * uNight;

  // 岸边灯光的拉长倒影：近岸带上、沿相机方向拉长的暖色条纹
  vec2 vd = normalize(V.xz);
  vec2 vp = vec2(-vd.y, vd.x);
  vec2 sq = vec2(dot(vPos.xz, vp) * 0.9, dot(vPos.xz, vd) * 0.9 / ${W.shoreLights.streak.toFixed(1)});
  float streak = smoothstep(0.7, 0.95, vnoise(sq + vec2(0.0, t)));
  float near = 1.0 - smoothstep(0.0, ${W.shoreLights.reach.toFixed(2)}, depth);
  col += DNC(cLight) * streak * near * ${W.shoreLights.strength.toFixed(2)} * uNight;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function Water() {
  const d = useSceneData()
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          ...shared,
          uMask: { value: d.maskTex },
          uSize: { value: new THREE.Vector2(TERRAIN_W, TERRAIN_D) },
          cWater: colorPair(C.water),
          cDeep: colorPair(C.waterDeep),
          cShore: colorPair(C.waterShore),
          cMoonRefl: colorPair(C.moonReflection),
          cLight: colorPair(C.light),
          pRipple: numPair(W.rippleStrength),
        },
      }),
    [d],
  )
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} material={material}>
      <planeGeometry args={[TERRAIN_W, TERRAIN_D, 1, 1]} />
    </mesh>
  )
}
