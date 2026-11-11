import { OCT } from '../scene/terrainHeight'
import { style } from '../config/style'

/** 所有自定义着色器共享的 GLSL 片段 */
export const glslCommon = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform vec3 uSunDir;
#define DNC(a) mix(a[0], a[1], uNight)
// 海拔（米）-> 夸张后的高度（米），与 terrainHeight.ts 的 elevationToY 一致
float terrainYm(float e, float wl) {
  float h = e - wl;
  return h * ${style.terrain.exaggeration.toFixed(3)} * (1.0 + ${style.terrain.peakCurve.toFixed(3)} * clamp(h / ${style.terrain.peakRef.toFixed(1)}, 0.0, 1.0));
}
#define DNF(a) mix(a[0], a[1], uNight)

const vec3 OCT = vec3(${OCT.hx.toFixed(4)}, ${OCT.hz.toFixed(4)}, ${OCT.c.toFixed(4)});
float octSDF(vec2 p) {
  vec2 a = abs(p);
  return max(max(a.x - OCT.x, a.y - OCT.y), (a.x + a.y - (OCT.x + OCT.y - OCT.z)) * 0.70710678);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.875;
}
float fbm2(vec2 p) {
  return (vnoise(p) * 0.5 + vnoise(p * 2.03 + 17.1) * 0.25) / 0.75;
}
`
