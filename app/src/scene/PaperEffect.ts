import { Effect } from 'postprocessing'
import * as THREE from 'three'

/** 宣纸纹理：全屏叠加很淡的纤维与颗粒，强度由外部按 uNight 设置（夜晚为 0） */
const fragment = /* glsl */ `
uniform float strength;
uniform float fiber;
uniform float ink;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 px = uv * resolution;
  float grain = h(floor(px)) - 0.5;
  float cloud = n2(px / 220.0) * 0.6 + n2(px / 60.0) * 0.4 - 0.5;
  // 两个方向的细长纤维
  float f1 = smoothstep(0.78, 1.0, n2(vec2(px.x / 90.0, px.y / 3.0)));
  float f2 = smoothstep(0.80, 1.0, n2(vec2(px.x / 3.5 + 31.0, px.y / 110.0)));
  vec3 c = inputColor.rgb;
  // 开场的水墨阶段：把画面压成纸色到墨色的单色调
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 inked = mix(vec3(0.17, 0.16, 0.15), vec3(0.93, 0.89, 0.80), smoothstep(0.08, 0.92, lum));
  c = mix(c, inked, ink);
  c *= 1.0 + strength * (grain * 0.35 + cloud * 0.8);
  c = mix(c, c * 1.08 + 0.02, (f1 + f2) * fiber);
  outputColor = vec4(c, inputColor.a);
}
`

export class PaperEffect extends Effect {
  constructor() {
    super('PaperEffect', fragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ['strength', new THREE.Uniform(0)],
        ['fiber', new THREE.Uniform(0)],
        ['ink', new THREE.Uniform(0)],
      ]),
    })
  }
  set(strength: number, fiber: number, ink = 0) {
    this.uniforms.get('ink')!.value = ink
    this.uniforms.get('strength')!.value = strength
    this.uniforms.get('fiber')!.value = fiber
  }
}
