import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, TiltShift2, Vignette } from '@react-three/postprocessing'
import type { BloomEffect, VignetteEffect } from 'postprocessing'
import { style } from '../config/style'
import { lowQuality } from '../config/quality'
import { lerp, uNight } from '../state/night'
import { PaperEffect } from './PaperEffect'
import { intro } from '../state/intro'
import { usePerfTier } from '../state/perf'

const P = style.post

/** 后期栈：辉光、移轴、暗角、宣纸纹理。强度全部由 uNight 插值 */
export function PostFX() {
  const bloom = useRef<BloomEffect>(null!)
  const vignette = useRef<VignetteEffect>(null!)
  const paper = useMemo(() => new PaperEffect(), [])
  const tier = usePerfTier((s) => s.tier)
  useFrame(() => {
    const t = uNight.value
    if (bloom.current) {
      bloom.current.intensity = lerp(P.bloomIntensity)
      bloom.current.luminanceMaterial.threshold = lerp(P.bloomThreshold)
    }
    if (vignette.current) vignette.current.darkness = lerp(P.vignette)
    paper.set(P.paper.strength * (1 - t) + intro.ink * 0.08, P.paper.fiber * (1 - t) + intro.ink * 0.05, intro.ink)
  })
  if (lowQuality || tier >= 2) return <EffectComposer multisampling={style.render.lowMsaa} enableNormalPass={false}><Bloom ref={bloom as never} mipmapBlur intensity={P.bloomIntensity.day} luminanceThreshold={P.bloomThreshold.day} luminanceSmoothing={P.bloomSmoothing} /></EffectComposer>
  return (
    <EffectComposer multisampling={style.render.msaa} enableNormalPass={false}>
      <Bloom
        ref={bloom as never}
        mipmapBlur
        intensity={P.bloomIntensity.day}
        luminanceThreshold={P.bloomThreshold.day}
        luminanceSmoothing={P.bloomSmoothing}
      />
      <TiltShift2
        blur={P.tiltShift.blur}
        taper={P.tiltShift.taper}
        start={P.tiltShift.start}
        end={P.tiltShift.end}
        samples={style.render.tiltShiftSamples}
      />
      <Vignette ref={vignette as never} offset={P.vignetteOffset} darkness={P.vignette.day} />
      <primitive object={paper} />
    </EffectComposer>
  )
}
