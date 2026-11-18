// @ts-check
// Pure rules for account saves: where each player's progress is kept on the device, and which copy
// wins when the device and the server disagree. No network or storage calls here.

export const GUEST_KEY = 'lumber-tycoon-save-v1';

/** Each account keeps its own save on the device, so a guest and several players can share a phone. */
export const saveKey = userId => (userId ? `${GUEST_KEY}:u${userId}` : GUEST_KEY);
/** Where the log behind the bell is kept for the player whose save is under `key`: beside the save, not in it, so it is never uploaded. */
export const logKey = key => key + '-log';

/** A brand-new game, stamped so it counts as newer than what the server still has. */
export const blankSave = now => ({ v: 3, cash: 0, unlocked: {}, paid: {}, areas: [], tutorialDone: false, workerRate: 0, lastSeen: now });

/**
 * Which progress a signed-in player starts from.
 * - An admin change (serverRev ahead of the device) always wins, including a reset to nothing.
 * - Otherwise the copy played most recently wins, so offline play is uploaded rather than lost.
 * - An account with no progress anywhere takes over the guest game on this device.
 * - A device that was told the company is played on another one (`yielded`: the server refused its upload, see
 *   js/account.js) takes the server's copy, however lately it stamped its own: it stood open, it was not played.
 * @returns {{ from: 'server'|'local'|'guest'|'none', save: object|null }}
 */
export function pickSave({ local = null, localRev = 0, server = null, serverRev = 0, guest = null, yielded = false }) {
  if (serverRev > localRev) return { from: 'server', save: server };
  if (yielded && server) return { from: 'server', save: server };
  if (!local && !server) return guest ? { from: 'guest', save: guest } : { from: 'none', save: null };
  if (!local) return { from: 'server', save: server };
  if (!server) return { from: 'local', save: local };
  return (server.lastSeen || 0) > (local.lastSeen || 0) ? { from: 'server', save: server } : { from: 'local', save: local };
}

/**
 * The flag of a store block that a game started without the server's word (js/game/store.js, bindStoreRules): a
 * signed-in player's game loaded without a block, and the server's save could not be had in that visit. What the visit
 * wrote into such a block (a piggy bank's first dollars, season points) must not replace the block the server keeps.
 */
export const UNCHECKED = 'unchecked';

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** True when the save's company has a store block that carries the flag UNCHECKED. */
const unchecked = save => plain(save?.company?.store) && plain(save.company.store.flags) && Object.hasOwn(save.company.store.flags, UNCHECKED);

/**
 * The save a signed-in player starts from, with the credits store's part of it kept. A copy of the game from before
 * the store writes the company it knows, without the `store` block (the purchases already applied, running boosts, the
 * piggy bank, the season, the card). The server keeps the stored block when such a save arrives (store_save,
 * supabase/migrations/20261115000000_store.sql); the device's own copy has none. When that copy wins (it was played
 * last) the game would start with an empty block, and the next upload, with a block of its own, would replace the
 * server's: a filled piggy bank would be gone, and the purchases of the last 60 days applied a second time. So a save
 * whose company has no `store` takes the server's block, and so does one whose block carries the flag UNCHECKED (it was
 * started without the server's word); where the server has none, such a block is the only one, and the flag goes.
 * A save with a block of its own keeps it, and so does a save without a company (a reset: blankSave).
 * @param save    the save that was picked (pickSave), or null
 * @param server  the server's copy, or null
 * @returns the save to start from: `save` itself when there is nothing to take
 */
export function keepStore(save, server) {
  if (!plain(save) || !plain(save.company)) return save;
  const flagged = unchecked(save);
  if ('store' in save.company && !flagged) return save;
  if (plain(server) && plain(server.company) && plain(server.company.store)) return { ...save, company: { ...save.company, store: server.company.store } };
  if (!flagged) return save;
  const { [UNCHECKED]: _, ...flags } = save.company.store.flags;
  return { ...save, company: { ...save.company, store: { ...save.company.store, flags } } };
}

/**
 * The save as an upload carries it while the store block is not known: without the block. The server then keeps the
 * one it has (store_save carries it over, as it does for a copy from before the store).
 * @returns `save` itself when it has no block
 */
export function withoutStore(save) {
  if (!plain(save) || !plain(save.company) || !('store' in save.company)) return save;
  const { store: _, ...company } = save.company;
  return { ...save, company };
}
