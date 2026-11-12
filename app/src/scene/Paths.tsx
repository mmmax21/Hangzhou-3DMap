import { useMemo } from 'react'
import * as THREE from 'three'
import { style } from '../config/style'
import { useSceneData } from '../data/loaders'
import { walkways } from '../data/walkways'
import { colorPair, shared } from '../state/night'
import { usePerfTier } from '../state/perf'
import { glslCommon } from '../shaders/common'
import { glslShadow, shadowUniforms } from '../state/shadows'
import { terrainY } from './terrainHeight'

const P = style.paths

/**
 * 阶段 10：石板步道（堤上步道、环湖步道、景点小路），一个网格一次绘制调用。
 * 贴着地形铺一条带子；着色器里画石板缝和磨边，跟随地面阴影；夜晚按 lightsOn 自东向西亮起一串很淡的灯光。
 */
const vert = /* glsl */ `
attribute float aAlong;
attribute float aSide;
varying vec3 vPos;
varying float vAlong;
varying float vSide;
void main() {
  vPos = position; vAlong = aAlong; vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const frag = /* glsl */ `
${glslCommon}
${glslShadow}
uniform vec3 cStone[2]; uniform vec3 cDark[2]; uniform vec3 cLight[2]; uniform vec3 cSun[2];
varying vec3 vPos;
varying float vAlong;
varying float vSide;
void main() {
  if (octSDF(vPos.xz) > -4.0) discard;
  float row = vAlong / ${P.slab.toFixed(2)};
  float id = floor(row);
  // 石板：每块明暗略有不同，横缝和错缝的竖缝
  float seamA = smoothstep(0.0, 0.06, fract(row)) * smoothstep(1.0, 0.94, fract(row));
  float col2 = fract((vSide * 0.5 + 0.5) * 2.0 + mod(id, 2.0) * 0.5);
  float seamB = smoothstep(0.0, 0.05, col2) * smoothstep(1.0, 0.95, col2);
  float edge = smoothstep(0.78, 1.0, abs(vSide));
  vec3 col = mix(DNC(cStone), DNC(cDark), 0.25 + 0.5 * hash12(vec2(id, floor(col2 * 2.0 + vSide))) * 0.6);
  col = mix(DNC(cDark), col, seamA * seamB);
  col = mix(col, DNC(cDark) * 0.92, edge);
  float shade = groundShade(vPos.xz);
  col *= (1.0 - shade * 0.6) * shadeTint(shade);
  // 夜晚：沿路一串很淡的灯光
  float lampD = (fract(vAlong / ${P.lampSpacing.toFixed(1)}) - 0.5) * 4.0; // 不用 pow：底数为负时结果未定义
  float lamp = exp(-lampD * lampD);
  col += DNC(cLight) * lamp * ${P.lampGlow.toFixed(2)} * lightsOn(vPos.xz, hash12(vec2(floor(vAlong / ${P.lampSpacing.toFixed(1)}), 3.0)));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function Paths() {
  const d = useSceneData()
  const tier = usePerfTier((s) => s.tier)
  const step = tier >= 2 ? P.lowStep : P.step
  const geometry = useMemo(() => {
    const pos: number[] = [], along: number[] = [], side: number[] = [], idx: number[] = []
    for (const w of walkways(d, step)) {
      const n = w.pts.length
      let s = 0
      for (let i = 0; i < n; i++) {
        const a = w.pts[Math.max(i - 1, 0)], b = w.pts[Math.min(i + 1, n - 1)]
        const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1
        const nx = -tz / l * w.width / 2, nz = tx / l * w.width / 2
        if (i > 0) s += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1])
        const base = pos.length / 3
        for (const k of [-1, 1]) {
          const x = w.pts[i][0] + nx * k, z = w.pts[i][1] + nz * k
          pos.push(x, Math.max(terrainY(d, x, z), 0) + P.lift, z)
          along.push(s); side.push(k)
        }
        if (i > 0) idx.push(base - 2, base, base - 1, base - 1, base, base + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
    g.setIndex(idx)
    g.computeBoundingSphere()
    console.info(`[paths] ${walkways(d, step).length} 条，${idx.length / 3} 三角面`)
    return g
  }, [d, step])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: { ...shared, ...shadowUniforms, cStone: colorPair(P.stone), cDark: colorPair(P.stoneDark), cLight: colorPair(style.colors.light), cSun: colorPair(style.lighting.sunColor) },
  }), [])
  return <mesh geometry={geometry} material={material} />
}
