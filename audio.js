// audio.js — lightweight horror ambience and procedural SFX.
export class HorrorAudio {
  constructor(){
    this.ctx=null;
    this.master=null;
    this.ambienceGain=null;
    this.sfxGain=null;
    this.muted=false;
    this.humGain=null;
    this.noiseBuffer=null;
    this.ambientTimer=6+Math.random()*7;
    this.heartbeatTimer=0;
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

    // One reusable noise buffer powers the distant room sounds.
    this.noiseBuffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*2),ctx.sampleRate);
    const noiseData=this.noiseBuffer.getChannelData(0);
    for(let i=0;i<noiseData.length;i++) noiseData[i]=Math.random()*2-1;

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

    // A quiet, filtered air-duct layer adds depth without masking gameplay.
    const air=ctx.createBufferSource();
    air.buffer=this.noiseBuffer;
    air.loop=true;
    const airFilter=ctx.createBiquadFilter();
    airFilter.type="lowpass";
    airFilter.frequency.value=420;
    airFilter.Q.value=.45;
    const airGain=ctx.createGain();
    airGain.gain.value=.0032;
    air.connect(airFilter).connect(airGain).connect(this.ambienceGain);
    air.start();
  }

  update(dt,{playing=false,threat=false,threatDistance=Infinity}={}){
    if(!this.ctx || !Number.isFinite(dt)) return;
    const elapsed=Math.min(.25,Math.max(0,dt));
    if(!playing){
      this.heartbeatTimer=Math.max(0,this.heartbeatTimer-elapsed);
      return;
    }

    // Random room sounds leave plenty of silence between events.
    this.ambientTimer-=elapsed;
    if(this.ambientTimer<=0){
      if(!this.muted && this.ctx.state==="running") this._playRandomAmbient();
      this.ambientTimer=14+Math.random()*18;
    }

    const distance=Number.isFinite(threatDistance)?threatDistance:Infinity;
    const tension=threat?Math.max(0,Math.min(1,(16-distance)/14)):0;
    this.heartbeatTimer-=elapsed;
    if(tension>.12 && this.heartbeatTimer<=0){
      if(!this.muted && this.ctx.state==="running") this._heartbeat(tension);
      this.heartbeatTimer=Math.max(.46,1.34-tension*.72)+Math.random()*.14;
    }else if(tension<=.12 && this.heartbeatTimer<0){
      this.heartbeatTimer=0;
    }
  }

  _ambientOutput(pan=0){
    const output=this.ctx.createGain();
    if(typeof this.ctx.createStereoPanner==="function"){
      const panner=this.ctx.createStereoPanner();
      panner.pan.value=Math.max(-.85,Math.min(.85,pan));
      output.connect(panner).connect(this.ambienceGain);
    }else{
      output.connect(this.ambienceGain);
    }
    return output;
  }

  _playNoise({when=this.ctx.currentTime,duration=.35,type="bandpass",frequency=850,sweepTo=null,volume=.006,attack=.035,pan=0,q=.7}={}){
    if(!this.ctx || !this.noiseBuffer || !this.ambienceGain) return;
    const ctx=this.ctx;
    const source=ctx.createBufferSource();
    source.buffer=this.noiseBuffer;
    source.playbackRate.value=.88+Math.random()*.3;
    const filter=ctx.createBiquadFilter();
    filter.type=type;
    filter.frequency.setValueAtTime(frequency,when);
    if(sweepTo!==null && sweepTo>0) filter.frequency.exponentialRampToValueAtTime(sweepTo,when+duration*.85);
    filter.Q.value=q;
    const envelope=ctx.createGain();
    envelope.gain.setValueAtTime(.0001,when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),when+Math.min(attack,duration*.4));
    envelope.gain.exponentialRampToValueAtTime(.0001,when+duration);
    source.connect(filter).connect(envelope).connect(this._ambientOutput(pan));
    source.start(when,Math.random()*.25,duration);
    source.stop(when+duration+.015);
  }

  _playRandomAmbient(){
    const pan=(Math.random()-.5)*1.5;
    const roll=Math.random();
    if(roll<.25) this._knock(pan);
    else if(roll<.46) this._creak(pan);
    else if(roll<.67) this._whisper(pan);
    else if(roll<.83) this._static(pan);
    else this._distantFootsteps(pan);
  }

  _knock(pan=0){
    const now=this.ctx.currentTime;
    this._playNoise({when:now,duration:.16,type:"bandpass",frequency:680,volume:.009,attack:.004,pan,q:1.2});
    const output=this._ambientOutput(pan);
    const ring=this.ctx.createOscillator();
    const ringFilter=this.ctx.createBiquadFilter();
    const ringGain=this.ctx.createGain();
    ring.type="triangle";
    ring.frequency.setValueAtTime(176+Math.random()*70,now);
    ring.frequency.exponentialRampToValueAtTime(72,now+.19);
    ringFilter.type="lowpass";
    ringFilter.frequency.value=980;
    ringGain.gain.setValueAtTime(.0001,now);
    ringGain.gain.exponentialRampToValueAtTime(.009,now+.006);
    ringGain.gain.exponentialRampToValueAtTime(.0001,now+.24);
    ring.connect(ringFilter).connect(ringGain).connect(output);
    ring.start(now);
    ring.stop(now+.26);
  }

  _creak(pan=0){
    const now=this.ctx.currentTime;
    this._playNoise({when:now,duration:1.18,type:"bandpass",frequency:260,sweepTo:620,volume:.0038,attack:.16,pan,q:.55});
    const output=this._ambientOutput(pan);
    const filter=this.ctx.createBiquadFilter();
    filter.type="lowpass";
    filter.frequency.value=290;
    const osc=this.ctx.createOscillator();
    const envelope=this.ctx.createGain();
    osc.type="sawtooth";
    osc.frequency.setValueAtTime(73,now);
    osc.frequency.linearRampToValueAtTime(98,now+.46);
    osc.frequency.exponentialRampToValueAtTime(49,now+1.32);
    envelope.gain.setValueAtTime(.0001,now);
    envelope.gain.exponentialRampToValueAtTime(.0055,now+.12);
    envelope.gain.exponentialRampToValueAtTime(.0001,now+1.38);
    osc.connect(filter).connect(envelope).connect(output);
    osc.start(now);
    osc.stop(now+1.42);
  }

  _whisper(pan=0){
    // Airy, formant-like noise swell; deliberately not intelligible speech.
    this._playNoise({duration:1.08,type:"bandpass",frequency:920,sweepTo:1480,volume:.0052,attack:.18,pan,q:.9});
  }

  _static(pan=0){
    this._playNoise({duration:.19,type:"highpass",frequency:1750,sweepTo:2900,volume:.012,attack:.003,pan,q:.6});
  }

  _distantFootsteps(pan=0){
    const now=this.ctx.currentTime;
    this._distantFootstep(now,pan,.76);
    this._distantFootstep(now+.34,pan,.58);
    this._distantFootstep(now+.88,pan,.7);
  }

  _distantFootstep(when,pan,strength){
    this._playNoise({when,duration:.14,type:"lowpass",frequency:330,volume:.0075*strength,attack:.006,pan,q:.5});
    const output=this._ambientOutput(pan);
    const osc=this.ctx.createOscillator();
    const envelope=this.ctx.createGain();
    osc.type="sine";
    osc.frequency.setValueAtTime(76,when);
    osc.frequency.exponentialRampToValueAtTime(37,when+.12);
    envelope.gain.setValueAtTime(.0001,when);
    envelope.gain.exponentialRampToValueAtTime(.012*strength,when+.009);
    envelope.gain.exponentialRampToValueAtTime(.0001,when+.15);
    osc.connect(envelope).connect(output);
    osc.start(when);
    osc.stop(when+.17);
  }

  _heartbeat(intensity=0){
    const now=this.ctx.currentTime;
    for(let i=0;i<2;i++){
      const at=now+i*.17;
      const osc=this.ctx.createOscillator();
      const envelope=this.ctx.createGain();
      osc.type="sine";
      osc.frequency.setValueAtTime(i===0?61:53,at);
      osc.frequency.exponentialRampToValueAtTime(34,at+.13);
      envelope.gain.setValueAtTime(.0001,at);
      envelope.gain.exponentialRampToValueAtTime((i===0 ? .032 : .023)*intensity,at+.012);
      envelope.gain.exponentialRampToValueAtTime(.0001,at+.16);
      osc.connect(envelope).connect(this._ambientOutput(0));
      osc.start(at);
      osc.stop(at+.18);
    }
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

  quack(){
    if(!this.ctx || this.muted) return;
    const now=this.ctx.currentTime;
    const osc=this.ctx.createOscillator();
    const gain=this.ctx.createGain();
    osc.type="square";
    osc.frequency.setValueAtTime(440,now);
    osc.frequency.exponentialRampToValueAtTime(170,now+.16);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.10,now+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.20);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now+.22);
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