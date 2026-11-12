import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { style } from '../config/style'
import { lowQuality } from '../config/quality'
import { TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { useSceneData } from '../data/loaders'
import { colorPair, numPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'

const W = style.water
const C = style.colors

// 高画质用 Reflector 渲染真实倒影（REFLECT），低画质退回只有水色和天光的简化版
const vert = /* glsl */ `
#ifdef REFLECT
uniform mat4 textureMatrix;
varying vec4 vRefl;
#endif
varying vec3 vPos;
void main() {
#ifdef REFLECT
  vRefl = textureMatrix * vec4(position, 1.0);
#endif
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
uniform vec3 cMoonRefl[2]; uniform vec3 cLight[2]; uniform vec3 cFar[2]; uniform vec3 cGlint[2];
uniform float pRipple[2]; uniform float pReflect[2];
#ifdef REFLECT
uniform sampler2D tDiffuse;
varying vec4 vRefl;
#endif
varying vec3 vPos;

void main() {
  if (octSDF(vPos.xz) > -2.0) discard;
  vec2 uv = vPos.xz / uSize + 0.5;
  vec4 m = texture2D(uMask, uv);
  if (m.r < 0.5) discard;
  float depth = m.g;          // 0 岸边 → 1 远离岸边
  vec3 V = normalize(vPos - cameraPosition);

  // 波纹法线：两层不同方向、不同速度的噪声叠加，近岸更平静
  vec2 p = vPos.xz * ${W.rippleScale.toFixed(3)};
  float t = uTime * ${W.rippleSpeed.toFixed(3)};
  vec2 rip = vec2(
    vnoise(p * vec2(1.0, 3.5) + vec2(t, t * 0.6)) + 0.5 * vnoise(p * vec2(2.3, 7.0) + vec2(-t * 1.3, t)) - 0.75,
    vnoise(p * vec2(3.5, 1.0) * 1.2 + vec2(-t, t * 0.4)) + 0.5 * vnoise(p * vec2(7.0, 2.3) - vec2(t, -t * 1.2)) - 0.75);
  float amp = DNF(pRipple) * (0.3 + 0.7 * smoothstep(0.0, 0.25, depth));
  vec3 n = normalize(vec3(rip.x * amp, 1.0, rip.y * amp));

  // 水体本色：深处偏青，近岸带一点岸上的绿
  vec3 col = mix(DNC(cWater), DNC(cDeep), smoothstep(0.05, 0.7, depth));
  col = mix(col, DNC(cShore), (1.0 - smoothstep(0.0, 0.12, depth)) * ${W.shoreTint.toFixed(2)});
  col *= 1.0 + (fbm(vPos.xz * 0.02) - 0.5) * 0.04;

  float cosT = max(dot(-V, n), 0.0);
  float fres = pow(1.0 - cosT, 3.0);
#ifdef REFLECT
  // 真实倒影：按波纹法线扰动，并沿竖直方向取几次样，得到被水面拉长的倒影
  vec2 dis = n.xz * ${W.distort.toFixed(3)};
  vec3 refl = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float k = float(i) / 3.0;
    vec4 q = vRefl;
    q.xy += (dis * (0.6 + 0.8 * k) + vec2(0.0, (k - 0.5) * ${W.stretch.toFixed(4)})) * q.w;
    refl += texture2DProj(tDiffuse, q).rgb;
  }
  refl *= 0.25;
  // 菲涅耳：俯视看到水色，掠射看到倒影
  float F = mix(${W.reflectBase.toFixed(2)}, 1.0, fres) * DNF(pReflect);
  col = mix(col, refl, clamp(F, 0.0, 1.0));
#else
  col = mix(col, DNC(cFar), pow(1.0 - cosT, 4.0) * ${W.farTint.toFixed(2)});
#endif

  // 白天的波光：太阳在波纹上的高光
  vec3 R = reflect(V, n);
  float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), ${W.glintPower.toFixed(1)});
  col += DNC(cGlint) * spec * ${W.glint.toFixed(2)} * (1.0 - uNight);

  // 月光倒影：从相机朝月亮方位延伸的一条窄带，按角宽度计算（近窄远宽符合透视），再切成横向碎光
  vec3 md = normalize(uMoonDir);
  vec2 mdir = normalize(md.xz);
  vec2 toP = vPos.xz - cameraPosition.xz;
  float alongM = dot(toP, mdir);
  float lateral = abs(toP.x * mdir.y - toP.y * mdir.x);
  float ang = lateral / max(alongM, 1.0);
  float band = exp(-pow(ang / ${W.moonBand.width.toFixed(3)}, 2.0)) * step(0.0, alongM);
  float glint = smoothstep(0.45, 0.85, vnoise(vec2(alongM * ${W.moonBand.breakFreq.toFixed(2)}, lateral * 0.12) + vec2(t * 2.0, 0.0)));
  glint *= 0.6 + 0.6 * vnoise(vPos.xz * 0.9 - t);
  col += DNC(cMoonRefl) * band * glint * ${W.moonBand.strength.toFixed(2)} * uNight;

  // 岸边灯光的拉长倒影。有真实倒影时只留一点作补充
  vec2 vd = normalize(V.xz);
  vec2 vp = vec2(-vd.y, vd.x);
  vec2 sq = vec2(dot(vPos.xz, vp) * 0.9, dot(vPos.xz, vd) * 0.9 / ${W.shoreLights.streak.toFixed(1)});
  float streak = smoothstep(0.7, 0.95, vnoise(sq + vec2(0.0, t)));
  float near = 1.0 - smoothstep(0.0, ${W.shoreLights.reach.toFixed(2)}, depth);
#ifdef REFLECT
  near *= 0.45;
#endif
  col += DNC(cLight) * streak * near * ${W.shoreLights.strength.toFixed(2)} * lightsOn(vPos.xz, 0.5);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

function waterUniforms(maskTex: THREE.Texture) {
  return {
    ...shared,
    uMask: { value: maskTex },
    uSize: { value: new THREE.Vector2(TERRAIN_W, TERRAIN_D) },
    cWater: colorPair(C.water),
    cDeep: colorPair(C.waterDeep),
    cShore: colorPair(C.waterShore),
    cMoonRefl: colorPair(C.moonReflection),
    cLight: colorPair(C.light),
    cFar: colorPair(C.waterFar),
    cGlint: colorPair(C.sunGlint),
    pRipple: numPair(W.rippleStrength),
    pReflect: numPair(W.reflect),
  }
}

function SimpleWater() {
  const d = useSceneData()
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: waterUniforms(d.maskTex) }), [d])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} material={material}>
      <planeGeometry args={[TERRAIN_W, TERRAIN_D, 1, 1]} />
    </mesh>
  )
}

function ReflectiveWater() {
  const d = useSceneData()
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const w = Math.max(256, Math.round(size.width * dpr * W.reflectResolution))
  const h = Math.max(256, Math.round(size.height * dpr * W.reflectResolution))
  const water = useMemo(() => {
    const r = new Reflector(new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_D, 1, 1), {
      textureWidth: w, textureHeight: h, clipBias: 0.003, multisample: 2,
      // Reflector 会克隆这里的 uniforms，所以先只给它需要的三项，其余在构造后挂上，保持与全局共享
      shader: { name: 'WestLakeWater', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } }, vertexShader: vert, fragmentShader: frag },
    })
    const mat = r.material as THREE.ShaderMaterial
    Object.assign(mat.uniforms, waterUniforms(d.maskTex))
    mat.defines = { REFLECT: '' }
    mat.needsUpdate = true
    r.rotation.x = -Math.PI / 2
    r.frustumCulled = false
    return r
  }, [d, w, h])
  useEffect(() => () => { water.dispose(); water.geometry.dispose() }, [water])
  return <primitive object={water} />
}

export function Water() {
  return lowQuality ? <SimpleWater /> : <ReflectiveWater />
}
