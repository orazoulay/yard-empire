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
 * @returns {{ from: 'server'|'local'|'guest'|'none', save: object|null }}
 */
export function pickSave({ local = null, localRev = 0, server = null, serverRev = 0, guest = null }) {
  if (serverRev > localRev) return { from: 'server', save: server };
  if (!local && !server) return guest ? { from: 'guest', save: guest } : { from: 'none', save: null };
  if (!local) return { from: 'server', save: server };
  if (!server) return { from: 'local', save: local };
  return (server.lastSeen || 0) > (local.lastSeen || 0) ? { from: 'server', save: server } : { from: 'local', save: local };
}
