import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from './config/style'
import { Scene } from './scene/Scene'
import { NightToggle } from './ui/NightToggle'
import { useNight } from './state/night'

const params = new URLSearchParams(location.search)
// 调试：?night 直接进入夜晚；window.__night(true|false) 切换
if (params.has('night')) useNight.getState().set(true, true)
;(window as unknown as Record<string, unknown>).__night = (v: boolean, instant = false) => useNight.getState().set(v, instant)

export function App() {
  const isNight = useNight((s) => s.isNight)
  return (
    <div className={`app ${isNight ? 'is-night' : 'is-day'}`}>
      <Canvas
        flat
        dpr={[1, style.render.maxDpr]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: style.camera.fov, near: 5, far: 12000, position: style.camera.position }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping
        }}
      >
        <Scene />
      </Canvas>
      <NightToggle />
      {params.has('stats') && <div id="perf" className="perf" />}
    </div>
  )
}
