import { useEffect, useState } from 'react'
import { useReady } from '../state/ready'

/** 加载画面：一张宣纸色的封面，题字和朱印。场景就绪后淡出并卸载 */
export function LoadingCover() {
  const ready = useReady((s) => s.ready)
  const [gone, setGone] = useState(false)
  useEffect(() => { if (ready) { const id = setTimeout(() => setGone(true), 1600); return () => clearTimeout(id) } }, [ready])
  if (gone) return null
  return (
    <div className={`cover ${ready ? 'leaving' : ''}`} aria-hidden={ready}>
      <div className="cover-title">
        <div className="cover-name">西湖</div>
        <div className="cover-sub"><em>杭州 · 青绿山水沙盘</em><span className="cover-seal">西湖</span></div>
      </div>
      <div className="cover-status">{ready ? '' : '展卷中'}</div>
    </div>
  )
}

/** 左上角的题签，常驻 */
export function TitleMark() {
  return (
    <div className="title-mark" aria-label="西湖">
      <span className="title-mark-name">西湖</span>
      <span className="title-mark-seal">杭州</span>
    </div>
  )
}
