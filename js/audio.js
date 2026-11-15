// Sound effects synthesized with Web Audio: no audio files to download.
// Browsers only allow sound after a user gesture, so the context is created on the first touch or key.

// The music: four chords, each a bar long, played as a slow bass note and a soft broken chord above it (exported for
// the tests: what is heard when no tune of the store is chosen).
export const CHORDS = [[261.63, 329.63, 392.0, 523.25], [220.0, 261.63, 329.63, 440.0], [174.61, 220.0, 261.63, 349.23], [196.0, 246.94, 293.66, 392.0]];
export const BEAT = 0.42;   // seconds

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093 };

// The tunes of the credits store (Music), made the way the game's own is: chords in a table, played note by note by
// oscillators, no file to download. A tune is its chords (the lowest note first), how long a beat is, how many beats a
// chord lasts, and for each beat of that bar what sounds: `bass` (the chord's lowest note, an octave down) and `lead`
// (which note of the chord, counted from the lowest; null for a rest), with how long each rings and how loud it is.
// Every note fades in and out by itself, so a tune that starts again after its last chord has no seam to click at,
// and nothing in a tune is left to chance: it is the same every time round.
const E3 = 164.81, F3 = 174.61, G3 = 196, A3 = 220, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392, A4 = 440, C5 = 523.25, D5 = 587.33;
export const TUNES = {
  // bright and quick: C, G, A minor, F, a note on every beat running up and down the chord
  sunny: { id: 'sunny', beat: 0.3, bar: 8, chords: [[C4, E4, G4, C5], [G3, B3, D4, G4], [A3, C4, E4, A4], [F3, A3, C4, F4]],
    bass: [1, 0, 0, 0, 1, 0, 0, 0], lead: [0, 1, 2, 3, 2, 1, 2, 3], bassNote: { dur: 1.9, gain: 0.036, type: 'sine' }, leadNote: { dur: 0.7, gain: 0.018, type: 'triangle', octave: 2 } },
  // slow and low: A minor, F, C, E minor, one soft note every other beat
  night: { id: 'night', beat: 0.56, bar: 8, chords: [[A3, C4, E4, A4], [F3, A3, C4, F4], [C4, E4, G4, C5], [E3, G3, B3, E4]],
    bass: [1, 0, 0, 0, 0, 0, 0, 0], lead: [null, 2, null, 1, null, 3, null, 2], bassNote: { dur: 4.2, gain: 0.045, type: 'sine' }, leadNote: { dur: 2.4, gain: 0.02, type: 'sine', octave: 1 } },
  // three to the bar: C, A minor, D minor, G, the bass on one and the chord on two and three
  waltz: { id: 'waltz', beat: 0.38, bar: 6, chords: [[C4, E4, G4, C5], [A3, C4, E4, A4], [D4, F4, A4, D5], [G3, B3, D4, G4]],
    bass: [1, 0, 0, 1, 0, 0], lead: [3, 1, 2, null, 2, 1], bassNote: { dur: 1.1, gain: 0.045, type: 'sine' }, leadNote: { dur: 0.9, gain: 0.02, type: 'triangle', octave: 1 } },
};
/**
 * The notes of a tune at one beat, counted from its start: [{ freq, dur, gain, type }]. The tune goes round after its
 * last chord, so a beat and the same beat one round later give the same notes.
 */
export function notesAt(tune, step) {
  const i = step % tune.bar, chord = tune.chords[Math.floor(step / tune.bar) % tune.chords.length], out = [];
  if (tune.bass[i]) out.push({ freq: chord[0] / 2, dur: tune.bassNote.dur, gain: tune.bassNote.gain, type: tune.bassNote.type });
  if (tune.lead[i] != null) out.push({ freq: chord[tune.lead[i] % chord.length] * tune.leadNote.octave, dur: tune.leadNote.dur, gain: tune.leadNote.gain, type: tune.leadNote.type });
  return out;
}
/** How long a tune is before it starts again, in seconds. */
export const tuneLength = tune => tune.beat * tune.bar * tune.chords.length;

export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null; this.master = null; this.noiseBuf = null;
    this.last = {};
    this.tune = null;   // the tune of the credits store that plays (one of TUNES), or null for the game's own
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
  /**
   * Which tune plays: one of TUNES by its id (Music of the credits store), or anything else for the game's own. The
   * tune changes at the next beat and starts from its first chord; the notes already sounding ring out under it, so
   * nothing is cut off. Asked for the tune that plays already, it does nothing: a tune does not start again because
   * the player walked into another yard or the store answered once more.
   */
  setTune(id) {
    const tune = Object.hasOwn(TUNES, id) ? TUNES[id] : null;
    if (tune === this.tune) return false;
    this.tune = tune; this.beat = 0;
    return true;
  }
  /** Quiet background music. Call every frame: notes are booked a quarter of a second ahead, so it stops by itself when the game does. */
  music() {
    if (!this.musicOn) { this.nextNote = null; return; }
    const c = this.ctx, tune = this.tune;
    if (this.nextNote == null || this.nextNote < c.currentTime - 1) { this.nextNote = c.currentTime + 0.4; this.beat = this.beat || 0; }
    while (this.nextNote < c.currentTime + 0.25) {
      const step = this.beat++;
      if (tune) {
        for (const n of notesAt(tune, step)) this.voice(n.freq, n.dur, n.gain, this.nextNote, n.type);
        this.nextNote += tune.beat;
        continue;
      }
      const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
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
