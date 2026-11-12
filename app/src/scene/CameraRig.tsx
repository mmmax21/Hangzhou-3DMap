import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { style } from '../config/style'
import { OCT } from './terrainHeight'
import { useSelection } from '../state/selection'
import { lngLatToScene } from '../geo/geo'
import { useSceneData } from '../data/loaders'
import { terrainY } from './terrainHeight'
import gsap from 'gsap'
import { useTour } from '../state/tour'

const Cm = style.camera
const deg = Math.PI / 180
const autoAllowed = !new URLSearchParams(location.search).has('noauto')

/** 自由视角：俯仰 20°~75°，缩放有上下限，目标点限制在沙盘内；静止 10 秒后恢复缓慢环绕 */
export function CameraRig() {
  const ref = useRef<OrbitControlsImpl>(null!)
  const camera = useThree((s) => s.camera)
  const lastInput = useRef(performance.now() / 1000 + style.entrance.duration - Cm.idleResumeSec)
  const selected = useSelection(s => s.selected)
  const data = useSceneData()
  const flight=useRef<gsap.core.Timeline|null>(null)
  const initial=useRef(true)
  const introTween=useRef<gsap.core.Tween|null>(null)
  const touring=useTour(s=>s.active)
  // 导览开始时，开场运镜和景点飞行都让位
  useEffect(()=>{ if(touring){ introTween.current?.kill(); flight.current?.kill() } },[touring])

  useEffect(() => {
    camera.position.set(...Cm.position)
    ref.current?.target.set(...Cm.target)
    ref.current?.update()
    // 开场运镜：从高处俯视平铺的画面，降到主镜头
    const e = style.entrance
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      introTween.current = gsap.fromTo(camera.position,
        { x: Cm.target[0] + e.cameraFrom[0], y: e.cameraFrom[1], z: Cm.target[2] + e.cameraFrom[2] },
        { x: Cm.position[0], y: Cm.position[1], z: Cm.position[2], duration: e.cameraDuration, delay: e.cameraStart, ease: 'power2.inOut', onUpdate: () => ref.current?.update() })
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__introCam = introTween.current
    }
    ;(window as unknown as Record<string, unknown>).__controls = ref.current
    // 组件重新挂载时必须停掉旧的运镜，否则会有一个停不下来的动画一直抢镜头
    return () => { introTween.current?.kill() }
  }, [camera])

  useEffect(() => {
    if(initial.current&&!selected){initial.current=false;return}
    if(useTour.getState().active)return // 导览自己管镜头
    const c = ref.current
    if (!c) return
    const [x,z] = selected ? lngLatToScene(selected.lng, selected.lat) : [Cm.target[0], Cm.target[2]]
    const y = selected ? Math.max(terrainY(data,x,z),0) : Cm.target[1]
    const pos = selected ? [x + style.landmarks.flightOffset[0], y + style.landmarks.flightOffset[1], z + style.landmarks.flightOffset[2]] : Cm.position
    c.autoRotate=false
    const timeline = gsap.timeline({onComplete:()=>{lastInput.current=performance.now()/1000}})
    flight.current=timeline
    timeline.to(camera.position, { x:pos[0], y:pos[1], z:pos[2], duration:style.landmarks.flightDuration, ease:'power2.inOut' }, 0)
    timeline.to(c.target, { x, y, z, duration:style.landmarks.flightDuration, ease:'power2.inOut', onUpdate:()=>c.update() }, 0)
    return () => { timeline.kill() }
  }, [selected, data, camera])

  useFrame(() => {
    const c = ref.current
    if (!c) return
    const t = c.target
    t.x = THREE.MathUtils.clamp(t.x, -OCT.hx, OCT.hx)
    t.z = THREE.MathUtils.clamp(t.z, -OCT.hz, OCT.hz)
    t.y = Math.max(t.y, 0)
    c.autoRotate = autoAllowed && !selected && !useTour.getState().active && !flight.current?.isActive() && performance.now() / 1000 - lastInput.current > Cm.idleResumeSec
  })

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={Cm.minDistance}
      maxDistance={Cm.maxDistance}
      // OrbitControls 的极角从正上方量起：俯仰 75° ↔ 极角 15°，俯仰 20° ↔ 极角 70°
      minPolarAngle={(90 - Cm.maxPitchDeg) * deg}
      maxPolarAngle={(90 - Cm.minPitchDeg) * deg}
      autoRotateSpeed={Cm.autoRotateSpeed}
      screenSpacePanning={false}
      onStart={() => {useTour.getState().touch();useTour.getState().stop();introTween.current?.kill();flight.current?.kill();lastInput.current = Infinity}}
      onEnd={() => (lastInput.current = performance.now() / 1000 - 0)}
    />
  )
}
