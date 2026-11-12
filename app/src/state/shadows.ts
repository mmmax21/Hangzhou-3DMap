import * as THREE from 'three'
import { style } from '../config/style'
import { TERRAIN_D, TERRAIN_W } from '../geo/geo'

/**
 * 阶段 8：日光投影的共享 uniforms 与 GLSL。由 scene/Shadows.tsx 逐帧维护。
 *
 * 两部分：
 * 1. three 自带的阴影贴图：主光（Atmosphere 里名为 sun 的平行光）投影，景点、树、建筑是投影者。
 *    阴影贴图不逐帧重画（renderer.shadowMap.autoUpdate = false），只在主光方向变化或物体加载时重画一次，
 *    所以湖面倒影那一遍渲染不会再算一次阴影。
 * 2. 地面阴影遮罩 uShadowMask（俯视的一张贴图，覆盖整个沙盘）：
 *    R = 物体投到地面的影子（对阴影贴图做大半径 PCF，所以很柔），G = 山体投影与背光面（在高度图上沿主光方向步进）。
 *    遮罩和阴影贴图同时重算。地形每个像素只取样一次遮罩，开销很小。
 *
 * 强度 uShadowStrength、uTerrainShadow 已经乘上昼夜衰减；第 2 档画质两者为 0。
 */

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
white.needsUpdate = true

export const shadowUniforms = {
  uShadowMap: { value: white as THREE.Texture },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowTexel: { value: new THREE.Vector2(1 / style.shadows.mapSize, 1 / style.shadows.mapSize) },
  uShadowDepthBias: { value: 0.001 },
  uShadowStrength: { value: 0 },
  uTerrainShadow: { value: 0 },
  uShadowMask: { value: white as THREE.Texture },
  uShadowTint: { value: new THREE.Color(style.shadows.tint) },
}

/** 请求在下一帧重画阴影（例如景点模型加载完成） */
export const shadowState = { dirty: true }
export const requestShadowUpdate = () => { shadowState.dirty = true }

const S = style.shadows

/** 自定义 ShaderMaterial 用：在 glslCommon 之后拼接 */
export const glslShadow = /* glsl */ `
#include <packing>
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec2 uShadowTexel;
uniform float uShadowDepthBias;
uniform float uShadowStrength;
uniform float uTerrainShadow;
uniform sampler2D uShadowMask;
uniform vec3 uShadowTint;

// 地面遮罩：返回 0 受光 → 1 完全在影中（已乘强度）
float groundShade(vec2 xz) {
  vec2 m = texture2D(uShadowMask, xz / vec2(${TERRAIN_W.toFixed(3)}, ${TERRAIN_D.toFixed(3)}) + 0.5).rg;
  return clamp((1.0 - m.r) * uShadowStrength + (1.0 - m.g) * uTerrainShadow, 0.0, 1.0);
}
// 只取山体遮蔽（给站在地上的物体用，物体自身的影子另算）
float terrainShade(vec2 xz) {
  float g = texture2D(uShadowMask, xz / vec2(${TERRAIN_W.toFixed(3)}, ${TERRAIN_D.toFixed(3)}) + 0.5).g;
  return (1.0 - g) * uTerrainShadow;
}
float shadowCmp(vec2 uv, float z) { return step(z, unpackRGBAToDepth(texture2D(uShadowMap, uv))); }
// 双线性插值的深度比较，边缘不出锯齿
float shadowCmpBilinear(vec2 uv, float z) {
  vec2 t = uShadowTexel;
  vec2 p = uv / t - 0.5;
  vec2 f = fract(p);
  vec2 c = (floor(p) + 0.5) * t;
  float a = shadowCmp(c, z), b = shadowCmp(c + vec2(t.x, 0.0), z);
  float d = shadowCmp(c + vec2(0.0, t.y), z), e = shadowCmp(c + t, z);
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
// 直接查阴影贴图（建筑墙面和屋顶用）：返回 0 受光 → 1 在影中（已乘强度）
float objectShade(vec3 wp, vec3 n) {
  if (uShadowStrength <= 0.001) return 0.0;
  vec4 sc = uShadowMatrix * vec4(wp + n * ${S.normalBias.toFixed(2)}, 1.0);
  sc.xyz /= sc.w;
  if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 0.0;
  float z = sc.z - uShadowDepthBias;
  vec2 o = uShadowTexel * 0.75;
  float lit = 0.25 * (shadowCmpBilinear(sc.xy + vec2(-o.x, -o.y), z) + shadowCmpBilinear(sc.xy + vec2(o.x, -o.y), z)
                    + shadowCmpBilinear(sc.xy + vec2(-o.x, o.y), z) + shadowCmpBilinear(sc.xy + vec2(o.x, o.y), z));
  return (1.0 - lit) * uShadowStrength;
}
// 影子里偏一点石青
vec3 shadeTint(float shade) { return mix(vec3(1.0), uShadowTint, shade * ${(S.tintAmount / Math.max(S.strength.day, 0.01)).toFixed(3)}); }
`

/**
 * 给 three 自带材质（MeshStandardMaterial）补上山体遮蔽：站在山影里的树和景点也变暗。
 * 物体自身之间的影子由 three 的 receiveShadow 处理。
 */
export function injectTerrainShade(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) {
  shader.uniforms.uShadowMask = shadowUniforms.uShadowMask
  shader.uniforms.uTerrainShadow = shadowUniforms.uTerrainShadow
  shader.uniforms.uShadowTint = shadowUniforms.uShadowTint
  shader.vertexShader = 'varying vec3 vShadeWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  {
    vec4 wsP = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    wsP = instanceMatrix * wsP;
    #endif
    vShadeWorld = (modelMatrix * wsP).xyz;
  }`)
  shader.fragmentShader = `uniform sampler2D uShadowMask;\nuniform float uTerrainShadow;\nuniform vec3 uShadowTint;\nvarying vec3 vShadeWorld;\n` + shader.fragmentShader.replace('#include <opaque_fragment>', `{
    float tsh = (1.0 - texture2D(uShadowMask, vShadeWorld.xz / vec2(${TERRAIN_W.toFixed(3)}, ${TERRAIN_D.toFixed(3)}) + 0.5).g) * uTerrainShadow;
    outgoingLight *= (1.0 - tsh * 0.6) * mix(vec3(1.0), uShadowTint, tsh * 0.4);
  }
  #include <opaque_fragment>`)
}
