import { create } from 'zustand'
import { sound } from '../audio/engine'
import { uNight } from './night'
import { useTour } from './tour'

/** 声音开关。默认关闭，浏览器也要求用户先点一下才能出声 */
export const useSound = create<{ on: boolean; toggle: () => void }>((set, get) => ({
  on: false,
  toggle: () => {
    const on = !get().on
    set({ on })
    if (on) void sound.start(); else sound.stop()
  },
}))

// 昼夜变化时交叉淡变鸟鸣和虫鸣
let last = -1
window.setInterval(() => {
  if (!useSound.getState().on) return
  const v = Math.round(uNight.value * 20) / 20
  if (v !== last) { last = v; sound.setNight(v) }
}, 250)

// 导览每到一站敲一声磬
useTour.subscribe((s, prev) => { if (s.index >= 0 && s.index !== prev.index && useSound.getState().on) sound.chime() })

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sound = sound
