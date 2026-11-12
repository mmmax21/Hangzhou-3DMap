import { style } from '../config/style'

/**
 * 全部用 Web Audio 合成的声音，不加载任何音频文件：
 * 水声和风声（滤波噪声）、白天的鸟鸣、夜晚的虫鸣、五声音阶的拨弦，以及导览每一站出现时的一声磬。
 * 只有用户点了声音按钮才会创建 AudioContext。
 */
const A = style.audio

export class SoundEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private dry!: GainNode
  private wet!: GainNode
  private dayBus!: GainNode
  private nightBus!: GainNode
  private noise!: AudioBuffer
  private timers: number[] = []
  private night = 0
  private degree = 2
  analyser: AnalyserNode | null = null

  get running() { return !!this.ctx && this.ctx.state === 'running' }

  async start() {
    if (!this.ctx) this.build()
    const ctx = this.ctx!
    await ctx.resume()
    this.master.gain.cancelScheduledValues(ctx.currentTime)
    this.master.gain.setTargetAtTime(A.master, ctx.currentTime, A.fade / 3)
  }

  stop() {
    const ctx = this.ctx
    if (!ctx) return
    this.master.gain.cancelScheduledValues(ctx.currentTime)
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
    window.setTimeout(() => { if (this.master.gain.value < 0.01) void ctx.suspend() }, 1500)
  }

  /** 0 白天，1 夜晚。鸟鸣和虫鸣按它交叉淡变 */
  setNight(v: number) {
    this.night = v
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.dayBus.gain.setTargetAtTime(Math.max(0, 1 - v * 1.6), t, 0.8)
    this.nightBus.gain.setTargetAtTime(Math.max(0, v * 1.6 - 0.6), t, 0.8)
  }

  /** 导览每一站的诗句出现时敲一声磬 */
  chime() {
    if (!this.running) return
    const ctx = this.ctx!, t = ctx.currentTime + 0.02
    const f0 = A.chime.freq
    ;[[1, 1, 3.2], [2.76, 0.42, 2.0], [5.4, 0.18, 1.1]].forEach(([ratio, amp, decay]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f0 * ratio
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(A.chime.volume * amp, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      o.connect(g); g.connect(this.dry); g.connect(this.wet)
      o.start(t); o.stop(t + decay + 0.1)
    })
  }

  // ---------------------------------------------------------------- 搭建
  private build() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = (this.ctx = new Ctx())
    this.master = ctx.createGain(); this.master.gain.value = 0
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -10; limiter.ratio.value = 8; limiter.attack.value = 0.005; limiter.release.value = 0.2
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048
    this.master.connect(limiter); limiter.connect(this.analyser); this.analyser.connect(ctx.destination)

    this.dry = ctx.createGain(); this.dry.connect(this.master)
    // 混响：一段指数衰减的噪声作脉冲响应，给拨弦和磬一点空间感
    const conv = ctx.createConvolver()
    conv.buffer = this.impulse(ctx, A.reverb.seconds, A.reverb.decay)
    this.wet = ctx.createGain(); this.wet.gain.value = A.reverb.mix
    this.wet.connect(conv); conv.connect(this.master)
    this.dayBus = ctx.createGain(); this.dayBus.connect(this.dry); this.dayBus.connect(this.wet)
    this.nightBus = ctx.createGain(); this.nightBus.gain.value = 0; this.nightBus.connect(this.dry)

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    this.water(); this.wind()
    this.loop(() => this.birds(), A.birds.gap)
    this.loop(() => this.crickets(), A.crickets.gap)
    this.melody()
    this.setNight(this.night)
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return
      if (document.hidden) void this.ctx.suspend()
      else if (this.master.gain.value > 0.01) void this.ctx.resume()
    })
  }

  private impulse(ctx: AudioContext, seconds: number, decay: number) {
    const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay)
    }
    return buf
  }

  private noiseSource() {
    const s = this.ctx!.createBufferSource()
    s.buffer = this.noise; s.loop = true; s.loopStart = Math.random() * 2
    s.start()
    return s
  }

  /** 低频正弦去调制一个增益，做出缓慢起伏 */
  private lfo(target: AudioParam, freq: number, depth: number) {
    const o = this.ctx!.createOscillator(), g = this.ctx!.createGain()
    o.frequency.value = freq; g.gain.value = depth
    o.connect(g); g.connect(target); o.start()
  }

  private water() {
    const ctx = this.ctx!
    // 底层：低沉的水体声
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 420
    const g1 = ctx.createGain(); g1.gain.value = A.water.volume
    this.noiseSource().connect(low); low.connect(g1); g1.connect(this.dry)
    this.lfo(g1.gain, 0.11, A.water.volume * 0.45)
    // 上层：拍岸的细碎声，起伏更快
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1300; band.Q.value = 0.8
    const g2 = ctx.createGain(); g2.gain.value = A.water.volume * 0.28
    this.noiseSource().connect(band); band.connect(g2); g2.connect(this.dry)
    this.lfo(g2.gain, 0.27, A.water.volume * 0.2)
    this.lfo(band.frequency, 0.07, 350)
  }

  private wind() {
    const ctx = this.ctx!
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 320; band.Q.value = 0.5
    const g = ctx.createGain(); g.gain.value = A.wind.volume
    this.noiseSource().connect(band); band.connect(g); g.connect(this.dry)
    this.lfo(g.gain, 0.045, A.wind.volume * 0.7)
    this.lfo(band.frequency, 0.031, 140)
  }

  /** 以随机间隔反复调用 fn */
  private loop(fn: () => void, gap: readonly [number, number]) {
    const tick = () => {
      if (this.running) fn()
      this.timers.push(window.setTimeout(tick, (gap[0] + Math.random() * (gap[1] - gap[0])) * 1000))
    }
    tick()
  }

  private birds() {
    if (this.night > 0.5) return
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.05
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8
    pan.connect(this.dayBus)
    const base = 2400 + Math.random() * 2200, count = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < count; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.06)
      const o = ctx.createOscillator(), g = ctx.createGain()
      const f = base * (0.9 + Math.random() * 0.25)
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * (1.15 + Math.random() * 0.3), t + 0.035)
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.08)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(A.birds.volume * (0.5 + Math.random() * 0.5), t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
      o.connect(g); g.connect(pan); o.start(t); o.stop(t + 0.12)
    }
  }

  private crickets() {
    if (this.night < 0.4) return
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.05
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.8 - 0.9
    pan.connect(this.nightBus)
    const f = 4100 + Math.random() * 700, pulses = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * 0.075
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(A.crickets.volume, t + 0.006)
      g.gain.setValueAtTime(A.crickets.volume, t + 0.03)
      g.gain.linearRampToValueAtTime(0, t + 0.045)
      o.connect(g); g.connect(pan); o.start(t); o.stop(t + 0.06)
    }
  }

  /** 一声拨弦：几个泛音各自衰减，起音略高再滑回，尾部带一点揉弦 */
  private pluck(freq: number, when: number, volume: number) {
    const ctx = this.ctx!
    const out = ctx.createGain(); out.gain.value = volume
    out.connect(this.dry); out.connect(this.wet)
    ;[[1, 1, 3.4], [2, 0.46, 2.5], [3, 0.3, 1.8], [4, 0.14, 1.2], [5, 0.08, 0.8]].forEach(([h, amp, decay]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.setValueAtTime(freq * h * 1.012, when)
      o.frequency.exponentialRampToValueAtTime(freq * h, when + 0.09)
      if (h === 1) {
        const vib = ctx.createOscillator(), vg = ctx.createGain()
        vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, when); vg.gain.linearRampToValueAtTime(freq * 0.006, when + 0.9)
        vib.connect(vg); vg.connect(o.frequency); vib.start(when); vib.stop(when + decay + 0.1)
      }
      g.gain.setValueAtTime(0, when)
      g.gain.linearRampToValueAtTime(amp, when + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, when + decay)
      o.connect(g); g.connect(out); o.start(when); o.stop(when + decay + 0.1)
    })
    // 指甲触弦的一点噪声
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq * 4; f.Q.value = 1.2
    g.gain.setValueAtTime(0.25, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
    n.connect(f); f.connect(g); g.connect(out); n.start(when, Math.random() * 3, 0.05)
  }

  /** 即兴的五声旋律：在音阶上小步游走，句子之间留白 */
  private melody() {
    const M = A.melody
    const scale: number[] = []
    for (let oct = 0; oct < M.octaves; oct++) M.ratios.forEach((r) => scale.push(M.root * r * Math.pow(2, oct)))
    const next = () => {
      let wait = M.note[0] + Math.random() * (M.note[1] - M.note[0])
      if (this.running) {
        const slow = 1 + this.night * M.nightSlow
        if (Math.random() < M.rest) wait = (M.pause[0] + Math.random() * (M.pause[1] - M.pause[0]))
        else {
          const step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]
          this.degree = Math.min(scale.length - 1, Math.max(0, this.degree + step))
          const t = this.ctx!.currentTime + 0.05, vol = M.volume * (1 - this.night * 0.25) * (0.75 + Math.random() * 0.25)
          this.pluck(scale[this.degree], t, vol)
          // 偶尔加一个低八度或上方五度，像琴的散音与按音相和
          if (Math.random() < M.harmony) this.pluck(scale[this.degree] * (Math.random() < 0.5 ? 0.5 : 1.5), t + 0.02, vol * 0.45)
        }
        wait *= slow
      }
      this.timers.push(window.setTimeout(next, wait * 1000))
    }
    this.timers.push(window.setTimeout(next, 1200))
  }
}

export const sound = new SoundEngine()
