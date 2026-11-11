import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { style } from '../config/style'
import { lngLatToScene } from '../geo/geo'
import { landmarks, useSceneData, type Landmark } from '../data/loaders'
import { lerpColor, uNight } from '../state/night'
import { useSelection } from '../state/selection'
import { terrainY } from './terrainHeight'
declare const __MODEL_FILES__: string[]
const L = style.landmarks
class ModelBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}
function Model({ file }: { file: string }) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/${file}`)
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse(obj => { if (obj instanceof THREE.Mesh) obj.material = Array.isArray(obj.material) ? obj.material.map(m => m.clone()) : obj.material.clone() })
    const box = new THREE.Box3().setFromObject(clone), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
    const scale = L.modelSize / Math.max(size.x, size.y, size.z, .001)
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    clone.scale.setScalar(scale)
    return clone
  }, [gltf])
  useEffect(()=>()=>model.traverse(obj=>{if(obj instanceof THREE.Mesh)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose())}),[model])
  useFrame(() => model.traverse(obj => {
    if (obj instanceof THREE.Mesh) for (const mat of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
      if (mat instanceof THREE.MeshStandardMaterial) { mat.emissive.set(style.colors.light.night); mat.emissiveIntensity = uNight.value * L.nightGlow }
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
  const placeholder = item.model ? <mesh position={[0, sy / 2, 0]} material={material}><boxGeometry args={[sx, sy, sz]} /></mesh> : <mesh position={[0, L.markerHeight/2, 0]} material={material}><cylinderGeometry args={[L.markerRadius, L.markerRadius, L.markerHeight, L.markerSegments]} /></mesh>
  return <group position={position}><group ref={group}
    onPointerOver={e => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
    onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
    onClick={e => { e.stopPropagation(); if(e.delta<L.clickMaxDrag)select(item) }}>
    {item.model && __MODEL_FILES__.includes(item.model) ? <ModelBoundary fallback={placeholder}><Suspense fallback={placeholder}><Model file={item.model} /></Suspense></ModelBoundary> : placeholder}
    {hover && <Html position={[0, sy + L.labelLift, 0]} center className="landmark-label">{item.name}</Html>}
  </group></group>
}
export function Landmarks() {
  const d = useSceneData()
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: .8 }), [])
  useEffect(()=>()=>material.dispose(),[material])
  useFrame(() => { lerpColor(style.colors.placeholder, material.color); material.emissive.set(style.colors.light.night).multiplyScalar(uNight.value * L.nightGlow * .6) })
  return <group>{landmarks.map(item => { const [x,z] = lngLatToScene(item.lng,item.lat); return <Marker key={item.id} item={item} material={material} position={[x, Math.max(terrainY(d,x,z),0), z]} /> })}</group>
}
