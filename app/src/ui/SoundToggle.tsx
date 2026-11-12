import { useSound } from '../state/sound'

/** 声音开关：「声」表示正在播放，「静」表示静音 */
export function SoundToggle() {
  const { on, toggle } = useSound()
  return (
    <button className={`sound-toggle ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={on ? '关闭声音' : '打开声音'} title={on ? '关闭声音' : '打开声音'}>
      {on ? '声' : '静'}
    </button>
  )
}
