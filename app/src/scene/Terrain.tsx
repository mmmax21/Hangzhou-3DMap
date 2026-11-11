import { useMemo } from 'react'
import * as THREE from 'three'
import { style } from '../config/style'
import { lowQuality } from '../config/quality'
import { TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { useSceneData } from '../data/loaders'
import { colorPair, numPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'
import { octSDF, terrainY } from './terrainHeight'

const T = style.terrain
const C = style.colors

const vert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const frag = /* glsl */ `
${glslCommon}
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform vec2 uSize;      // 场景宽、深
uniform float uTexel;    // 1 / 高度图尺寸
uniform float uWaterLevel;
uniform float uExag;
uniform sampler2D uRidge;
uniform vec3 cHigh[2]; uniform vec3 cHigh2[2]; uniform vec3 cMid[2]; uniform vec3 cMid2[2];
uniform vec3 cFoot[2]; uniform vec3 cPlain[2]; uniform vec3 cShore[2]; uniform vec3 cGold[2];
uniform vec3 cRim[2]; uniform vec3 cSun[2];
uniform float pSunI[2]; uniform float pAmb[2];
uniform float pRidgeStrength[2]; uniform float pRidgeGlow[2];
varying vec3 vPos;

float H(vec2 uv) { return texture2D(uHeight, uv).r; }

void main() {
  float sd = octSDF(vPos.xz);
  if (sd > 0.0) discard;
  vec2 uv = vPos.xz / uSize + 0.5;
  float e = H(uv);
  // 每个高度图像素的米数
  vec2 pm = uSize * 10.0 * uTexel;
  vec2 tx = vec2(uTexel, 0.0), tz = vec2(0.0, uTexel);
  float dx = (terrainYm(H(uv + tx), uWaterLevel) - terrainYm(H(uv - tx), uWaterLevel)) / (2.0 * pm.x);
  float dz = (terrainYm(H(uv + tz), uWaterLevel) - terrainYm(H(uv - tz), uWaterLevel)) / (2.0 * pm.y);
  vec3 n = normalize(vec3(-dx, 1.0, -dz));
  float slope = 1.0 - n.y;

  // 宽半径拉普拉斯：凸（山脊）为负，凹（山谷）为正
  float r = 4.0;
  float lap = (H(uv + tx * r) + H(uv - tx * r) + H(uv + tz * r) + H(uv - tz * r) - 4.0 * e) / pow(r * pm.x, 2.0);
  float convex = -lap;

  // 笔触：沿等高线方向的横向皴纹（以海拔为一个坐标，避免逐像素方向变化产生的涡旋）
  float along = dot(vPos.xz, vec2(0.83, 0.56));
  float warp = fbm2(vPos.xz * 0.025 + 5.0) * 10.0;
  float brush = fbm(vec2(e * ${T.brushContour.toFixed(3)} + warp, along * ${T.brushScale.toFixed(4)}));
  float grain = vnoise(vPos.xz * 0.35);
  float patchN = fbm2(vPos.xz * 0.012 + 3.7);

  float eN = e + (patchN - 0.5) * 2.0 * ${T.bandNoise.toFixed(1)};
  float ridgeT = smoothstep(0.0, ${T.ridgeBlue.toFixed(4)}, convex);
  float valleyT = smoothstep(0.0, ${T.ridgeBlue.toFixed(4)}, -convex);
  vec3 foot = DNC(cFoot);
  vec3 mid = mix(DNC(cMid), DNC(cMid2), smoothstep(0.35, 0.65, brush));
  vec3 high = mix(DNC(cHigh), DNC(cHigh2), smoothstep(0.3, 0.7, vnoise(vec2(e * 0.05, along * 0.01) + 9.0)));
  vec3 col = foot;
  col = mix(col, mid, smoothstep(${T.footTop.toFixed(1)} - 12.0, ${T.footTop.toFixed(1)} + 12.0, eN));
  // 石青：高处、山脊、陡坡偏青；山谷偏绿。笔触扰动边界
  float heightT = smoothstep(${T.midTop.toFixed(1)}, ${T.highTop.toFixed(1)}, eN);
  float blueT = heightT + ridgeT * 0.25 - valleyT * 0.25 + slope * ${T.slopeToBlue.toFixed(2)} * 0.3 + (brush - 0.5) * 0.35;
  blueT = smoothstep(0.38, 0.66, blueT) * smoothstep(${T.footTop.toFixed(1)}, ${(T.footTop + 30).toFixed(1)}, eN);
  col = mix(col, high, blueT);
  // 山脊提亮、山谷压暗，形成绢本设色的明暗层次
  col = mix(col, col * 1.18 + 0.03, ridgeT * smoothstep(40.0, 90.0, e) * ${T.ridgeHighlight.toFixed(2)});
  // 平原（低、缓）用地面色
  float plainT = (1.0 - smoothstep(14.0, 30.0, eN)) * (1.0 - smoothstep(0.03, 0.12, slope));
  col = mix(col, DNC(cPlain), plainT);
  // 湖岸色带
  float landDist = texture2D(uMask, uv).b;
  float shoreW = ${T.shoreWidth.toFixed(3)} * (0.45 + 1.1 * vnoise(vPos.xz * 0.05 + 11.0));
  float shoreT = (1.0 - smoothstep(shoreW * 0.5, shoreW, landDist)) * (1.0 - smoothstep(20.0, 45.0, e));
  col = mix(col, DNC(cShore) * (0.9 + 0.25 * grain), shoreT * 0.9);

  // 笔触明暗与山谷压暗
  col *= 1.0 + ((brush - 0.5) * 0.7 + (grain - 0.5) * 0.5) * ${T.brushStrength.toFixed(3)} * (1.0 - plainT * 0.7);
  col *= 1.0 - ${T.valleyDarken.toFixed(3)} * smoothstep(0.0, 0.012, lap) * (1.0 - plainT);

  // 光照：柔和包裹光
  float ndl = dot(n, normalize(uSunDir));
  float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  col *= DNF(pAmb) + DNF(pSunI) * wrap * DNC(cSun);

  // 山脊金线：采样管线烘焙的山脊距离场（R = 距离/16 像素，G = 山脊强度），按屏幕像素定线宽
  vec4 rg = texture2D(uRidge, uv);
  float dTex = rg.r * 16.0;                       // 到山脊的距离（高度图像素）
  float texPerPx = max(fwidth(uv.x), fwidth(uv.y)) / uTexel;
  float strengthR = rg.g;
  float wPx = ${T.ridge.width.toFixed(2)} * mix(0.6, 1.25, strengthR);
  float wTex = wPx * texPerPx;
  float line = 1.0 - smoothstep(wTex * 0.5, wTex * 0.5 + texPerPx, dTex);
  line *= smoothstep(${T.ridge.minStrength.toFixed(2)}, ${(T.ridge.minStrength + 0.25).toFixed(2)}, strengthR);
  vec3 gold = DNC(cGold) * (1.0 + DNF(pRidgeGlow));
  col = mix(col, gold, line * DNF(pRidgeStrength));

  // 八边形边缘留白过渡到底座顶面色
  float rimT = 1.0 - smoothstep(0.0, ${(T.edgeFalloff * 0.5).toFixed(1)}, -sd);
  col = mix(col, DNC(cRim), rimT);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function Terrain() {
  const d = useSceneData()

  const geometry = useMemo(() => {
    const nx = lowQuality ? T.lowSegments : T.segments
    const nz = Math.round((nx * TERRAIN_D) / TERRAIN_W)
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * TERRAIN_W
        const z = (j / nz - 0.5) * TERRAIN_D
        const k = (j * (nx + 1) + i) * 3
        pos[k] = x
        pos[k + 1] = terrainY(d, x, z)
        pos[k + 2] = z
      }
    }
    // 只保留八边形内（含一圈余量）的格子
    const idx: number[] = []
    const cell = TERRAIN_W / nx
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = ((i + 0.5) / nx - 0.5) * TERRAIN_W
        const z = ((j + 0.5) / nz - 0.5) * TERRAIN_D
        if (octSDF(x, z) > cell * 1.5) continue
        const a = j * (nx + 1) + i
        const b = a + 1
        const c = a + nx + 1
        const e = c + 1
        idx.push(a, c, b, b, c, e)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeBoundingSphere()
    return g
  }, [d])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          ...shared,
          uHeight: { value: d.heightTex },
          uMask: { value: d.maskTex },
          uSize: { value: new THREE.Vector2(TERRAIN_W, TERRAIN_D) },
          uTexel: { value: 1 / d.meta.size },
          uWaterLevel: { value: d.meta.waterLevel },
          uExag: { value: T.exaggeration },
          uRidge: { value: d.ridgeTex },
          cHigh: colorPair(C.mountainHigh),
          cHigh2: colorPair(C.mountainHigh2),
          cMid: colorPair(C.mountainMid),
          cMid2: colorPair(C.mountainMid2),
          cFoot: colorPair(C.mountainFoot),
          cPlain: colorPair(C.plain),
          cShore: colorPair(C.shore),
          cGold: colorPair(C.ridgeGold),
          cRim: colorPair(C.baseTop),
          cSun: colorPair(style.lighting.sunColor),
          pSunI: numPair(style.lighting.sunIntensity),
          pAmb: numPair(style.lighting.ambient),
          pRidgeStrength: numPair(T.ridge.strength),
          pRidgeGlow: numPair(T.ridge.glow),
        },
      }),
    [d],
  )

  return <mesh geometry={geometry} material={material} />
}
