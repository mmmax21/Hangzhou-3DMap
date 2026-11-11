import { style } from './style'
const params = new URLSearchParams(location.search)
const device = navigator as Navigator & { deviceMemory?: number }
const mobile = matchMedia(`(max-width: ${style.render.mobileWidth}px), (pointer: coarse)`).matches
const weak = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= style.render.lowCpuCores) || (device.deviceMemory !== undefined && device.deviceMemory <= style.render.lowMemoryGb)
export const lowQuality = import.meta.env.DEV && params.has('quality') ? params.get('quality') === 'low' : mobile || weak
