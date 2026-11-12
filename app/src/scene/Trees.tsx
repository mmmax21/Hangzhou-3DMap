import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { style } from '../config/style'
import { lowQuality } from '../config/quality'
import { landmarks, sampleMask, useSceneData } from '../data/loaders'
import { lngLatToScene, sceneToUV, TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { lerpColor, uNight } from '../state/night'
import { octSDF, terrainY } from './terrainHeight'
const T = style.trees
function inside(x:number,z:number,r:number[][]) {
  let hit=false
  for(let i=0,j=r.length-1;i<r.length;j=i++) {
    const a=r[i],b=r[j]
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) hit=!hit
  }
  return hit
}
function crown(willow:boolean) {
  const parts:THREE.BufferGeometry[]=[]
  const count=willow?5:3
  for(let i=0;i<count;i++) {
    const angle=i*Math.PI*2/count
    const g=new THREE.SphereGeometry(1,T.crownSegments,T.crownRings)
    if(willow) {
      g.scale(T.willowRadius*.55,T.willowHeight*.53,T.willowRadius*.55)
      g.translate(Math.cos(angle)*T.willowRadius*.65,T.trunkHeight+T.willowHeight*.23,Math.sin(angle)*T.willowRadius*.65)
    } else {
      g.scale(T.crownRadius*.76,T.crownHeight*(i?.68:.85),T.crownRadius*.76)
      g.translate(Math.cos(angle)*T.crownRadius*.55,T.trunkHeight+T.crownHeight*(i?.25:.6),Math.sin(angle)*T.crownRadius*.55)
    }
    parts.push(g)
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());return merged
}
export function Trees() {
  const d=useSceneData()
  const meshes=useMemo(()=>{
    let seed:number=T.seed
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
    const forest:THREE.Matrix4[]=[],willows:THREE.Matrix4[]=[]
    const occupied=new Set<string>(), clear=landmarks.map(l=>lngLatToScene(l.lng,l.lat))
    const polygons=d.green.polygons.map(p=>{
      const outer=p.outer.map(([a,b])=>lngLatToScene(a,b))
      return {outer,holes:p.holes.map(r=>r.map(([a,b])=>lngLatToScene(a,b))),minX:Math.min(...outer.map(p=>p[0])),maxX:Math.max(...outer.map(p=>p[0])),minZ:Math.min(...outer.map(p=>p[1])),maxZ:Math.max(...outer.map(p=>p[1]))}
    })
    const add=(x:number,z:number,willow:boolean)=>{
      if(octSDF(x,z)>-T.edgeMargin||clear.some(([a,b])=>Math.hypot(a-x,b-z)<T.landmarkClearance))return
      const [u,v]=sceneToUV(x,z)
      if(sampleMask(d,u,v)>.35)return
      const cell=`${Math.round(x/T.crownRadius)},${Math.round(z/T.crownRadius)}`
      if(occupied.has(cell))return
      occupied.add(cell)
      const scale=1+(rand()-.5)*T.variation*2
      const m=new THREE.Matrix4().compose(new THREE.Vector3(x,terrainY(d,x,z),z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rand()*Math.PI*2),new THREE.Vector3(scale,scale,scale))
      ;(willow?willows:forest).push(m)
    }
    for(const ring of d.green.dikes){
      const pts=ring.map(([a,b])=>lngLatToScene(a,b))
      for(let i=1;i<pts.length;i++){
        const [a,b]=[pts[i-1],pts[i]],len=Math.hypot(b[0]-a[0],b[1]-a[1])
        for(let t=0;t<len;t+=T.dikeSpacing){
          const nx=-(b[1]-a[1])/len*T.shoreOffset,nz=(b[0]-a[0])/len*T.shoreOffset
          for(const side of [-1,1])add(a[0]+(b[0]-a[0])*t/len+nx*side,a[1]+(b[1]-a[1])*t/len+nz*side,true)
        }
      }
    }
    for(let x=-TERRAIN_W/2;x<TERRAIN_W/2;x+=T.shoreSpacing)for(let z=-TERRAIN_D/2;z<TERRAIN_D/2;z+=T.shoreSpacing){
      const [u,v]=sceneToUV(x,z),dist=sampleMask(d,u,v,2)
      if(dist>0&&dist<.052&&terrainY(d,x,z)<T.minMountainY)add(x,z,true)
    }
    for(let x=-TERRAIN_W/2;x<TERRAIN_W/2;x+=T.forestSpacing)for(let z=-TERRAIN_D/2;z<TERRAIN_D/2;z+=T.forestSpacing){
      const a=x+(rand()-.5)*T.forestSpacing,b=z+(rand()-.5)*T.forestSpacing
      const y=terrainY(d,a,b)
      if(rand()>T.forestProbability||y>T.footMaxY)continue
      // 山上只在山脚成林，越高越稀；平地上只种在绿地范围内
      const keep=y>T.minMountainY?Math.pow(1-(y-T.minMountainY)/(T.footMaxY-T.minMountainY),T.footFade):1
      if(rand()>keep)continue
      if(y>T.minMountainY || polygons.some(p=>a>=p.minX&&a<=p.maxX&&b>=p.minZ&&b<=p.maxZ&&inside(a,b,p.outer)&&!p.holes.some(h=>inside(a,b,h))))add(a,b,false)
    }
    if(lowQuality) {
      const thin=(items:THREE.Matrix4[])=>{const kept=items.filter((_,i)=>Math.floor((i+1)*style.render.lowTreeFraction)>Math.floor(i*style.render.lowTreeFraction));items.splice(0,items.length,...kept)}
      thin(forest);thin(willows)
    }
    const make=(geometry:THREE.BufferGeometry,matrices:THREE.Matrix4[],shade?:[number,number])=>{
      const material=new THREE.MeshStandardMaterial({roughness:1})
      // 树冠下暗上亮，给一点体积感
      if(shade)material.onBeforeCompile=s=>{
        s.vertexShader='varying float vCrownY;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vCrownY = position.y;')
        s.fragmentShader='varying float vCrownY;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n diffuseColor.rgb *= mix(${T.shadeLow.toFixed(2)}, ${T.shadeHigh.toFixed(2)}, smoothstep(${shade[0].toFixed(2)}, ${shade[1].toFixed(2)}, vCrownY));`)
      }
      const mesh=new THREE.InstancedMesh(geometry,material,matrices.length)
      const tint=new THREE.Color()
      matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);const f=Math.sin(i*12.9898)*43758.5453,k=1+(f-Math.floor(f)-.5)*2*T.tint;mesh.setColorAt(i,tint.setRGB(k,k,k))})
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();return mesh
    }
    const trunks=new THREE.CylinderGeometry(T.crownRadius*.1,T.crownRadius*.14,T.trunkHeight,5).translate(0,T.trunkHeight/2,0)
    console.info(`[trees] forest=${forest.length}, willows=${willows.length}; 3 instanced draws`)
    return [make(crown(false),forest,[T.trunkHeight,T.trunkHeight+T.crownHeight*1.2]),make(crown(true),willows,[T.trunkHeight*.6,T.trunkHeight+T.willowHeight*.6]),make(trunks,[...forest,...willows])]
  },[d])
  useEffect(()=>()=>meshes.forEach(m=>{m.geometry.dispose();(m.material as THREE.Material).dispose()}),[meshes])
  useFrame(()=>meshes.forEach((m,i)=>{
    const mat=m.material as THREE.MeshStandardMaterial
    lerpColor(i===0?style.colors.forest:i===1?style.colors.willow:style.colors.trunk,mat.color)
    mat.emissive.copy(mat.color).multiplyScalar(T.nightGlow*uNight.value)
  }))
  return <group>{meshes.map((m,i)=><primitive key={i} object={m}/>)}</group>
}
