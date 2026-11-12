import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { style } from '../config/style'
import { landmarks, useSceneData, type SceneData } from '../data/loaders'
import { tourStops, type TourStop } from '../data/tour'
import { lngLatToScene } from '../geo/geo'
import { useNight } from '../state/night'
import { useSelection } from '../state/selection'
import { useTour } from '../state/tour'
import { weather } from '../state/weather'
import { terrainY } from './terrainHeight'

const T = style.tour
const Cm = style.camera
type V3 = [number, number, number]

/** 一站的镜头：起点、终点、注视点 */
function pose(d: SceneData, s: TourStop): [V3, V3, V3] {
  const item = s.id ? landmarks.find((l) => l.id === s.id) : null
  if (!item || !s.from || !s.to) {
    // 全景站：主镜头，停留期间向注视点缓推一点
    const p = Cm.position, t = Cm.target, k = T.overviewPush
    return [[...p], [p[0] + (t[0] - p[0]) * k, p[1] + (t[1] - p[1]) * k, p[2] + (t[2] - p[2]) * k], [...t]]
  }
  const [x, z] = lngLatToScene(item.lng, item.lat)
  const y = Math.max(terrainY(d, x, z), 0)
  return [[x + s.from[0], y + s.from[1], z + s.from[2]], [x + s.to[0], y + s.to[1], z + s.to[2]], [x, y + (s.lift ?? 0), z]]
}

/** 画卷导览：镜头依次飞过各站，同时切换光线和天气。用户一拖动画面就停止 */
export function TourDirector() {
  const active = useTour((s) => s.active)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const d = useSceneData()
  const selected = useSelection((s) => s.selected)

  // 开场结束后，如果用户还没动过画面，自动开始
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('noauto') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setTimeout(() => { if (!useTour.getState().touched) useTour.getState().start() }, (style.entrance.duration + T.autoDelay) * 1000)
    return () => clearTimeout(id)
  }, [])

  // 点了某个景点就退出导览
  useEffect(() => { if (selected) { useTour.getState().touch(); if (useTour.getState().active) useTour.getState().stop() } }, [selected])

  useEffect(() => {
    if (!active || !controls) return
    useSelection.getState().select(null)
    const tour = useTour.getState()
    const tl = gsap.timeline({ onUpdate: () => controls.update(), onComplete: () => useTour.getState().stop() })
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tourTl = tl // 调试：定格导览的某一刻
    let t = 0
    tourStops.forEach((s, i) => {
      const [from, to, target] = pose(d, s)
      tl.call(() => tour.setIndex(-1), [], t)
      tl.to(camera.position, { x: from[0], y: from[1], z: from[2], duration: T.fly, ease: 'power2.inOut' }, t)
      tl.to(controls.target, { x: target[0], y: target[1], z: target[2], duration: T.fly, ease: 'power2.inOut' }, t)
      tl.call(() => useNight.getState().level(s.night, T.fly), [], t)
      tl.to(weather, { snow: s.snow ?? 0, petals: s.petals ?? 0, duration: T.fly, ease: 'sine.inOut' }, t)
      tl.call(() => tour.setIndex(i), [], t + T.fly - T.textLead)
      tl.to(camera.position, { x: to[0], y: to[1], z: to[2], duration: T.dwell, ease: 'none' }, t + T.fly)
      t += T.fly + T.dwell
    })
    // 回到主镜头
    tl.call(() => tour.setIndex(-1), [], t)
    tl.to(camera.position, { x: Cm.position[0], y: Cm.position[1], z: Cm.position[2], duration: T.fly, ease: 'power2.inOut' }, t)
    tl.to(controls.target, { x: Cm.target[0], y: Cm.target[1], z: Cm.target[2], duration: T.fly, ease: 'power2.inOut' }, t)
    return () => {
      tl.kill()
      gsap.to(weather, { snow: 0, petals: 0, duration: 1.5 })
      // 中途停下时，把光线收到最近的白天或夜晚
      const n = useNight.getState()
      n.set(n.isNight)
    }
  }, [active, controls, camera, d])
  return null
}
