import { useEffect, useState } from 'react'
import { PerformanceMonitor } from '@react-three/drei'
import { style } from '../config/style'
import { usePerfTier } from '../state/perf'

const A = style.adaptive

/** 实测帧率低于下限时逐档降画质。像素比由 App 里的 Canvas 按档位设置。只降不升，避免来回跳 */
export function AdaptiveQuality() {
  const tier = usePerfTier((s) => s.tier)
  const decline = usePerfTier((s) => s.decline)
  // 开场阶段有着色器编译和资源加载的卡顿，等它结束再开始监测
  const [armed, setArmed] = useState(false)
  useEffect(() => { const id = setTimeout(() => setArmed(true), (style.entrance.duration + A.settle) * 1000); return () => clearTimeout(id) }, [])
  useEffect(() => { if (import.meta.env.DEV) console.info(`[quality] tier=${tier}`) }, [tier])
  if (!armed || tier >= 2) return null
  // key 随档位变化：每降一档就重新开始统计
  return <PerformanceMonitor key={tier} ms={A.windowMs} iterations={A.windows} threshold={A.threshold} bounds={() => [A.minFps, 1000]} onDecline={decline} />
}
