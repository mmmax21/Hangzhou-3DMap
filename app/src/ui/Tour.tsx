import { useEffect, useState } from 'react'
import { tourStops } from '../data/tour'
import { useTour } from '../state/tour'

/** 导览开关，放在昼夜按钮左边 */
export function TourToggle() {
  const { active, start, stop, touch } = useTour()
  return (
    <button className="tour-toggle" onClick={() => { touch(); active ? stop() : start() }} aria-pressed={active}>
      {active ? '停止' : '导览'}
    </button>
  )
}

/** 导览时浮现的竖排景名和诗句 */
export function TourOverlay() {
  const active = useTour((s) => s.active)
  const index = useTour((s) => s.index)
  // 文字淡出时仍要显示上一站的内容，所以记住最后一次有效的站
  const [last, setLast] = useState(0)
  useEffect(() => { if (index >= 0) setLast(index) }, [index])
  if (!active) return null
  const s = tourStops[index >= 0 ? index : last]
  return (
    <>
      <div className={`tour-text ${index >= 0 ? 'visible' : ''}`} aria-live="polite">
        <div className="tour-title">{s.title}<span className="tour-seal">西湖</span></div>
        {s.poem.map((line) => <div className="tour-poem" key={line}>{line}</div>)}
        <div className="tour-source">{s.source}</div>
      </div>
      <div className="tour-hint">拖动画面，随时自由浏览</div>
    </>
  )
}
