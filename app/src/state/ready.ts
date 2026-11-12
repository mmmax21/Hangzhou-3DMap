import { create } from 'zustand'

/** 场景数据加载完、开场开始播放时置为 true，加载画面据此淡出 */
export const useReady = create<{ ready: boolean; markReady: () => void }>((set) => ({ ready: false, markReady: () => set({ ready: true }) }))
