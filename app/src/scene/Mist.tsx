import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { style } from '../config/style'
import { landmarks, sampleMask, useSceneData } from '../data/loaders'
import { lngLatToScene, sceneToUV, TERRAIN_D, TERRAIN_W } from '../geo/geo'
import { colorPair, numPair, shared } from '../state/night'
import { glslCommon } from '../shaders/common'
import { octSDF, terrainY } from './terrainHeight'
const M=style.mist
const vertex=`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
const fragment=`${glslCommon}
uniform vec3 cMist[2]; uniform float pOpacity[2]; varying vec2 vUv;
void main(){
 vec2 p=vUv*2.-1.;
 float edge=pow(max(0.,1.-p.x*p.x),1.5)*pow(max(0.,1.-p.y*p.y),2.);
 float n=fbm(vec2(vUv.x*${M.noiseScale.toFixed(1)}+uTime*${(M.drift*.01).toFixed(3)},vUv.y*3.));
 float a=edge*smoothstep(.25,.8,n)*DNF(pOpacity);
 gl_FragColor=vec4(DNC(cMist),a); #include <colorspace_fragment>
}`.replace('; #include',';\n#include')
export function Mist(){
 const d=useSceneData()
 const {places,mat}=useMemo(()=>{
  const clear=landmarks.map(l=>lngLatToScene(l.lng,l.lat)), places:[number,number,number][]=[]
  for(let x=-TERRAIN_W/2;x<TERRAIN_W/2;x+=M.grid)for(let z=-TERRAIN_D/2;z<TERRAIN_D/2;z+=M.grid){
   const y=terrainY(d,x,z),[u,v]=sceneToUV(x,z)
   if(y<M.minY||y>M.maxY||octSDF(x,z)>-M.edgeMargin||sampleMask(d,u,v,2)<.15||clear.some(([a,b])=>Math.hypot(x-a,z-b)<M.landmarkClearance))continue
   places.push([x,y+M.lift,z])
  }
  return {places,mat:new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,uniforms:{...shared,cMist:colorPair(style.colors.mist),pOpacity:numPair(M.opacity)}})}
 },[d])
 return <group>{places.map((p,i)=><Billboard key={i} position={p}><mesh material={mat}><planeGeometry args={[M.width,M.height]}/></mesh></Billboard>)}</group>
}
