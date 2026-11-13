// What the player's preferences mean, apart from where they are kept: reading a saved copy of any age,
// the two volume sliders, and the mute key. No page needed; tested in tests/yard-interface.test.mjs.

export const GRAPHICS = ['auto', 'high', 'low'];   // auto starts high and drops to low on a device that draws slowly
const UNMUTED = 0.5;   // where a slider left at zero comes back to when its sound is switched on again

const unit = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

/**
 * The preferences from whatever was saved. Every field is optional: a copy from before the sliders
 * and the comfort settings reads as it always did, with the new ones at their defaults.
 */
export function readSettings(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  // Before the sliders, "Sound: Off" silenced the music as well. Now the music has a slider of its own
  // and may play alone, so a player who had switched the sound off must not suddenly hear it.
  const silenced = s.sound === false && s.soundVolume === undefined && s.musicVolume === undefined;
  return {
    sound: s.sound !== false, music: s.music !== false && !silenced, haptics: s.haptics !== false,
    soundVolume: unit(s.soundVolume, 1), musicVolume: unit(s.musicVolume, 1),   // 1 is as loud as the game was before it had sliders
    graphics: GRAPHICS.includes(s.graphics) ? s.graphics : 'auto',
    reduceMotion: s.reduceMotion === true, largeText: s.largeText === true,
    moveHintSeen: s.moveHintSeen === true,
  };
}

/** How loud `name` ('sound' or 'music') plays, 0 to 1: its slider, or nothing while it is switched off. */
export const level = (state, name) => (state[name] ? state[name + 'Volume'] : 0);

/** Move a slider. Zero switches the sound off and keeps the last volume for the mute key; anything above switches it on. */
export function withVolume(state, name, value) {
  const v = unit(value, 0);
  return { ...state, [name]: v > 0, [name + 'Volume']: v > 0 ? v : state[name + 'Volume'] };
}

/** Switch `name` on or off. Switching on a slider that sits at zero must still be heard. */
export function withSwitch(state, name, on) {
  const next = { ...state, [name]: !!on };
  if (on && !(next[name + 'Volume'] > 0)) next[name + 'Volume'] = UNMUTED;
  return next;
}

/**
 * The mute key. With anything playing it silences sound and music and remembers which were on;
 * pressed again it brings those back, or both when there is nothing to remember.
 * @returns {{ state, memory, muted: boolean }}
 */
export function mute(state, memory = null) {
  if (state.sound || state.music) {
    return { state: { ...state, sound: false, music: false }, memory: { sound: state.sound, music: state.music }, muted: true };
  }
  const back = memory && (memory.sound || memory.music) ? memory : { sound: true, music: true };
  let next = state;
  for (const name of ['sound', 'music']) if (back[name]) next = withSwitch(next, name, true);
  return { state: next, memory: null, muted: false };
}
