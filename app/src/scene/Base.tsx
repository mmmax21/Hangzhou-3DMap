import { useMemo } from 'react'
import * as THREE from 'three'
import { style } from '../config/style'
import { colorPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'
import { OCT } from './terrainHeight'

const S = style.base
const C = style.colors

/** 八边形轮廓：地形八边形向外扩 grow（与 octSDF 的偏移一致） */
function outline(grow: number = S.rim) {
  const hx = OCT.hx + grow
  const hz = OCT.hz + grow
  const c = OCT.c + 2 * grow - grow * Math.SQRT2
  return [
    [hx, -(hz - c)], [hx, hz - c], [hx - c, hz], [-(hx - c), hz],
    [-hx, hz - c], [-hx, -(hz - c)], [-(hx - c), -hz], [hx - c, -hz],
  ] as [number, number][]
}

const vert = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
void main() { vPos = position; vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const frag = /* glsl */ `
${glslCommon}
uniform vec3 cBase[2]; uniform vec3 cTop[2]; uniform vec3 cEdge[2];
uniform float uTopY;
uniform float uEntrance;
varying vec3 vPos;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float top = step(0.5, n.y);
  vec3 col = mix(DNC(cBase), DNC(cTop), top);
  if (top < 0.5) {
    float ndl = dot(n, normalize(uSunDir));
    col *= mix(0.86, 1.0, clamp(ndl * 0.5 + 0.6, 0.0, 1.0));
    col *= 1.0 + (fbm(vec2(vPos.x + vPos.z, vPos.y) * vec2(0.05, 0.6)) - 0.5) * 0.06 * (1.0 - uNight);
    // 顶边与底边的金线
    float dy = uTopY - vPos.y;
    float fw = fwidth(vPos.y);
    float line = 1.0 - smoothstep(fw * 0.8, fw * 2.0, abs(dy - 0.7));
    col = mix(col, DNC(cEdge) * (1.0 + uNight * 1.6), line);
  }
  gl_FragColor = vec4(col, uEntrance);
  #include <colorspace_fragment>
}
`

export function Base({ entrance }: { entrance: { value: number } }) {
  const geometry = useMemo(() => {
    const pts = outline()
    const top = S.topY - 0.02
    const bot = S.topY - S.thickness
    const pos: number[] = []
    const nor: number[] = []
    // 顶面只做外圈留边（地形八边形到底座外沿之间的环带）；
    // 内部的封底放在湖底以下，避免挡住水面和湖底
    const inner = outline(0)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const ia = inner[i], ib = inner[(i + 1) % pts.length]
      pos.push(ia[0], top, ia[1], b[0], top, b[1], a[0], top, a[1])
      pos.push(ia[0], top, ia[1], ib[0], top, ib[1], b[0], top, b[1])
      pos.push(0, S.innerFloorY, 0, ib[0], S.innerFloorY, ib[1], ia[0], S.innerFloorY, ia[1])
      for (let k = 0; k < 9; k++) nor.push(0, 1, 0)
    }
    // 侧面
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const ex = b[0] - a[0], ez = b[1] - a[1]
      const l = Math.hypot(ex, ez)
      const nx = ez / l, nz = -ex / l
      pos.push(a[0], bot, a[1], b[0], bot, b[1], b[0], top, b[1], a[0], bot, a[1], b[0], top, b[1], a[0], top, a[1])
      for (let k = 0; k < 6; k++) nor.push(nx, 0, nz)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          ...shared,
          cBase: colorPair(C.base),
          cTop: colorPair(C.baseTop),
          cEdge: colorPair(C.baseEdge),
          uTopY: { value: S.topY },
          uEntrance: entrance,
        },
      }),
    [entrance],
  )

  return (
    <group>
      <mesh geometry={geometry} material={material} />
      <Nameplate entrance={entrance} />
    </group>
  )
}

// ---------------------------------------------------------------- 铭牌（正面，朝 +Z）
function makePlateTexture() {
  const w = 2048, h = 360
  const layer = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.strokeStyle = '#fff'
    draw(g)
    return g.getImageData(0, 0, w, h).data
  }
  const serif = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif'
  const text = layer((g) => {
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `600 150px ${serif}`
    g.fillText('杭州西湖', w / 2 - 40, 140)
    g.font = `500 54px ${serif}`
    g.fillText('WEST LAKE · HANGZHOU', w / 2, 290)
  })
  const seal = layer((g) => {
    g.fillRect(w / 2 + 290, 78, 120, 130)
  })
  const sealText = layer((g) => {
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `600 52px ${serif}`
    g.fillText('西', w / 2 + 350, 112)
    g.fillText('湖', w / 2 + 350, 172)
  })
  const lines = layer((g) => {
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(w / 2 - 760, 150); g.lineTo(w / 2 - 380, 150)
    g.moveTo(w / 2 + 460, 150); g.lineTo(w / 2 + 840, 150)
    g.stroke()
  })
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = seal[i * 4 + 3] / 255 * (1 - sealText[i * 4 + 3] / 255)
    data[i * 4] = text[i * 4 + 3]
    data[i * 4 + 1] = Math.round(s * 255)
    data[i * 4 + 2] = lines[i * 4 + 3]
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  tex.flipY = false // 着色器里用 1 - v 翻转
  tex.colorSpace = THREE.NoColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

const plateFrag = /* glsl */ `
${glslCommon}
uniform sampler2D uTex;
uniform float uEntrance;
uniform vec3 cInk[2]; uniform vec3 cSeal[2]; uniform vec3 cEdge[2];
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y));
  vec3 col = vec3(0.0);
  float a = 0.0;
  col = mix(col, DNC(cEdge) * (1.0 + uNight), t.b); a = max(a, t.b);
  col = mix(col, DNC(cInk) * (1.0 + uNight * 0.6), t.r); a = max(a, t.r);
  col = mix(col, DNC(cSeal), t.g); a = max(a, t.g);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a * uEntrance);
  #include <colorspace_fragment>
}
`

function Nameplate({ entrance }: { entrance: { value: number } }) {
  const { material, width, height, z } = useMemo(() => {
    const tex = makePlateTexture()
    const width = 300
    const height = (width * 360) / 2048
    const m = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: plateFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...shared,
        uTex: { value: tex },
        uEntrance: entrance,
        cInk: colorPair(C.plateInk),
        cSeal: colorPair(C.seal),
        cEdge: colorPair(C.baseEdge),
      },
    })
    return { material: m, width, height, z: OCT.hz + S.rim + 0.15 }
  }, [entrance])
  return (
    <mesh position={[0, S.topY - S.thickness * 0.5, z]} material={material}>
      <planeGeometry args={[width, height]} />
    </mesh>
  )
}
