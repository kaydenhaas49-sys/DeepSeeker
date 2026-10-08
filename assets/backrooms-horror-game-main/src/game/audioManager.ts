// ============================================================================
// audioManager.ts — All game audio is synthesized via the Web Audio API.
// No external files required. Includes footsteps, ambient drone, fluorescent
// hum, entity growls, page pickup, and the jumpscare sting.
// ============================================================================

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private humOsc: OscillatorNode | null = null;
  private started = false;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    this.ctx?.resume();
  }

  startAmbient() {
    if (!this.ctx || !this.masterGain || this.started) return;
    this.started = true;

    const rumble = this.ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 38;
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.04;
    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 120;
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(this.masterGain);
    rumble.start();
    this.ambientNodes.push(rumble, rumbleGain, rumbleFilter);

    const hum = this.ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 120;
    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.015;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'bandpass';
    humFilter.frequency.value = 120;
    humFilter.Q.value = 8;
    hum.connect(humFilter).connect(humGain).connect(this.masterGain);
    hum.start();
    this.humOsc = hum;
    this.ambientNodes.push(hum, humGain, humFilter);

    const hiss = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 0.5;
    hiss.buffer = buffer;
    hiss.loop = true;
    const hissGain = this.ctx.createGain();
    hissGain.gain.value = 0.008;
    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 4000;
    hiss.connect(hissFilter).connect(hissGain).connect(this.masterGain);
    hiss.start();
    this.ambientNodes.push(hiss, hissGain, hissFilter);
  }

  playFootstep(sprinting: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * Math.exp(-i / (data.length * 0.3));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sprinting ? 500 : 350;
    const gain = this.ctx.createGain();
    gain.gain.value = sprinting ? 0.18 : 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    src.connect(filter).connect(gain).connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.08);
  }

  playEntityFootstep(intensity: number) {
    if (!this.ctx || !this.masterGain || intensity <= 0) return;
    const now = this.ctx.currentTime;

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * Math.exp(-i / (data.length * 0.25));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = this.ctx.createGain();
    const vol = 0.25 * intensity;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    src.connect(filter).connect(gain).connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.15);
  }

  playGrowl(intensity: number) {
    if (!this.ctx || !this.masterGain || intensity <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.linearRampToValueAtTime(35, now + 0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(filter).connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  playPagePickup() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    [523, 659, 784].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.3);
      osc.connect(gain).connect(this.masterGain!);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.3);
    });
  }

  playJumpscare() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(110, now + 1.2);
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(233, now);
    osc2.frequency.exponentialRampToValueAtTime(55, now + 1.2);

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    osc1.connect(filter);
    osc2.connect(filter);
    noise.connect(noiseGain).connect(filter);
    filter.connect(gain).connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    noise.start(now);
    osc1.stop(now + 1.5);
    osc2.stop(now + 1.5);
  }

  playClick() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  playStateStinger() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    osc.connect(filter).connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  dispose() {
    this.ambientNodes.forEach((n) => {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* not an oscillator */
      }
      n.disconnect();
    });
    this.ambientNodes = [];
    this.ctx?.close();
    this.ctx = null;
  }
}
