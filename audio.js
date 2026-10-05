// audio.js — lightweight horror ambience and procedural SFX.
export class HorrorAudio {
  constructor(){
    this.ctx=null;
    this.master=null;
    this.ambienceGain=null;
    this.sfxGain=null;
    this.muted=false;
    this.humGain=null;
  }

  start(){
    if(this.ctx){
      if(this.ctx.state==="suspended") this.ctx.resume();
      return;
    }

    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx) return;

    const ctx=new AudioCtx();
    this.ctx=ctx;

    this.master=ctx.createGain();
    this.master.gain.value=1;
    this.master.connect(ctx.destination);

    this.ambienceGain=ctx.createGain();
    this.ambienceGain.gain.value=this.muted?0:1;
    this.ambienceGain.connect(this.master);

    this.sfxGain=ctx.createGain();
    this.sfxGain.gain.value=1;
    this.sfxGain.connect(this.master);

    const hum=ctx.createOscillator();
    hum.type="sine";
    hum.frequency.value=118;
    this.humGain=ctx.createGain();
    this.humGain.gain.value=.0176;
    hum.connect(this.humGain).connect(this.ambienceGain);
    hum.start();

    const hum2=ctx.createOscillator();
    hum2.type="sine";
    hum2.frequency.value=236;
    const g2=ctx.createGain();
    g2.gain.value=.0033;
    hum2.connect(g2).connect(this.ambienceGain);
    hum2.start();

    const lfo=ctx.createOscillator();
    lfo.frequency.value=.11;
    const lg=ctx.createGain();
    lg.gain.value=.018;
    lfo.connect(lg).connect(this.humGain.gain);
    lfo.start();
  }

  toggleMute(){
    this.muted=!this.muted;

    if(this.ambienceGain && this.ctx){
      const now=this.ctx.currentTime;
      this.ambienceGain.gain.cancelScheduledValues(now);
      this.ambienceGain.gain.setTargetAtTime(this.muted?0:1,now,.05);
    }

    return this.muted;
  }

  breath(intensity=.65){
    if(!this.ctx || this.muted) return;
    const now=this.ctx.currentTime;
    const noise=this.ctx.createBufferSource();
    const buffer=this.ctx.createBuffer(1,Math.floor(this.ctx.sampleRate*.32),this.ctx.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*.28;
    noise.buffer=buffer;

    const filter=this.ctx.createBiquadFilter();
    filter.type="lowpass";
    filter.frequency.value=850;

    const gain=this.ctx.createGain();
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.055*intensity,now+.07);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.30);

    noise.connect(filter).connect(gain).connect(this.sfxGain);
    noise.start(now);
    noise.stop(now+.32);
  }

  land(intensity=.7){
    if(!this.ctx || this.muted) return;
    const now=this.ctx.currentTime;
    const osc=this.ctx.createOscillator();
    const gain=this.ctx.createGain();
    osc.type="sine";
    osc.frequency.setValueAtTime(86,now);
    osc.frequency.exponentialRampToValueAtTime(42,now+.13);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.07*intensity,now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.16);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now+.18);
  }

  slide(intensity=.7){
    if(!this.ctx || this.muted) return;
    const now=this.ctx.currentTime;
    const osc=this.ctx.createOscillator();
    const gain=this.ctx.createGain();
    osc.type="triangle";
    osc.frequency.setValueAtTime(180,now);
    osc.frequency.exponentialRampToValueAtTime(72,now+.24);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.035*intensity,now+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.28);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now+.30);
  }

  step(intensity=.7){
    if(!this.ctx)return;

    const now=this.ctx.currentTime;
    const osc=this.ctx.createOscillator();
    const gain=this.ctx.createGain();

    osc.type="triangle";
    osc.frequency.setValueAtTime(95+Math.random()*30,now);
    osc.frequency.exponentialRampToValueAtTime(48,now+.10);

    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.045*intensity,now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.12);

    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now+.14);
  }

  scare(){
    if(!this.ctx||this.muted)return;

    const now=this.ctx.currentTime;

    const low=this.ctx.createOscillator();
    const lg=this.ctx.createGain();
    low.type="sine";
    low.frequency.setValueAtTime(48,now);
    low.frequency.exponentialRampToValueAtTime(25,now+.7);
    lg.gain.setValueAtTime(.0001,now);
    lg.gain.exponentialRampToValueAtTime(.12,now+.08);
    lg.gain.exponentialRampToValueAtTime(.0001,now+.75);
    low.connect(lg).connect(this.sfxGain);
    low.start(now);
    low.stop(now+.8);

    const click=this.ctx.createOscillator();
    const cg=this.ctx.createGain();
    click.type="square";
    click.frequency.value=1800;
    cg.gain.setValueAtTime(.0001,now);
    cg.gain.exponentialRampToValueAtTime(.035,now+.006);
    cg.gain.exponentialRampToValueAtTime(.0001,now+.045);
    click.connect(cg).connect(this.sfxGain);
    click.start(now);
    click.stop(now+.05);
  }
}