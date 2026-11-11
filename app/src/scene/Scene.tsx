import { Suspense } from 'react'
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
      <Base />
      <Suspense fallback={null}>
        <CameraRig />
        <group onClick={e=>{if(e.delta<3)select(null)}}>
        <Terrain />
        <Water />
        <Buildings />
        <Roads />
        <ShoreLights />
        <Trees />
        <Mist />
        </group>
        <Landmarks />
      </Suspense>
      <PostFX />
      <Perf />
      <BenchHook />
      {import.meta.env.DEV && <ShotHook />}
    </>
  )
}
