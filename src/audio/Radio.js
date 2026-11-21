// Military-style radio chatter: queued transmissions spoken with the Web Speech API,
// framed by squelch clicks, with on-screen subtitles. Voices differ per speaker.
export class Radio {
  constructor(audio, onSubtitle) {
    this.audio = audio;
    this.onSubtitle = onSubtitle;
    this.queue = [];
    this.busy = false;
    this.voices = [];
    this.enabled = 'speechSynthesis' in window;
    this.recent = new Map();
    if (this.enabled) {
      const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
    this.speakers = {
      AWACS: { pitch: 0.8, rate: 1.08, vi: 0, color: '#7dd3fc' },
      TOWER: { pitch: 1.0, rate: 1.05, vi: 1, color: '#a7f3d0' },
      LSO: { pitch: 0.9, rate: 1.1, vi: 2, color: '#fde68a' },
      WING: { pitch: 1.15, rate: 1.15, vi: 3, color: '#c4b5fd' },
      WING2: { pitch: 0.75, rate: 1.12, vi: 4, color: '#c4b5fd' },
      WING3: { pitch: 1.3, rate: 1.1, vi: 5, color: '#c4b5fd' },
      BETTY: { pitch: 1.2, rate: 1.0, vi: 6, color: '#fca5a5', female: true },
      ENEMY: { pitch: 0.6, rate: 1.0, vi: 7, color: '#f87171' },
      SELF: { pitch: 1.0, rate: 1.15, vi: 8, color: '#e5e7eb' },
    };
  }

  // say('AWACS', 'Overlord', 'Bandits bearing 020', { priority, throttleKey })
  say(speaker, name, text, opts = {}) {
    const key = opts.key || text;
    const now = performance.now();
    if (this.recent.has(key) && now - this.recent.get(key) < (opts.cooldown ?? 6000)) return;
    this.recent.set(key, now);
    const item = { speaker, name, text, priority: opts.priority || 0 };
    if (opts.priority >= 2) {
      // urgent: jump the queue (but don't interrupt current line)
      this.queue.unshift(item);
    } else {
      if (this.queue.length > 4) this.queue.splice(1, 1);
      this.queue.push(item);
    }
    this.pump();
  }

  // Cockpit warning voice ("Bitching Betty") — immediate, no squelch.
  warn(text) {
    const now = performance.now();
    if (this.recent.has('w:' + text) && now - this.recent.get('w:' + text) < 3500) return;
    this.recent.set('w:' + text, now);
    this.onSubtitle?.({ name: 'WARNING', text: text.toUpperCase(), color: '#fca5a5', warn: true });
    if (!this.enabled || !this.audio.enabled) return;
    const u = new SpeechSynthesisUtterance(text);
    const female = this.voices.find((v) => /female|samantha|zira|victoria|karen|google uk english female/i.test(v.name));
    if (female) u.voice = female;
    u.pitch = 1.2; u.rate = 1.15; u.volume = this.audio.vol.voice;
    speechSynthesis.speak(u);
  }

  pump() {
    if (this.busy || !this.queue.length) return;
    const item = this.queue.shift();
    this.busy = true;
    const sp = this.speakers[item.speaker] || this.speakers.AWACS;
    this.audio.play('squelch');
    this.onSubtitle?.({ name: item.name, text: item.text, color: sp.color });
    const done = () => {
      this.audio.play('squelch');
      setTimeout(() => { this.busy = false; this.pump(); }, 350);
    };
    if (!this.enabled || !this.audio.enabled || this.audio.vol.voice <= 0.01) {
      setTimeout(done, 900 + item.text.length * 45);
      return;
    }
    const u = new SpeechSynthesisUtterance(item.text);
    if (this.voices.length) u.voice = this.voices[sp.vi % this.voices.length];
    u.pitch = sp.pitch; u.rate = sp.rate; u.volume = this.audio.vol.voice;
    let finished = false;
    const fin = () => { if (!finished) { finished = true; done(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, 1500 + item.text.length * 90); // safety timeout
    setTimeout(() => speechSynthesis.speak(u), 120);
  }

  clear() {
    this.queue = [];
    this.busy = false;
    if (this.enabled) speechSynthesis.cancel();
  }
}
