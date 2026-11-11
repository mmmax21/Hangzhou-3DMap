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

export function Scene() {
  return (
    <>
      <Atmosphere />
      <CameraRig />
      <Base />
      <Suspense fallback={null}>
        <Terrain />
        <Water />
        <Buildings />
        <Roads />
        <ShoreLights />
        <Trees />
        <Mist />
        <Landmarks />
      </Suspense>
      <PostFX />
      <Perf />
      <BenchHook />
      {import.meta.env.DEV && <ShotHook />}
    </>
  )
}
