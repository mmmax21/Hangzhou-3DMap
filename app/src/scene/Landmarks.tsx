import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene } from '../geo/geo'
import { landmarks, useSceneData, type Landmark } from '../data/loaders'
import { lerpColor, uNight } from '../state/night'
import { useSelection } from '../state/selection'
import { OCT, terrainY } from './terrainHeight'
import { injectTerrainShade, requestShadowUpdate } from '../state/shadows'
import { usePerfTier } from '../state/perf'
declare const __MODEL_FILES__: string[]
const L = style.landmarks
/** 与 GLSL 的 lightsOn 一致：越靠东越早亮 */
function lightsOn(x:number){
  const k=Math.min(Math.max(x/OCT.hx*.5+.5,0),1),d=(1-k)*.55+.05,t=Math.min(Math.max((uNight.value-d)/.3,0),1)
  return t*t*(3-2*t)
}
let shadowTexture:THREE.CanvasTexture|null=null
function contactShadow(){
  if(shadowTexture)return shadowTexture
  const c=document.createElement('canvas');c.width=c.height=128
  const g=c.getContext('2d')!,grad=g.createRadialGradient(64,64,6,64,64,64)
  grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(.55,'rgba(0,0,0,.45)');grad.addColorStop(1,'rgba(0,0,0,0)')
  g.fillStyle=grad;g.fillRect(0,0,128,128)
  return shadowTexture=new THREE.CanvasTexture(c)
}
class ModelBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}
function Model({ file, size=L.modelSize, x=0 }: { file: string; size?:number; x?:number }) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/${file}`)
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.castShadow = obj.receiveShadow = true } }) // 阶段 8 投影
    clone.traverse(obj => { if (obj instanceof THREE.Mesh) obj.material = Array.isArray(obj.material) ? obj.material.map(m => m.clone()) : obj.material.clone() })
    clone.traverse(obj=>{if(obj instanceof THREE.Mesh)for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material]))if(mat instanceof THREE.MeshStandardMaterial){
      mat.roughness=L.modelRoughness;mat.metalness=0;mat.metalnessMap=null;mat.roughnessMap=null;mat.emissiveMap=mat.map
      mat.onBeforeCompile=shader=>{
        shader.uniforms.uModelSaturation={value:L.modelSaturation}
        shader.uniforms.uModelGain={value:L.modelGain}
        shader.fragmentShader='uniform float uModelSaturation;\nuniform float uModelGain;\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))), diffuseColor.rgb, uModelSaturation) * uModelGain;')
        injectTerrainShade(shader)
      }
      mat.customProgramCacheKey=()=> 'landmark-grade'
    }})
    const box = new THREE.Box3().setFromObject(clone), dimensions = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
    const scale = size / Math.max(dimensions.y, .001)
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    clone.scale.setScalar(scale)
    return clone
  }, [gltf,size])
  useEffect(()=>{requestShadowUpdate()},[model]) // 模型加载完成后重画阴影
  useEffect(()=>()=>model.traverse(obj=>{if(obj instanceof THREE.Mesh)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose())}),[model])
  useFrame(() => model.traverse(obj => {
    if (obj instanceof THREE.Mesh) for (const mat of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
      if (mat instanceof THREE.MeshStandardMaterial) { mat.emissive.set(style.colors.light.night); mat.emissiveIntensity = lightsOn(x) * L.nightGlow }
    }
  }))
  return <primitive object={model} />
}
function Marker({ item, position, material }: { item: Landmark; position: [number, number, number]; material:THREE.MeshStandardMaterial }) {
  const [hover, setHover] = useState(false)
  const group=useRef<THREE.Group>(null!)
  const select = useSelection(s => s.select)
  useFrame((_,dt)=>{group.current.position.y=THREE.MathUtils.damp(group.current.position.y,hover?L.hoverLift:0,L.hoverDamping,dt)})
  useEffect(()=>()=>{document.body.style.cursor=''},[])
  const [sx, sy, sz] = L.placeholderSize
  const file=item.id==='sudi'?'duanqiao.glb':item.model
  const placeholder = item.model ? <mesh position={[0, sy / 2, 0]} material={material}><boxGeometry args={[sx, sy, sz]} /></mesh> : <mesh position={[0, L.markerHeight/2, 0]} material={material}><cylinderGeometry args={[L.markerRadius, L.markerRadius, L.markerHeight, L.markerSegments]} /></mesh>
  const shadowR=(L.sizes[item.id]??sy)*L.shadowScale
  // 阶段 8：有真实投影时接触阴影减弱，只留脚下一点压实感；第 2 档没有投影，保持原样
  const tier=usePerfTier(s=>s.tier)
  const contactOpacity=L.shadowOpacity*(tier<2?style.shadows.contactKeep:1)
  return <group position={position}>{item.model&&<mesh rotation-x={-Math.PI/2} position={[L.shadowOffset[0]*shadowR,.5,L.shadowOffset[1]*shadowR]} renderOrder={1}><circleGeometry args={[shadowR,24]}/><meshBasicMaterial map={contactShadow()} color="#000" transparent opacity={contactOpacity} depthWrite={false} polygonOffset polygonOffsetFactor={-4}/></mesh>}<group ref={group}
    onPointerOver={e => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
    onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
    onClick={e => { e.stopPropagation(); if(e.delta<L.clickMaxDrag)select(item) }}>
    {file && __MODEL_FILES__.includes(file) ? <ModelBoundary fallback={placeholder}><Suspense fallback={placeholder}><group rotation={[0,L.rotations[item.id]??0,0]}><Model file={file} size={L.sizes[item.id]} x={position[0]}/></group>{item.id==='santan'&&__MODEL_FILES__.includes('santan-stone.glb')&&L.stoneOffsets.map((offset,i)=><group key={i} position={offset}><Model file="santan-stone.glb" size={L.stoneSize} x={position[0]}/></group>)}</Suspense></ModelBoundary> : placeholder}
    {hover && <Html position={[0, (L.sizes[item.id] ?? sy) + L.labelLift, 0]} center className="landmark-label">{item.name}</Html>}
  </group></group>
}
export function Landmarks() {
  const d = useSceneData()
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: .8 }), [])
  useEffect(()=>()=>material.dispose(),[material])
  useFrame(() => { lerpColor(style.colors.placeholder, material.color); material.emissive.set(style.colors.light.night).multiplyScalar(uNight.value * L.nightGlow * .6) })
  return <group>{landmarks.map(item => { const [x,z] = lngLatToScene(item.lng,item.lat); return <Marker key={item.id} item={item} material={material} position={[x, Math.max(terrainY(d,x,z),0), z]} /> })}</group>
}
