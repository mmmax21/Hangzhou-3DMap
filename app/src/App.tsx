import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { style } from './config/style'
import { Scene } from './scene/Scene'
import { NightToggle } from './ui/NightToggle'
import { TourOverlay, TourToggle } from './ui/Tour'
import { LoadingCover, TitleMark } from './ui/Chrome'
import { useTour } from './state/tour'
import { useNight } from './state/night'
import { useSelection } from './state/selection'
import { landmarks } from './data/loaders'
import { useState, type CSSProperties } from 'react'
import { usePerfTier } from './state/perf'

const params = new URLSearchParams(location.search)
// 调试：?night 直接进入夜晚；window.__night(true|false) 切换
if (params.has('night')) useNight.getState().set(true, true)
;(window as unknown as Record<string, unknown>).__night = (v: boolean, instant = false) => useNight.getState().set(v, instant)

export function App() {
  const isNight = useNight((s) => s.isNight)
  const { selected, select } = useSelection()
  const [open, setOpen] = useState(true)
  const touring = useTour((s) => s.active)
  const tier = usePerfTier((s) => s.tier)
  const ui = style.ui
  return (
    <div className={`app ${isNight ? 'is-night' : 'is-day'}`} style={{ '--panel-bg': isNight ? ui.background.night : ui.background.day, '--panel-fg': isNight ? ui.text.night : ui.text.day, '--panel-line': isNight ? ui.border.night : ui.border.day, '--panel-inset':`${ui.inset}px`, '--panel-width':`${ui.width}px`, '--panel-padding':`${ui.padding}px`, '--panel-font':`${ui.fontSize}px`, '--panel-heading':`${ui.headingSize}px` } as CSSProperties}>
      <Canvas
        flat
        dpr={Math.min(window.devicePixelRatio, style.adaptive.dpr[tier])} // 像素比随画质档位下调
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: style.camera.fov, near: 5, far: 12000, position: style.camera.position }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping
        }}
        onPointerMissed={() => select(null)}
      >
        <Scene />
      </Canvas>
      <TitleMark />
      <NightToggle />
      <TourToggle />
      <TourOverlay />
      <style>{`@media (max-width:${ui.compactWidth}px) { .landmark-list.has-selection .landmark-items { display:none; } .landmark-list.has-selection { bottom:auto; top:var(--panel-inset); } }`}</style>
      {!touring && <div className={`landmark-list ${selected ? 'has-selection' : ''}`}><button className="list-head" onClick={() => setOpen(!open)} aria-expanded={open}>景点<i>{open ? '收起' : '展开'}</i></button>{open && <div className="landmark-items">{landmarks.map(item => <button key={item.id} onClick={() => select(item)} aria-pressed={selected?.id === item.id}>{item.name}</button>)}</div>}</div>}
      {selected && <article className="landmark-card" key={selected.id}><button className="close" aria-label="关闭景点卡片" onClick={() => select(null)}>×</button><h2>{selected.name}</h2><p className="card-intro">{selected.intro || `${selected.name}，西湖风景名胜区景点。`}</p>{selected.poem && <p className="card-poem">{selected.poem}<span>{selected.poemSource}</span></p>}</article>}
      <LoadingCover />
      {params.has('stats') && <div id="perf" className="perf" />}
    </div>
  )
}
