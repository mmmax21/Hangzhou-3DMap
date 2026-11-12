import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from '../config/style'
import { TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { useSceneData } from '../data/loaders'
import { glslCommon } from '../shaders/common'
import { lerp, shared } from '../state/night'
import { usePerfTier } from '../state/perf'
import { shadowState, shadowUniforms } from '../state/shadows'

const S = style.shadows

/**
 * 阶段 8：日光投影的调度。见 state/shadows.ts 的说明。
 * - 第 2 档画质关闭阴影贴图和地面遮罩。
 * - 阴影贴图和遮罩只在主光方向变化、物体加载或开场生长期间重算；平时每帧零额外绘制。
 */

const maskVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const maskFrag = /* glsl */ `
${glslCommon}
#include <packing>
uniform sampler2D uHeight;
uniform float uWaterLevel;
uniform vec2 uSize;
uniform sampler2D uMap;
uniform mat4 uMatrix;
uniform vec2 uTexel;
uniform float uDepthBias;
uniform float uHasMap;
uniform vec3 uSun;
varying vec2 vUv;

// 地面高度（场景单位），与 terrainHeight.ts 的 terrainY 一致；水面以 0 计
float groundY(vec2 uv) {
  vec2 xz = (uv - 0.5) * uSize;
  float y = terrainYm(texture2D(uHeight, uv).r, uWaterLevel) * 0.1;
  float f = smoothstep(0.0, ${style.terrain.edgeFalloff.toFixed(1)}, -octSDF(xz));
  return max(${style.base.topY.toFixed(2)} + (y - ${style.base.topY.toFixed(2)}) * f, 0.0);
}
float cmp(vec2 uv, float z) { return step(z, unpackRGBAToDepth(texture2D(uMap, uv))); }
float cmpBilinear(vec2 uv, float z) {
  vec2 p = uv / uTexel - 0.5;
  vec2 f = fract(p);
  vec2 c = (floor(p) + 0.5) * uTexel;
  return mix(mix(cmp(c, z), cmp(c + vec2(uTexel.x, 0.0), z), f.x), mix(cmp(c + vec2(0.0, uTexel.y), z), cmp(c + uTexel, z), f.x), f.y);
}

void main() {
  vec2 xz = (vUv - 0.5) * uSize;
  float y0 = groundY(vUv);

  // R：物体投到地面的影子，4×4 的双线性 PCF，取样间距较大，边缘很柔
  float lit = 1.0;
  if (uHasMap > 0.5) {
    vec4 sc = uMatrix * vec4(xz.x, y0, xz.y, 1.0);
    sc.xyz /= sc.w;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float z = sc.z - uDepthBias;
      float s = 0.0;
      for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
        vec2 o = (vec2(float(i), float(j)) - 1.5) * uTexel * ${S.maskSoft.toFixed(2)};
        s += cmpBilinear(sc.xy + o, z);
      }
      lit = s / 16.0;
    }
  }

  // G：山体投影与背光面。沿主光方向在高度图上步进，按最小仰角差求柔和的遮蔽
  vec3 L = normalize(uSun);
  float lh = max(length(L.xz), 1e-4);
  vec2 dir = L.xz / lh;
  float tanE = L.y / lh;
  float res = 1.0;
  for (int i = 0; i < ${S.occSteps}; i++) {
    float k = (float(i) + 1.0) / ${S.occSteps.toFixed(1)};
    float t = ${S.occDistance.toFixed(1)} * k * k + 0.8;
    vec2 uvp = (xz + dir * t) / uSize + 0.5;
    if (uvp.x < 0.0 || uvp.x > 1.0 || uvp.y < 0.0 || uvp.y > 1.0) break;
    float ray = y0 + 0.3 + t * tanE;
    res = min(res, ${S.occSoft.toFixed(1)} * (ray - groundY(uvp)) / t + 0.5);
  }
  float occ = smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));

  gl_FragColor = vec4(lit, occ, 0.0, 1.0);
}
`

const corners = (() => {
  const out: THREE.Vector3[] = []
  for (const x of [-TERRAIN_W / 2, TERRAIN_W / 2]) for (const y of [-2, S.casterTop]) for (const z of [-TERRAIN_D / 2, TERRAIN_D / 2]) out.push(new THREE.Vector3(x, y, z))
  return out
})()
const _v = new THREE.Vector3()
const _helper = new THREE.OrthographicCamera() // 必须是相机：Object3D.lookAt 让 +z 朝向目标，相机是 -z
const _inv = new THREE.Matrix4()

/** 把阴影相机拟合到整个沙盘（按光源方向旋转后的包围盒） */
function fitShadowCamera(light: THREE.DirectionalLight, sun: THREE.Vector3) {
  _helper.position.copy(sun).normalize().multiplyScalar(1000)
  _helper.lookAt(0, 0, 0)
  _helper.updateMatrixWorld(true)
  _inv.copy(_helper.matrixWorld).invert()
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  for (const c of corners) { _v.copy(c).applyMatrix4(_inv); min.min(_v); max.max(_v) }
  const cam = light.shadow.camera
  const m = 4
  cam.left = min.x - m; cam.right = max.x + m; cam.bottom = min.y - m; cam.top = max.y + m
  cam.near = Math.max(1, -max.z - m); cam.far = -min.z + m
  cam.updateProjectionMatrix()
  return cam.far - cam.near
}

export function Shadows() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const d = useSceneData()
  const tier = usePerfTier((s) => s.tier)
  // 开发调试：window.__shadows(false) 完全关闭投影（等同第 2 档的投影部分），用于前后对比
  const [userEnabled, setUserEnabled] = useState(true)
  const enabled = tier < 2 && userEnabled

  // 尽早打开，避免材质先按无阴影编译一遍
  gl.shadowMap.enabled = enabled
  gl.shadowMap.type = THREE.PCFShadowMap
  gl.shadowMap.autoUpdate = false

  const pass = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(S.maskSize, S.maskSize, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false })
    rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping
    const material = new THREE.ShaderMaterial({
      vertexShader: maskVert, fragmentShader: maskFrag, depthTest: false, depthWrite: false,
      uniforms: {
        ...shared,
        uHeight: { value: d.heightTex },
        uWaterLevel: { value: d.meta.waterLevel },
        uSize: { value: new THREE.Vector2(TERRAIN_W, TERRAIN_D) },
        uMap: { value: null as THREE.Texture | null },
        uMatrix: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / S.mapSize, 1 / S.mapSize) },
        uDepthBias: { value: 0.001 },
        uHasMap: { value: 0 },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
      },
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(quad)
    return { rt, material, quad, quadScene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [d])
  // 开发调试：统计阴影贴图真正重画的次数（含湖面倒影那一遍 render 调用里的），验证没有每帧重复计算
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const sm = gl.shadowMap as THREE.WebGLShadowMap & { render: (...a: unknown[]) => void }
    const orig = sm.render
    const stats = { renderCalls: 0, mapRenders: 0, maskRenders: 0 }
    ;(window as unknown as Record<string, unknown>).__shadowStats = stats
    ;(window as unknown as Record<string, unknown>).__shadowDebug = { gl, rt: pass.rt }
    sm.render = function (this: typeof sm, ...a: unknown[]) {
      stats.renderCalls++
      if (sm.enabled && (sm.autoUpdate || sm.needsUpdate) && (a[0] as unknown[]).length) stats.mapRenders++
      return orig.apply(this, a)
    }
    pass.material.onBeforeRender = () => { stats.maskRenders++ }
    return () => { sm.render = orig }
  }, [gl, pass])
  useEffect(() => () => { pass.rt.dispose(); pass.material.dispose(); pass.quad.geometry.dispose() }, [pass])

  const st = useRef({ phase: 0, lastDir: new THREE.Vector3(9, 9, 9), lastUpdate: -1e9, lastPeriodic: -1e9, t0: performance.now() / 1000, maskReady: false, sun: new THREE.Vector3(), range: 1000 })

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__shadows = (on: boolean) => setUserEnabled(on)
    shadowState.dirty = true
    st.current.maskReady = false
  }, [enabled])

  useFrame(() => {
    const light = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined
    if (!light) return
    const s = st.current
    const on = enabled
    if (light.castShadow !== enabled) light.castShadow = enabled // 切换会让材质重编译，只随档位（和调试开关）变化
    const strength = lerp(S.strength), terrainStrength = lerp(S.terrainStrength)
    light.shadow.intensity = on ? strength : 0
    shadowUniforms.uShadowStrength.value = on && s.maskReady ? strength : 0
    shadowUniforms.uTerrainShadow.value = on && s.maskReady ? terrainStrength : 0
    if (!enabled) return

    if (light.shadow.mapSize.x !== S.mapSize) {
      light.shadow.mapSize.set(S.mapSize, S.mapSize)
      light.shadow.map?.dispose(); light.shadow.map = null
    }
    light.shadow.radius = S.radius
    light.shadow.bias = S.bias
    light.shadow.normalBias = S.normalBias
    light.shadow.autoUpdate = true // 是否重画由 renderer.shadowMap.needsUpdate 统一控制
    shadowUniforms.uShadowMatrix.value = light.shadow.matrix

    // 上一帧画好了阴影贴图：据此生成地面遮罩
    if (s.phase === 1) {
      s.phase = 0
      const map = light.shadow.map
      if (!map) { shadowState.dirty = true; return }
      shadowUniforms.uShadowMap.value = map.texture
      const u = pass.material.uniforms
      u.uMap.value = map.texture
      u.uMatrix.value.copy(light.shadow.matrix)
      u.uHasMap.value = 1
      u.uDepthBias.value = S.maskBias / s.range
      u.uSun.value.copy(s.sun)
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(pass.rt)
      gl.render(pass.quadScene, pass.cam)
      gl.setRenderTarget(prev)
      shadowUniforms.uShadowMask.value = pass.rt.texture
      s.maskReady = true
      return
    }

    const now = performance.now() / 1000
    const sun = shared.uSunDir.value
    const age = now - s.t0
    const dirChanged = s.lastDir.angleTo(sun) > S.minAngle
    // 开场生长期间每 0.25 秒重画一次；之后 20 秒内每 2 秒补一次（模型陆续加载）；再之后只在需要时重画
    const periodic = age < style.entrance.duration + 1 ? 0.25 : age < 20 ? 2 : Infinity
    const want = shadowState.dirty || dirChanged || now - s.lastPeriodic > periodic
    if (!want || strength < 0.01) return
    if (dirChanged && s.maskReady && now - s.lastUpdate < S.interval) return
    s.range = fitShadowCamera(light, sun)
    shadowUniforms.uShadowDepthBias.value = 0.4 / s.range
    gl.shadowMap.needsUpdate = true
    s.phase = 1
    s.sun.copy(sun)
    s.lastDir.copy(sun)
    s.lastUpdate = s.lastPeriodic = now
    shadowState.dirty = false
  })
  return null
}
