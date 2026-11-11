import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { style } from '../config/style'
import { OCT } from './terrainHeight'

const Cm = style.camera
const deg = Math.PI / 180
const autoAllowed = !new URLSearchParams(location.search).has('noauto')

/** 自由视角：俯仰 20°~75°，缩放有上下限，目标点限制在沙盘内；静止 10 秒后恢复缓慢环绕 */
export function CameraRig() {
  const ref = useRef<OrbitControlsImpl>(null!)
  const camera = useThree((s) => s.camera)
  const lastInput = useRef(-Infinity)

  useEffect(() => {
    camera.position.set(...Cm.position)
    ref.current?.target.set(...Cm.target)
    ref.current?.update()
    ;(window as unknown as Record<string, unknown>).__controls = ref.current
  }, [camera])

  useFrame(({ clock }) => {
    const c = ref.current
    if (!c) return
    const t = c.target
    t.x = THREE.MathUtils.clamp(t.x, -OCT.hx, OCT.hx)
    t.z = THREE.MathUtils.clamp(t.z, -OCT.hz, OCT.hz)
    t.y = THREE.MathUtils.clamp(t.y, 0, 40)
    c.autoRotate = autoAllowed && clock.elapsedTime - lastInput.current > Cm.idleResumeSec
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
      onStart={() => (lastInput.current = Infinity)}
      onEnd={() => (lastInput.current = performance.now() / 1000 - 0)}
    />
  )
}
