import { useMemo } from 'react'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene, metersToUnits, sceneToUV } from '../geo/geo'
import { landmarks, sampleMask, useSceneData } from '../data/loaders'
import { colorPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'
import { glslShadow, shadowUniforms } from '../state/shadows'
import { octSDF, terrainY } from './terrainHeight'
import { walkwayClearance } from '../data/walkways'

const B = style.buildings
const R = style.roofs
const C = style.colors

const vert = /* glsl */ `
attribute float aBase;    // 建筑底部 y
attribute float aHeight;  // 建筑高度（米）
attribute float aSeed;
attribute float aRoof;    // 阶段 11：1 为坡屋顶
varying float vRoof;
varying vec3 vPos;
varying vec3 vNormal;
varying float vLocalY;
varying float vHeight;
varying float vSeed;
void main() {
  vPos = position;
  vNormal = normal;
  vLocalY = (position.y - aBase) * 10.0; // 米
  vHeight = aHeight;
  vSeed = aSeed;
  vRoof = aRoof;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const frag = /* glsl */ `
${glslCommon}
${glslShadow}
uniform vec3 cWall[2]; uniform vec3 cRoof[2]; uniform vec3 cTower[2]; uniform vec3 cLight[2]; uniform vec3 cSun[2];
uniform float pSunI[2]; uniform float pAmb[2];
varying vec3 vPos;
varying vec3 vNormal;
varying float vLocalY;
varying float vHeight;
varying float vSeed;
varying float vRoof;
uniform vec3 cTile[2];

void main() {
  if (octSDF(vPos.xz) > -6.0) discard;
  vec3 n = normalize(vNormal);
  float isRoof = step(0.5, n.y);
  float tower = smoothstep(${B.towerHeight.toFixed(1)}, ${(B.towerHeight * 2.5).toFixed(1)}, vHeight);
  vec3 wall = mix(DNC(cWall), DNC(cTower), tower);
  vec3 col = mix(wall, DNC(cRoof), isRoof);
  // 阶段 11：坡屋顶用黛瓦色，沿坡向画瓦垄，檐口一线略深
  if (vRoof > 0.5) {
    vec2 along = normalize(vec2(-n.z, n.x) + 1e-5);
    float rib = abs(fract(dot(vPos.xz, along) * ${R.tileFreq.toFixed(2)}) - 0.5) * 2.0;
    col = DNC(cTile) * (1.0 - ${R.tileDepth.toFixed(2)} * smoothstep(0.55, 1.0, rib));
  }
  // 光照（很淡的明暗）
  float ndl = dot(n, normalize(uSunDir));
  // 阶段 8 投影：主光被别的物体或山体挡住的部分
  float shade = clamp(objectShade(vPos, n) + terrainShade(vPos.xz), 0.0, 1.0);
  float lit = DNF(pAmb) + DNF(pSunI) * clamp(ndl * 0.6 + 0.4, 0.0, 1.0) * (1.0 - shade);
  col *= mix(lit, 1.0, tower * 0.35);
  col *= shadeTint(shade);
  // 墙脚略暗，增加体积感
  col *= mix(0.86, 1.0, smoothstep(0.0, 6.0, vLocalY)) * (1.0 - isRoof) + isRoof;

  // 夜晚：程序化窗格
  if (isRoof < 0.5) {
    float along = dot(vPos.xz, vec2(-n.z, n.x)) * 10.0; // 米
    vec2 cell0 = vec2(along / ${B.windowSpacing.toFixed(2)}, vLocalY / ${B.windowFloor.toFixed(2)});
    // 窗格 LOD：远处把窗格按 2 的幂合并，保证每个亮点至少约 2 像素，形成点点灯火而不是均匀的暖色
    float fw0 = max(fwidth(cell0.x), fwidth(cell0.y));
    float lod = exp2(max(ceil(log2(fw0 * ${B.windowMinPx.toFixed(1)})), 0.0));
    vec2 cell = cell0 / lod;
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.8);
    float ratio = ${B.windowLitRatio.toFixed(2)} / sqrt(lod);   // 合并后亮点更稀，整体亮度不随距离暴涨
    float on = step(1.0 - ratio, hash12(id + vSeed * 37.0 + lod * 3.1));
    float valid = step(1.5, vLocalY) * step(vLocalY, vHeight - 1.0);
    float warm = 0.65 + 0.35 * hash12(id * 1.7 + vSeed);
    col += DNC(cLight) * win * on * warm * valid * ${B.windowGlow.toFixed(2)} * lightsOn(vPos.xz, fract(vSeed * 7.0));
    col += DNC(cLight) * ${B.wallGlow.toFixed(3)} * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function Buildings() {
  const d = useSceneData()

  const geometry = useMemo(() => {
    const { origin, scale, buildings } = d.buildings
    const clear = landmarks.map((l) => lngLatToScene(l.lng, l.lat))
    const r2 = B.clearRadius * B.clearRadius
    const pos: number[] = []
    const nor: number[] = []
    const base: number[] = []
    const hgt: number[] = []
    const seed: number[] = []
    const roof: number[] = []
    const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number, b: number, h: number, s: number, r = 0) => {
      pos.push(x, y, z)
      nor.push(nx, ny, nz)
      base.push(b)
      hgt.push(h)
      seed.push(s)
      roof.push(r)
    }
    let roofTris = 0
    let kept = 0
    for (const item of buildings) {
      const h = item[0]
      const pts: THREE.Vector2[] = []
      let cx = 0, cz = 0
      for (let i = 1; i + 1 < item.length; i += 2) {
        const [x, z] = lngLatToScene(origin[0] + item[i] * scale, origin[1] + item[i + 1] * scale)
        pts.push(new THREE.Vector2(x, z))
        cx += x
        cz += z
      }
      if (pts.length < 3) continue
      cx /= pts.length
      cz /= pts.length
      if (octSDF(cx, cz) > -8) continue
      if (clear.some(([lx, lz]) => (lx - cx) ** 2 + (lz - cz) ** 2 < r2)) continue
      const [u, v] = sceneToUV(cx, cz)
      if (sampleMask(d, u, v) > 0.5) continue
      if (walkwayClearance(d, cx, cz) < style.paths.clear + 1) continue // 阶段 10：给步道让路
      // 离湖远的城区留白，像画卷边缘渐渐散开
      const hs = Math.sin(u * 913.7 + v * 271.3) * 43758.5453
      if (sampleMask(d, u, v, 2) > style.city.reach + (hs - Math.floor(hs) - 0.5) * style.city.feather) continue
      // 底部取轮廓各点地表的最低值，再下沉，保证坡地不悬空
      let by = Infinity
      for (const p of pts) by = Math.min(by, terrainY(d, p.x, p.y))
      by -= B.sink
      const top = Math.max(by + B.sink, terrainY(d, cx, cz)) + metersToUnits(h)
      // 统一为逆时针（从上往下看，x 向东 z 向南）
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse()
      const s = (kept * 0.61803398875) % 1
      // 墙
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]
        const ex = b.x - a.x, ez = b.y - a.y
        const len = Math.hypot(ex, ez) || 1
        // 逆时针（在 x-z 平面以 y 向上看是顺时针）时外法线为 (ez, -ex)
        let nx = ez / len, nz = -ex / len
        // 校验朝外：法线应背离质心
        const mx = (a.x + b.x) / 2 - cx, mz = (a.y + b.y) / 2 - cz
        if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz }
        pushV(a.x, by, a.y, nx, 0, nz, by, h, s)
        pushV(b.x, by, b.y, nx, 0, nz, by, h, s)
        pushV(b.x, top, b.y, nx, 0, nz, by, h, s)
        pushV(a.x, by, a.y, nx, 0, nz, by, h, s)
        pushV(b.x, top, b.y, nx, 0, nz, by, h, s)
        pushV(a.x, top, a.y, nx, 0, nz, by, h, s)
      }
      if (h >= B.towerHeight) {
        // 高楼保持平顶
        const tris = THREE.ShapeUtils.triangulateShape(pts, [])
        for (const [i0, i1, i2] of tris) {
          for (const k of [i0, i1, i2]) pushV(pts[k].x, top, pts[k].y, 0, 1, 0, by, h, s)
        }
      } else {
        // 阶段 11：坡屋顶。按最长边定方向，取轮廓在该方向上的外接矩形，屋脊沿长轴，檐口出挑
        let ax = 1, az = 0, best = -1
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b.x - a.x, b.y - a.y)
          if (l > best) { best = l; ax = (b.x - a.x) / l; az = (b.y - a.y) / l }
        }
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
        for (const p of pts) {
          const u = (p.x - cx) * ax + (p.y - cz) * az, v = -(p.x - cx) * az + (p.y - cz) * ax
          u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
        }
        let ux = ax, uz = az, vx = -az, vz = ax
        if (u1 - u0 < v1 - v0) { // 长轴取较长的一边
          ;[u0, u1, v0, v1] = [v0, v1, -u1, -u0]
          ;[ux, uz, vx, vz] = [vx, vz, -ux, -uz]
        }
        u0 -= R.eave; u1 += R.eave; v0 -= R.eave; v1 += R.eave
        const hw = (v1 - v0) / 2, vm = (v0 + v1) / 2
        const rise = Math.min(hw * R.pitch, R.maxRise)
        let r0 = u0 + hw * R.hip, r1 = u1 - hw * R.hip
        if (r0 > r1) r0 = r1 = (u0 + u1) / 2
        const ey = top - R.droop, ry = top - R.droop + rise
        const P = (u: number, v: number, y: number) => new THREE.Vector3(cx + ux * u + vx * v, y, cz + uz * u + vz * v)
        const A = P(u0, v0, ey), Bq = P(u1, v0, ey), Cq = P(u1, v1, ey), D = P(u0, v1, ey), R0 = P(r0, vm, ry), R1 = P(r1, vm, ry)
        const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3()
        const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
          nn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a))
          if (nn.lengthSq() < 1e-8) return
          nn.normalize()
          if (nn.y < 0) { nn.negate(); [b, c] = [c, b] }
          for (const q of [a, b, c]) pushV(q.x, q.y, q.z, nn.x, nn.y, nn.z, by, h, s, 1)
          roofTris++
        }
        tri(A, Bq, R1); tri(A, R1, R0) // 前坡
        tri(Cq, D, R0); tri(Cq, R0, R1) // 后坡
        tri(D, A, R0); tri(Bq, Cq, R1) // 两端
      }
      kept++
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1))
    g.setAttribute('aHeight', new THREE.Float32BufferAttribute(hgt, 1))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
    g.setAttribute('aRoof', new THREE.Float32BufferAttribute(roof, 1))
    g.computeBoundingSphere()
    console.info(`[buildings] ${kept} 栋, ${pos.length / 9} 三角面（其中坡屋顶 ${roofTris}）`)
    return g
  }, [d])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.DoubleSide,
        uniforms: {
          ...shared,
          ...shadowUniforms,
          cWall: colorPair(C.wall),
          cRoof: colorPair(C.roof),
          cTower: colorPair(C.tower),
          cTile: colorPair(R.tile),
          cLight: colorPair(C.light),
          cSun: colorPair(style.lighting.sunColor),
          pSunI: { value: [style.lighting.sunIntensity.day, style.lighting.sunIntensity.night] },
          pAmb: { value: [style.lighting.ambient.day + 0.1, style.lighting.ambient.night] },
        },
      }),
    [],
  )

  return <mesh geometry={geometry} material={material} castShadow />
}
