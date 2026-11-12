import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { style } from '../config/style'
import { Atmosphere } from './Atmosphere'
import { Backdrop } from './Backdrop'
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
import { Boats } from './Boats'
import { SkyLanterns } from './SkyLanterns'
import { intro } from '../state/intro'
import { TourDirector } from './TourDirector'
import { AdaptiveQuality } from './AdaptiveQuality'
import { usePerfTier } from '../state/perf'
import { Weather } from './Weather'
import { Shadows } from './Shadows'
import { BenchHook, Perf, ShotHook } from './Perf'
import { useSelection } from '../state/selection'

export function Scene() {
  const select=useSelection(s=>s.select)
  return (
    <>
      <Atmosphere />
      <Backdrop />
      <AdaptiveQuality />
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
  const tier=usePerfTier(s=>s.tier)
  useLayoutEffect(()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const e=style.entrance
    const timeline=gsap.timeline()
    if(import.meta.env.DEV)(window as unknown as Record<string,unknown>).__introTl=timeline // 调试：定格开场的某一刻
    timeline.fromTo(intro,{ink:1},{ink:0,duration:e.inkDuration,ease:'sine.inOut'},e.inkStart)
    timeline.fromTo(opacity,{value:0},{value:1,duration:e.baseDuration,ease:'power2.out'},0)
    timeline.fromTo(terrain.current.scale,{y:e.initialScale},{y:1,duration:e.terrainDuration,ease:'power2.out'},e.terrainStart)
    timeline.fromTo(buildings.current.scale,{y:e.initialScale},{y:1,duration:e.objectsDuration,ease:'power2.out'},e.objectsStart)
    timeline.fromTo(landmarks.current.scale,{y:e.initialScale},{y:1,duration:e.landmarkDuration,ease:'power2.out'},e.landmarkStart)
    return ()=>{timeline.kill();intro.ink=0;opacity.value=1;terrain.current?.scale.setScalar(1);buildings.current?.scale.setScalar(1);landmarks.current?.scale.setScalar(1)}
  },[opacity])
  return <><CameraRig /><Shadows /><Base entrance={opacity} /><group onClick={e=>{if(e.delta<style.landmarks.clickMaxDrag)select(null)}}>
    <group ref={terrain}><Terrain /></group><Water /><Roads /><ShoreLights /><Boats /><SkyLanterns /><Weather /><TourDirector />
    <group ref={buildings}><Buildings /><Trees />{tier<2 && <Mist />}</group><group ref={landmarks}><Landmarks /></group>
  </group></>
}
