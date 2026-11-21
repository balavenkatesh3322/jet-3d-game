// Fully procedural WebAudio sound design: jet engine, afterburner, wind, cannon, missiles,
// explosions, lock/RWR tones, catapult, arresting wire, UI clicks. No audio files required.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.vol = { sfx: 0.8, music: 0.55, voice: 0.9 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.vol.sfx; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.vol.music; this.musicBus.connect(this.master);
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = this.vol.voice; this.radioBus.connect(this.master);
    this.noise = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');
    this.buildEngine();
    this.buildTones();
    this.enabled = true;
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music;
    this.radioBus.gain.value = this.vol.voice;
  }

  makeNoise(seconds, type) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  loopNoise(buf) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s;
  }

  buildEngine() {
    const ctx = this.ctx;
    // turbine rumble (brown noise lowpassed)
    this.engRumble = this.loopNoise(this.brown);
    this.engRumbleF = ctx.createBiquadFilter(); this.engRumbleF.type = 'lowpass'; this.engRumbleF.frequency.value = 300;
    this.engRumbleG = ctx.createGain(); this.engRumbleG.gain.value = 0;
    this.engRumble.connect(this.engRumbleF).connect(this.engRumbleG).connect(this.sfxBus);
    // turbine whine
    this.whine = ctx.createOscillator(); this.whine.type = 'sawtooth'; this.whine.frequency.value = 900;
    this.whine2 = ctx.createOscillator(); this.whine2.type = 'triangle'; this.whine2.frequency.value = 1810;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 6; wf.frequency.value = 1500; this.whineF = wf;
    this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
    this.whine.connect(wf); this.whine2.connect(wf); wf.connect(this.whineG).connect(this.sfxBus);
    this.whine.start(); this.whine2.start();
    // afterburner roar
    this.ab = this.loopNoise(this.noise);
    this.abF = ctx.createBiquadFilter(); this.abF.type = 'lowpass'; this.abF.frequency.value = 900;
    const abF2 = ctx.createBiquadFilter(); abF2.type = 'peaking'; abF2.frequency.value = 90; abF2.gain.value = 12;
    this.abG = ctx.createGain(); this.abG.gain.value = 0;
    this.ab.connect(this.abF).connect(abF2).connect(this.abG).connect(this.sfxBus);
    // wind / airframe noise
    this.wind = this.loopNoise(this.noise);
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.6; this.windF.frequency.value = 600;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF).connect(this.windG).connect(this.sfxBus);
    // gun (continuous buzz gated)
    this.gunOsc = ctx.createOscillator(); this.gunOsc.type = 'square'; this.gunOsc.frequency.value = 75;
    this.gunN = this.loopNoise(this.noise);
    const gf = ctx.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 1400;
    this.gunG = ctx.createGain(); this.gunG.gain.value = 0;
    const gmix = ctx.createGain(); gmix.gain.value = 0.5;
    this.gunOsc.connect(gmix); this.gunN.connect(gmix); gmix.connect(gf).connect(this.gunG).connect(this.sfxBus);
    this.gunOsc.start();
  }

  buildTones() {
    const ctx = this.ctx;
    // IR seeker growl / lock tone
    this.seek = ctx.createOscillator(); this.seek.type = 'sine'; this.seek.frequency.value = 400;
    this.seekLfo = ctx.createOscillator(); this.seekLfo.frequency.value = 14;
    const lfoG = ctx.createGain(); lfoG.gain.value = 60; this.seekLfo.connect(lfoG).connect(this.seek.frequency);
    this.seekG = ctx.createGain(); this.seekG.gain.value = 0;
    this.seek.connect(this.seekG).connect(this.sfxBus);
    this.seek.start(); this.seekLfo.start();
    // RWR / missile warning beeper
    this.rwr = ctx.createOscillator(); this.rwr.type = 'square'; this.rwr.frequency.value = 1050;
    this.rwrG = ctx.createGain(); this.rwrG.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 2500;
    this.rwr.connect(rf).connect(this.rwrG).connect(this.sfxBus);
    this.rwr.start();
    this.rwrPhase = 0;
  }

  // Called every frame with the player's state.
  updateFlight(dt, s) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime, k = 0.08;
    const thr = Math.min(1, s.throttle), ab = s.throttle > 1 ? (s.throttle - 1) / 0.2 : 0;
    const inside = s.cockpit ? 0.6 : 1;
    const alive = s.alive ? 1 : 0;
    this.engRumbleG.gain.setTargetAtTime(alive * (0.25 + thr * 0.55) * inside, t, k);
    this.engRumbleF.frequency.setTargetAtTime(160 + thr * 380 + ab * 300, t, k);
    this.whine.frequency.setTargetAtTime(600 + thr * 1300, t, 0.3);
    this.whine2.frequency.setTargetAtTime(1210 + thr * 2600, t, 0.3);
    this.whineF.frequency.setTargetAtTime(900 + thr * 2200, t, 0.3);
    this.whineG.gain.setTargetAtTime(alive * (0.012 + thr * 0.03) * (s.cockpit ? 0.5 : 1), t, k);
    this.abG.gain.setTargetAtTime(alive * ab * 0.6 * inside, t, 0.15);
    this.abF.frequency.setTargetAtTime(500 + ab * 900, t, 0.2);
    const sp = Math.min(1, s.speed / 400);
    this.windG.gain.setTargetAtTime(alive * (sp * sp * 0.35 + s.g * 0.01), t, k);
    this.windF.frequency.setTargetAtTime(300 + sp * 1600, t, k);
    this.gunG.gain.setTargetAtTime(s.firing ? 0.5 : 0, t, 0.015);
    this.gunOsc.frequency.setTargetAtTime(s.firing ? 70 + Math.random() * 10 : 70, t, 0.01);
    // seeker tone
    const tone = s.seeker; // 0 none 1 search 2 lock
    this.seekG.gain.setTargetAtTime(tone ? 0.06 : 0, t, 0.03);
    this.seek.frequency.setTargetAtTime(tone === 2 ? 1150 : 420, t, 0.02);
    this.seekLfo.frequency.setTargetAtTime(tone === 2 ? 0.01 : 14, t, 0.05);
    // RWR beeps: missile inbound = fast, locked = slow
    this.rwrPhase += dt * (s.missileInbound ? 9 : s.lockedOn ? 2.2 : 0);
    const on = (s.missileInbound || s.lockedOn) && (this.rwrPhase % 1) < 0.5;
    this.rwrG.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.005);
    this.rwr.frequency.setTargetAtTime(s.missileInbound ? 1400 : 900, t, 0.01);
  }

  silenceFlight() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    for (const g of [this.engRumbleG, this.whineG, this.abG, this.windG, this.gunG, this.seekG, this.rwrG]) g.gain.setTargetAtTime(0, t, 0.1);
  }

  // ---------------------------------------------------------------- one-shots
  burst({ dur = 0.5, freq = 800, type = 'lowpass', q = 1, gain = 0.5, sweepTo = null, attack = 0.005, bus = this.sfxBus, brown = false }) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = brown ? this.brown : this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.2, to = null, delay = 0, bus = this.sfxBus }) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, dist = 0, scale = 1) {
    if (!this.enabled) return;
    const att = Math.max(0.05, 1 / (1 + dist / 900));
    switch (name) {
      case 'missile':
        this.burst({ dur: 1.6, freq: 2500, sweepTo: 300, type: 'bandpass', q: 0.8, gain: 0.7 * att });
        this.burst({ dur: 0.4, freq: 200, gain: 0.6 * att, brown: true });
        break;
      case 'explosion': {
        const g = Math.min(1, att * scale);
        this.burst({ dur: 2.2 * Math.min(2, scale), freq: 600, sweepTo: 60, gain: 1.0 * g, brown: true });
        this.burst({ dur: 0.6, freq: 3000, sweepTo: 200, gain: 0.35 * g });
        this.tone({ freq: 70, to: 28, dur: 1.2, gain: 0.6 * g });
        break;
      }
      case 'hit': this.burst({ dur: 0.08, freq: 3000, type: 'highpass', gain: 0.25 }); break;
      case 'flare':
        for (let i = 0; i < 4; i++) setTimeout(() => this.burst({ dur: 0.18, freq: 1800, type: 'bandpass', q: 2, gain: 0.25 }), i * 70);
        break;
      case 'catapult':
        this.burst({ dur: 2.6, freq: 1200, sweepTo: 200, type: 'bandpass', q: 0.7, gain: 0.8, attack: 0.05 });
        this.tone({ freq: 55, to: 35, dur: 0.8, gain: 0.6 });
        break;
      case 'wire':
        this.tone({ freq: 140, to: 40, dur: 0.6, type: 'sawtooth', gain: 0.35 });
        this.burst({ dur: 1.4, freq: 900, sweepTo: 150, gain: 0.5 });
        break;
      case 'touchdown':
        this.burst({ dur: 0.35, freq: 2200, type: 'bandpass', q: 3, gain: 0.4 });
        this.tone({ freq: 90, to: 40, dur: 0.3, gain: 0.5 });
        break;
      case 'gear': this.burst({ dur: 1.2, freq: 400, type: 'bandpass', q: 2, gain: 0.25, attack: 0.2 }); this.tone({ freq: 60, dur: 0.15, gain: 0.3, delay: 1.1 }); break;
      case 'lock': this.tone({ freq: 1600, dur: 0.08, gain: 0.12 }); break;
      case 'warn': this.tone({ freq: 880, dur: 0.12, type: 'square', gain: 0.08 }); this.tone({ freq: 660, dur: 0.12, type: 'square', gain: 0.08, delay: 0.15 }); break;
      case 'click': this.tone({ freq: 1800, dur: 0.04, type: 'square', gain: 0.05 }); break;
      case 'select': this.tone({ freq: 660, dur: 0.08, gain: 0.08 }); this.tone({ freq: 990, dur: 0.1, gain: 0.08, delay: 0.07 }); break;
      case 'unlock': [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.12, delay: i * 0.1 })); break;
      case 'squelch': this.burst({ dur: 0.12, freq: 2500, type: 'bandpass', q: 1.2, gain: 0.18, bus: this.radioBus }); break;
      case 'stall': this.tone({ freq: 300, dur: 0.15, type: 'square', gain: 0.06 }); break;
      default: break;
    }
  }
}
