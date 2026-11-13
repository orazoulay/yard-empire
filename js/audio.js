// Sound effects synthesized with Web Audio: no audio files to download.
// Browsers only allow sound after a user gesture, so the context is created on the first touch or key.

// The music: four chords, each a bar long, played as a slow bass note and a soft broken chord above it.
const CHORDS = [[261.63, 329.63, 392.0, 523.25], [220.0, 261.63, 329.63, 440.0], [174.61, 220.0, 261.63, 349.23], [196.0, 246.94, 293.66, 392.0]];
const BEAT = 0.42;   // seconds

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093 };

export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null; this.master = null; this.noiseBuf = null;
    this.last = {};
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('keydown', unlock);
    settings.onChange?.(() => this.volume());   // the sliders in the settings are heard as they move
    // A game nobody is looking at makes no sound. The hum of the machines is a loop: without this it would go
    // on in a hidden tab, and in the Android app with the game in the background or the screen off.
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      (document.hidden ? this.ctx.suspend() : this.ctx.resume()).catch(() => {});
    });
  }

  /** Set the two volumes from the settings: everything but the music goes through `master`, the music through its own gain. */
  volume() {
    if (!this.ctx) return;
    this.master.gain.value = 0.5 * this.settings.level('sound');
    this.musicBus.gain.value = 0.5 * this.settings.level('music');
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.ctx.destination);
      this.volume();
      const len = Math.floor(this.ctx.sampleRate * 0.4), buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get on() { return this.settings.sound && this.ctx && this.ctx.state === 'running'; }
  /** The music has its own switch and slider: it may play while the other sounds are off. */
  get musicOn() { return this.settings.music && this.ctx && this.ctx.state === 'running'; }

  /** True at most once per `ms` for a given name: stops a burst of events from stacking into noise. */
  ok(name, ms) {
    const now = performance.now();
    if (now - (this.last[name] || 0) < ms) return false;
    this.last[name] = now; return true;
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { gain = 0.15, freq = 1800, q = 1, delay = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // ---- game sounds ----
  /** Pitch climbs with the stack, the classic "filling up" feel. */
  pickup(count) { if (this.ok('pickup', 45)) this.tone(440 * Math.pow(1.045, Math.min(count, 24)), 0.07, { type: 'triangle', gain: 0.16 }); }
  drop() { if (this.ok('drop', 45)) this.tone(300, 0.07, { type: 'triangle', gain: 0.14, slide: 0.7 }); }
  /** A till: the drawer's click, then the bell. */
  cash() {
    if (!this.ok('cash', 60)) return;
    this.noise(0.03, { gain: 0.08, freq: 3200, q: 2 });
    this.tone(NOTE.E6, 0.09, { gain: 0.12, delay: 0.02 }); this.tone(NOTE.C7, 0.22, { gain: 0.1, delay: 0.07 }); this.tone(NOTE.C7 * 1.5, 0.3, { gain: 0.03, delay: 0.07 });
  }
  /** A footstep on the yard: a short, dull tap, a little different each time. */
  step() { if (this.ok('step', 120)) this.noise(0.05, { gain: 0.035, freq: 380 + Math.random() * 160, q: 1.2 }); }
  /**
   * The hum of the machines near the player, 0 (silence) to 1. Call every frame: one noise loop and one
   * low tone run all the time and only their loudness changes, so machines starting and stopping never click.
   */
  hum(level) {
    if (!this.on) { if (this.humGain) this.humGain.gain.value = 0; return; }
    const c = this.ctx;
    if (!this.humGain) {
      this.humGain = c.createGain(); this.humGain.gain.value = 0; this.humGain.connect(this.master);
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9;
      s.connect(f); f.connect(this.humGain); s.start();
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth'; o.frequency.value = 58; og.gain.value = 0.35;
      o.connect(og); og.connect(this.humGain); o.start();
    }
    this.humGain.gain.setTargetAtTime(0.05 * Math.max(0, Math.min(1, level)), c.currentTime, 0.18);
  }
  /** Rain on the yard, 0 to 1: a soft hiss, handled like the hum. */
  rain(level) {
    if (!this.on) { if (this.rainGain) this.rainGain.gain.value = 0; return; }
    if (!this.rainGain && level < 0.02) return;
    const c = this.ctx;
    if (!this.rainGain) {
      this.rainGain = c.createGain(); this.rainGain.gain.value = 0; this.rainGain.connect(this.master);
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600;
      s.connect(f); f.connect(this.rainGain); s.start();
    }
    this.rainGain.gain.setTargetAtTime(0.045 * level, c.currentTime, 0.4);
  }
  /** Thunder some way off: a low rumble that swells, rolls and dies away. */
  thunder() {
    if (!this.on || !this.ok('thunder', 3000)) return;
    const c = this.ctx, t = c.currentTime, dur = 3.2;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.7); g.gain.exponentialRampToValueAtTime(0.32, t + 1.1);   // it rolls: down, and up once more
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
    this.tone(52, 1.6, { gain: 0.16, slide: 0.6 });
  }
  /** Quiet background music. Call every frame: notes are booked a quarter of a second ahead, so it stops by itself when the game does. */
  music() {
    if (!this.musicOn) { this.nextNote = null; return; }
    const c = this.ctx;
    if (this.nextNote == null || this.nextNote < c.currentTime - 1) { this.nextNote = c.currentTime + 0.4; this.beat = this.beat || 0; }
    while (this.nextNote < c.currentTime + 0.25) {
      const step = this.beat++, chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
      if (step % 8 === 0) this.voice(chord[0] / 2, 3.2, 0.045, this.nextNote, 'sine');
      if (step % 2 === 0 || Math.random() < 0.3) this.voice(chord[(step * 3 + (step >> 3)) % chord.length] * (step % 4 === 3 ? 2 : 1), 1.5, 0.022, this.nextNote, 'triangle');
      this.nextNote += BEAT;
    }
  }
  /** One soft note of the music: a slow start and a long fade. */
  voice(freq, dur, gain, at, type) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(this.musicBus); o.start(at); o.stop(at + dur + 0.05);
  }
  /** Rising ticks while cash drains into a plot; `progress` is 0..1. */
  pay(progress) { if (this.ok('pay', 55)) this.tone(500 + progress * 900, 0.05, { type: 'square', gain: 0.05 }); }
  machine(volume = 1) {
    if (!this.ok('machine', 180)) return;
    this.noise(0.16, { gain: 0.07 * volume, freq: 2600, q: 3 });
    this.tone(180, 0.1, { type: 'sawtooth', gain: 0.03 * volume, slide: 0.6 });
  }
  fanfare() {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.16, delay: i * 0.08 }));
  }
  gate() {
    [NOTE.C5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) => this.tone(f, 0.34, { type: 'triangle', gain: 0.17, delay: i * 0.11 }));
    this.noise(0.5, { gain: 0.06, freq: 5000, q: 0.5, delay: 0.5 });
  }
  collect() { [NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].forEach((f, i) => this.tone(f, 0.12, { gain: 0.12, delay: i * 0.05 })); }
  click() { this.tone(700, 0.04, { type: 'square', gain: 0.05 }); }
}
