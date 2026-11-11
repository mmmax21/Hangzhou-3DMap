import * as THREE from 'three'
import gsap from 'gsap'
import { create } from 'zustand'
import { style, type DN } from '../config/style'

/**
 * 唯一的昼夜状态：uNight（0 白天 → 1 夜晚）。
 * 所有着色器的 uniforms 直接引用这个对象；JS 侧在 useFrame 里读 uNight.value。
 * 其它模块不得自己维护昼夜状态。
 */
export const uNight = { value: 0 }

/** 共享给所有自定义着色器的 uniforms（同一对象引用） */
export const shared = {
  uNight,
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  /** 从相机指向月亮的世界方向，由 Atmosphere 逐帧更新，水面倒影使用 */
  uMoonDir: { value: new THREE.Vector3(0, 0.3, -1) },
}

type NightStore = { isNight: boolean; toggle: () => void; set: (night: boolean, instant?: boolean) => void }

export const useNight = create<NightStore>((setState, get) => ({
  isNight: false,
  toggle: () => get().set(!get().isNight),
  set: (night, instant = false) => {
    setState({ isNight: night })
    gsap.killTweensOf(uNight)
    if (instant) uNight.value = night ? 1 : 0
    else gsap.to(uNight, { value: night ? 1 : 0, duration: style.transition.duration, ease: 'sine.inOut' })
  },
}))

// ---------------------------------------------------------------- 插值工具
const _a = new THREE.Color()
const _b = new THREE.Color()

export const lerp = (p: DN<number>, t = uNight.value) => p.day + (p.night - p.day) * t

export function lerpColor(p: DN<string>, out: THREE.Color, t = uNight.value) {
  _a.set(p.day)
  _b.set(p.night)
  return out.copy(_a).lerp(_b, t)
}

/** 颜色对 -> 着色器 uniform（vec3[2]，在 GLSL 里用 DNC(x) 取插值） */
export function colorPair(p: DN<string>) {
  return { value: [new THREE.Color(p.day), new THREE.Color(p.night)] }
}

export function numPair(p: DN<number>) {
  return { value: [p.day, p.night] }
}
