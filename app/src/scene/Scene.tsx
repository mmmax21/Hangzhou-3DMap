import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { style } from '../config/style'
import { lowQuality } from '../config/quality'
import { Atmosphere } from './Atmosphere'
import { Base } from './Base'
import { Buildings } from './Buildings'
import { CameraRig } from './CameraRig'
import { Landmarks } from './Landmarks'
import { Roads, ShoreLights } from './NightLights'
import { PostFX } from './PostFX'
import { Terrain } from './Terrain'
import { Mist } from './Mist'
import { Trees } from './Trees'
import { Water } from './Water'
import { BenchHook, Perf, ShotHook } from './Perf'
import { useSelection } from '../state/selection'

export function Scene() {
  const select=useSelection(s=>s.select)
  return (
    <>
      <Atmosphere />
      <Suspense fallback={null}>
        <Entrance select={select} />
      </Suspense>
      <PostFX />
      <Perf />
      <BenchHook />
      {import.meta.env.DEV && <ShotHook />}
    </>
  )
}

function Entrance({select}:{select: ReturnType<typeof useSelection.getState>['select']}) {
  const terrain=useRef<THREE.Group>(null!), buildings=useRef<THREE.Group>(null!), landmarks=useRef<THREE.Group>(null!)
  const opacity=useMemo(()=>({value:1}),[])
  useLayoutEffect(()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const e=style.entrance
    const timeline=gsap.timeline()
    timeline.fromTo(opacity,{value:0},{value:1,duration:e.baseDuration,ease:'power2.out'},0)
    timeline.fromTo(terrain.current.scale,{y:e.initialScale},{y:1,duration:e.terrainDuration,ease:'power2.out'},e.terrainStart)
    timeline.fromTo(buildings.current.scale,{y:e.initialScale},{y:1,duration:e.objectsDuration,ease:'power2.out'},e.objectsStart)
    timeline.fromTo(landmarks.current.scale,{y:e.initialScale},{y:1,duration:e.landmarkDuration,ease:'power2.out'},e.landmarkStart)
    return ()=>{timeline.kill();opacity.value=1;terrain.current?.scale.setScalar(1);buildings.current?.scale.setScalar(1);landmarks.current?.scale.setScalar(1)}
  },[opacity])
  return <><CameraRig /><Base entrance={opacity} /><group onClick={e=>{if(e.delta<style.landmarks.clickMaxDrag)select(null)}}>
    <group ref={terrain}><Terrain /></group><Water /><Roads /><ShoreLights />
    <group ref={buildings}><Buildings /><Trees />{!lowQuality && <Mist />}</group><group ref={landmarks}><Landmarks /></group>
  </group></>
}
