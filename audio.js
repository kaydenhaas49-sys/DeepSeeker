// audio.js — lightweight horror ambience and procedural SFX.
export class HorrorAudio {
  constructor(){
    this.ctx=null;
    this.master=null;
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
    this.master.gain.value=.055;
    this.master.connect(ctx.destination);

    const hum=ctx.createOscillator();
    hum.type="sine";
    hum.frequency.value=118;
    this.humGain=ctx.createGain();
    this.humGain.gain.value=.32;
    hum.connect(this.humGain).connect(this.master);
    hum.start();

    const hum2=ctx.createOscillator();
    hum2.type="sine";
    hum2.frequency.value=236;
    const g2=ctx.createGain();
    g2.gain.value=.06;
    hum2.connect(g2).connect(this.master);
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
    if(this.master) this.master.gain.setTargetAtTime(this.muted?0:.055,this.ctx.currentTime,.15);
    return this.muted;
  }

  step(intensity=.7){
    if(!this.ctx||this.muted)return;
    const now=this.ctx.currentTime;
    const osc=this.ctx.createOscillator();
    const gain=this.ctx.createGain();
    osc.type="triangle";
    osc.frequency.setValueAtTime(95+Math.random()*30,now);
    osc.frequency.exponentialRampToValueAtTime(48,now+.10);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.045*intensity,now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.12);
    osc.connect(gain).connect(this.master);
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
    low.connect(lg).connect(this.master);
    low.start(now);
    low.stop(now+.8);

    const click=this.ctx.createOscillator();
    const cg=this.ctx.createGain();
    click.type="square";
    click.frequency.value=1800;
    cg.gain.setValueAtTime(.0001,now);
    cg.gain.exponentialRampToValueAtTime(.035,now+.006);
    cg.gain.exponentialRampToValueAtTime(.0001,now+.045);
    click.connect(cg).connect(this.master);
    click.start(now);
    click.stop(now+.05);
  }
}