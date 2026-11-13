// Player preferences (sound, music, vibration, graphics, comfort), kept apart from the game save so a reset keeps them.
// What they mean is in settings-logic.js; this file keeps them in the browser and tells whoever listens.
import { readSettings, GRAPHICS, level, withVolume, withSwitch, mute } from './settings-logic.js';

const KEY = 'lumber-tycoon-settings';
const FIELDS = Object.keys(readSettings(null));

export class Settings {
  constructor() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { saved = null; }
    Object.assign(this, readSettings(saved));
    this.listeners = [];
    this.memory = null;   // what the mute key silenced, to bring it back
    // The system can ask for less motion too; the game then behaves as if its own switch were on.
    this.system = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.system?.addEventListener?.('change', () => this.tell());
    // Browsers block vibration until the page has been used, and log a warning for each early call.
    // A finger going down does not count yet (lifting it does), so where the browser can tell us, ask it.
    this.touched = false;
    addEventListener('pointerup', () => { this.touched = true; }, { once: true, passive: true });
  }
  /** Less motion: asked for in the settings, or by the system. */
  get calm() { return this.reduceMotion || !!this.system?.matches; }
  get systemCalm() { return !!this.system?.matches; }
  state() { const out = {}; for (const k of FIELDS) out[k] = this[k]; return out; }
  /** Call `fn` after every change, so sound and page follow at once. */
  onChange(fn) { this.listeners.push(fn); }
  tell() { for (const fn of this.listeners) fn(this); }
  store() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state())); } catch { /* private mode */ }
    this.tell();
  }
  toggle(name) {
    if (name === 'sound' || name === 'music') Object.assign(this, withSwitch(this.state(), name, !this[name]));
    else this[name] = !this[name];
    this.store();
    return this[name];
  }
  /** How loud 'sound' or 'music' plays, 0 to 1 (0 while switched off). */
  level(name) { return level(this, name); }
  /** Move a volume slider, 0 to 1. Zero switches that sound off. */
  setVolume(name, value) { Object.assign(this, withVolume(this.state(), name, value)); this.store(); }
  /** The mute key: silence everything, or bring back what it silenced. @returns true when now muted */
  mute() {
    const r = mute(this.state(), this.memory);
    Object.assign(this, r.state); this.memory = r.memory;
    this.store();
    return r.muted;
  }
  /** Remember something for good, such as a hint that has been shown. */
  set(name, value) { if (this[name] !== value) { this[name] = value; this.store(); } }
  /** Step the graphics level: auto, high, low, and round again. */
  nextGraphics() { this.graphics = GRAPHICS[(GRAPHICS.indexOf(this.graphics) + 1) % GRAPHICS.length]; this.store(); return this.graphics; }
  /** Short vibration on phones that support it. */
  buzz(pattern) {
    const used = navigator.userActivation ? navigator.userActivation.hasBeenActive : this.touched;
    if (this.haptics && used && navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* not allowed */ } }
  }
}
