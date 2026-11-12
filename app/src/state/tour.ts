import { create } from 'zustand'

type Tour = {
  active: boolean
  /** 当前显示诗句的站，-1 表示镜头在路上、不显示文字 */
  index: number
  /** 用户是否已经动过画面。动过就不再自动开始导览 */
  touched: boolean
  start: () => void
  stop: () => void
  setIndex: (i: number) => void
  touch: () => void
}

export const useTour = create<Tour>((set) => ({
  active: false,
  index: -1,
  touched: false,
  start: () => set({ active: true, index: -1 }),
  stop: () => set({ active: false, index: -1 }),
  setIndex: (index) => set({ index }),
  touch: () => set({ touched: true }),
}))
