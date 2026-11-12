import { useNight } from '../state/night'
import { useTour } from '../state/tour'

/** 右上角昼夜开关。只改全局状态，过渡由 uNight 补间完成 */
export function NightToggle() {
  const { isNight, toggle } = useNight()
  return (
    <button className="night-toggle" onClick={() => { useTour.getState().touch(); useTour.getState().stop(); toggle() }} aria-label={isNight ? '切换到白天' : '切换到夜晚'}>
      <span className="night-toggle__glyph">{isNight ? '夜' : '昼'}</span>
    </button>
  )
}
