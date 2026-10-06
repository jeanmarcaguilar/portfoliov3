/**
 * Ambient audio synthesizer for the Dev Lounge using pure Web Audio API.
 * Zero external audio files or dependencies.
 */

export type AmbientSoundType = 'rain' | 'coffee' | 'fire' | 'off'

class LoungeAudioEngine {
  private ctx: AudioContext | null = null
  private currentMode: AmbientSoundType = 'off'
  private masterGain: GainNode | null = null
  private noiseNode: AudioBufferSourceNode | null = null
  private filterNode: BiquadFilterNode | null = null
  private crackleInterval: number | null = null
  private volume = 0.45

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      if (!AudioCtx) return null
      this.ctx = new AudioCtx()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  // Generates filtered brown/pink noise buffer
  private createNoiseBuffer(duration = 4): AudioBuffer | null {
    const ctx = this.getContext()
    if (!ctx) return null
    const bufferSize = ctx.sampleRate * duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      output[i] =
        (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.12
      b6 = white * 0.115926
    }
    return buffer
  }

  setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val))
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime)
    }
  }

  getVolume(): number {
    return this.volume
  }

  getCurrentMode(): AmbientSoundType {
    return this.currentMode
  }

  stop() {
    if (this.crackleInterval) {
      window.clearInterval(this.crackleInterval)
      this.crackleInterval = null
    }
    if (this.noiseNode) {
      try {
        this.noiseNode.stop()
        this.noiseNode.disconnect()
      } catch {
        // Ignored
      }
      this.noiseNode = null
    }
    this.currentMode = 'off'
  }

  playAmbient(type: AmbientSoundType) {
    this.stop()
    if (type === 'off') return

    const ctx = this.getContext()
    if (!ctx || !this.masterGain) return

    const buffer = this.createNoiseBuffer(5)
    if (!buffer) return

    this.noiseNode = ctx.createBufferSource()
    this.noiseNode.buffer = buffer
    this.noiseNode.loop = true

    this.filterNode = ctx.createBiquadFilter()

    if (type === 'rain') {
      this.filterNode.type = 'lowpass'
      this.filterNode.frequency.setValueAtTime(900, ctx.currentTime)
      this.noiseNode.connect(this.filterNode)
      this.filterNode.connect(this.masterGain)
      this.noiseNode.start()
    } else if (type === 'coffee') {
      this.filterNode.type = 'bandpass'
      this.filterNode.frequency.setValueAtTime(420, ctx.currentTime)
      this.filterNode.Q.setValueAtTime(1.1, ctx.currentTime)
      this.noiseNode.connect(this.filterNode)
      this.filterNode.connect(this.masterGain)
      this.noiseNode.start()
    } else if (type === 'fire') {
      this.filterNode.type = 'lowpass'
      this.filterNode.frequency.setValueAtTime(450, ctx.currentTime)
      this.noiseNode.connect(this.filterNode)
      this.filterNode.connect(this.masterGain)
      this.noiseNode.start()

      // Random crackle pops
      this.crackleInterval = window.setInterval(() => {
        if (Math.random() > 0.45) this.playCrackle()
      }, 260)
    }

    this.currentMode = type
  }

  private playCrackle() {
    const ctx = this.getContext()
    if (!ctx || !this.masterGain) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(220 + Math.random() * 700, ctx.currentTime)
    gain.gain.setValueAtTime(this.volume * 0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)
    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start()
    osc.stop(ctx.currentTime + 0.04)
  }

  playBrewChime() {
    const ctx = this.getContext()
    if (!ctx) return

    const notes = [523.25, 659.25, 783.99] // C5, E5, G5 triad
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const start = ctx.currentTime + idx * 0.11
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.65)
    })
  }

  playKeyClick() {
    const ctx = this.getContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1100 + Math.random() * 450, ctx.currentTime)
    gain.gain.setValueAtTime(0.03, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.025)
  }
}

export const loungeAudio = new LoungeAudioEngine()
