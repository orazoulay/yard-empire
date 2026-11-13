// The loading screen, and the start screen a first visit gets in its place.
//
// The page loads this file by itself, ahead of the game: it imports nothing heavy, so it can show a
// tip and the first step while three.js and the game's own files are still arriving. The game then
// reports the steps it really takes: files loaded, save found, yard built.
import { pickTip } from './ui-logic.js';

const STARTED_KEY = 'lumber-tycoon-started';   // set once the player has pressed Start (or was already playing)
/** The steps in order, with how far along the bar is when each one begins. */
const STEPS = [
  { text: 'Loading the game', at: 10 },
  { text: 'Finding your save', at: 45 },
  { text: 'Building the yard', at: 75 },
  { text: 'Ready', at: 100 },
];
const $ = id => document.getElementById(id);

class Loading {
  constructor() {
    this.at = -1; this.done = false;
    this.gone = false;   // true once the screen has left and the yard can be used
    const keyboard = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
    $('l-tip').textContent = pickTip(Math.random(), { keyboard });
    this.step(0);
  }
  /** Begin step `n` (0 to 3). Steps only go forward. */
  step(n) {
    if (n <= this.at || !STEPS[n]) return;
    this.at = n;
    const s = STEPS[n];
    $('l-text').textContent = s.text;
    $('l-fill').style.width = s.at + '%';
    $('l-bar').setAttribute('aria-valuenow', String(s.at));
  }
  /** True when nobody has played in this browser: no save in the slot the game is about to use, and Start never pressed. */
  firstVisit(saveKey) {
    try { return !localStorage.getItem(STARTED_KEY) && !localStorage.getItem(saveKey); } catch { return false; }
  }
  /**
   * The game is ready. A returning player goes straight in; a first visit sees the name, one sentence
   * and one button, whose press is also the touch a browser wants before it plays sound.
   * @param {{ first?: boolean, yards?: number, onStart?: () => void, onSignIn?: () => void }} o  onSignIn: offered under Start when accounts exist
   */
  finish({ first = false, yards = 0, onStart, onSignIn } = {}) {
    if (this.done) return;
    this.done = true;
    this.step(STEPS.length - 1);
    const el = $('loading');
    const leave = () => { this.gone = true; el.classList.add('done'); try { localStorage.setItem(STARTED_KEY, '1'); } catch { /* private mode */ } };
    if (!first) { leave(); return; }
    $('l-pitch').textContent = `Collect, craft and sell your way from one sawmill to a company of ${yards} yards.`;
    $('l-load').hidden = true; $('l-start').hidden = false;
    const begin = $('l-begin');
    begin.addEventListener('click', () => { begin.blur(); leave(); onStart?.(); }, { once: true });   // focus must not stay on a button that is fading away
    begin.focus({ preventScroll: true });
    // Someone who already plays on another device signs in here, before a new game starts under their feet.
    const signIn = $('l-signin');
    if (signIn && onSignIn) {
      signIn.hidden = false;
      signIn.addEventListener('click', () => { signIn.blur(); leave(); onStart?.(); onSignIn(); }, { once: true });
    }
  }
}

export const loading = new Loading();
