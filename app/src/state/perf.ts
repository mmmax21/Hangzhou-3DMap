import { create } from 'zustand'
import { lowQuality } from '../config/quality'

/**
 * 运行时画质档位。开局按设备猜一个，之后按实测帧率只降不升：
 * 0 全开；1 去掉湖面真实倒影并降低像素比；2 再去掉移轴、宣纸纹理和云雾，像素比降到 1。
 * 开发环境可用 ?tier=0|1|2 强制指定。
 */
const params = new URLSearchParams(location.search)
const forced = import.meta.env.DEV && params.has('tier') ? Number(params.get('tier')) : null

type PerfTier = { tier: number; decline: () => void }
export const usePerfTier = create<PerfTier>((set, get) => ({
  tier: forced ?? (lowQuality ? 2 : 0),
  decline: () => { if (forced === null && get().tier < 2) set({ tier: get().tier + 1 }) },
}))
