// Generative soundtrack: a tense menu theme, cruising theme and driving combat theme,
// sequenced in real time with WebAudio (drums, bass, pads, lead). Intensity crossfades.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.mode = 'off';
    this.step = 0;
    this.nextTime = 0;
    this.bpm = 128;
    this.timer = null;
    this.intensity = 0;
    this.target = 0;
  }

  get ctx() { return this.audio.ctx; }

  start(mode) {
    if (!this.audio.enabled) return;
    if (this.mode === mode) return;
    this.mode = mode;
    this.bpm = mode === 'menu' ? 92 : 136;
    if (!this.timer) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    }
    if (!this.out) {
      this.out = this.ctx.createGain(); this.out.gain.value = 0.7;
      const rev = this.makeReverb();
      const wet = this.ctx.createGain(); wet.gain.value = 0.25;
      this.out.connect(this.audio.musicBus);
      this.out.connect(rev).connect(wet).connect(this.audio.musicBus);
    }
  }

  stop() { this.mode = 'off'; clearInterval(this.timer); this.timer = null; }

  setIntensity(v) { this.target = v; }

  makeReverb() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2.5;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ctx.createConvolver(); conv.buffer = buf; return conv;
  }

  schedule() {
    if (this.mode === 'off') return;
    const ctx = this.ctx;
    const spb = 60 / this.bpm / 4; // 16th notes
    this.intensity += (this.target - this.intensity) * 0.02;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 256;
    }
  }

  // ---------------------------------------------------------------- instruments
  env(node, t, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.linearRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kick(t, g = 0.9) {
    const o = this.ctx.createOscillator(), v = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    this.env(v, t, 0.002, 0.35, g); o.connect(v).connect(this.out); o.start(t); o.stop(t + 0.4);
  }
  snare(t, g = 0.35) {
    const s = this.ctx.createBufferSource(); s.buffer = this.audio.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const v = this.ctx.createGain(); this.env(v, t, 0.001, 0.18, g);
    s.connect(f).connect(v).connect(this.out); s.start(t, Math.random()); s.stop(t + 0.25);
    const o = this.ctx.createOscillator(), ov = this.ctx.createGain(); o.frequency.value = 190;
    this.env(ov, t, 0.001, 0.08, g * 0.6); o.connect(ov).connect(this.out); o.start(t); o.stop(t + 0.1);
  }
  hat(t, g = 0.08, open = false) {
    const s = this.ctx.createBufferSource(); s.buffer = this.audio.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const v = this.ctx.createGain(); this.env(v, t, 0.001, open ? 0.25 : 0.05, g);
    s.connect(f).connect(v).connect(this.out); s.start(t, Math.random()); s.stop(t + 0.3);
  }
  tom(t, n, g = 0.4) {
    const o = this.ctx.createOscillator(), v = this.ctx.createGain();
    o.frequency.setValueAtTime(NOTE(n), t); o.frequency.exponentialRampToValueAtTime(NOTE(n) * 0.5, t + 0.3);
    this.env(v, t, 0.002, 0.3, g); o.connect(v).connect(this.out); o.start(t); o.stop(t + 0.35);
  }
  bass(t, n, dur, g = 0.25) {
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), v = this.ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = NOTE(n); o2.frequency.value = NOTE(n - 12);
    f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + dur); f.Q.value = 6;
    this.env(v, t, 0.005, dur, g);
    o.connect(f); o2.connect(f); f.connect(v).connect(this.out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  pad(t, notes, dur, g = 0.05) {
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), v = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 1100;
        v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(g, t + dur * 0.3); v.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(v).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }
  lead(t, n, dur, g = 0.07) {
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), v = this.ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = NOTE(n); o2.frequency.value = NOTE(n) * 1.005;
    f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 2;
    const vib = this.ctx.createOscillator(), vg = this.ctx.createGain(); vib.frequency.value = 5.5; vg.gain.value = 4;
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    this.env(v, t, 0.02, dur, g);
    o.connect(f); o2.connect(f); f.connect(v).connect(this.out);
    o.start(t); o2.start(t); vib.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  playStep(step, t, spb) {
    const s16 = step % 16, bar = Math.floor(step / 16) % 16;
    // D minor progression: Dm - Bb - F - C  /  Dm - Bb - Gm - A
    const prog = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
    const chord = prog[Math.floor(bar / 2) % 8];
    const root = chord[0] - 12;
    if (this.mode === 'menu') {
      if (s16 === 0 && bar % 2 === 0) this.pad(t, chord.map((n) => n + 12), spb * 32, 0.035);
      if (s16 % 4 === 0) this.bass(t, root, spb * 3, 0.09);
      if (s16 === 0) this.kick(t, 0.5);
      if (s16 === 8) this.tom(t, 45, 0.25);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      if (s16 % 2 === 0 && bar >= 4) this.lead(t, chord[arp[(s16 / 2) % 8]] + 24, spb * 1.6, 0.022);
      return;
    }
    // in-flight: intensity 0 = cruise, 1 = combat
    const I = this.intensity;
    if (s16 === 0 && bar % 2 === 0) this.pad(t, chord.map((n) => n + 12), spb * 32, 0.03 + 0.01 * (1 - I));
    // bass ostinato
    const bassPat = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
    if (I > 0.25 ? bassPat[s16] : s16 % 4 === 0) this.bass(t, root + (s16 === 14 ? 7 : 0), spb * 0.9, 0.12 + 0.08 * I);
    // drums
    if (s16 % 4 === 0) this.kick(t, 0.5 + 0.4 * I);
    if (I > 0.3 && (s16 === 4 || s16 === 12)) this.snare(t, 0.3 * I + 0.05);
    if (I > 0.15 && s16 % 2 === 0) this.hat(t, 0.03 + 0.05 * I, s16 === 6 || s16 === 14);
    if (I > 0.6 && bar % 4 === 3 && s16 >= 12) this.tom(t, 52 - (s16 - 12) * 3, 0.35);
    // heroic lead in combat
    if (I > 0.55) {
      const melody = [[0, 62, 3], [4, 65, 2], [6, 64, 2], [8, 62, 4], [12, 57, 4]];
      const melody2 = [[0, 69, 3], [4, 67, 2], [6, 65, 2], [8, 64, 6]];
      const m = bar % 2 === 0 ? melody : melody2;
      for (const [st, n, len] of m) if (s16 === st) this.lead(t, n + (Math.floor(bar / 2) % 2 ? 0 : -2) + 12 * 0, spb * len, 0.05 * I);
    }
  }
}
