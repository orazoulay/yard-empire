// A backup the player can hold: the save as a text file, and reading one back. Pure: no files, no storage, no page.
//
// A backup that is read back goes through the same door as a save that is loaded: the Economy and the
// Company build themselves from it, dropping what they do not know and mending what is missing, and what
// they write out again is what is kept. So a backup can do nothing a save on the device could not do.
// What is refused outright: text that is not a backup, a backup with its game cut off or bent out of
// shape, and one written by a newer version of the game, whose fields this version would lose.
import { Economy, SAVE_VERSION } from './economy.js';
import { Company } from './company.js';
import { AREAS, ITEMS, RECIPES, BASE_CAPACITY, allUpgrades } from '../data/areas.js';

export const BACKUP_MARK = 'yard-empire-backup';
export const BACKUP_FORMAT = 1;
const MAX_LENGTH = 2000000;   // characters: a real save is a few thousand
const MAX_CASH = 1e18;        // the most the server keeps (backend/api.py)

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const amount = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const refuse = reason => ({ ok: false, reason });

/** The save as the text of a backup file. @param save what the game writes to the device  @param now milliseconds */
export function exportSave(save, now) {
  return JSON.stringify({ game: BACKUP_MARK, format: BACKUP_FORMAT, exported: Math.floor(now), save });
}
/** yard-empire-backup-2026-11-12.txt, from the device's own date. */
export function backupName(date) {
  const two = n => String(n).padStart(2, '0');
  return `${BACKUP_MARK}-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}.txt`;
}

/**
 * Read a backup.
 * @param text the text of the file
 * @param now  milliseconds: the save comes back stamped "now", so it counts as the newest copy and no time away is paid for its age
 * @returns {{ ok: true, save: object, summary: { exported, yards, cash, rank, stars, name } } | { ok: false, reason: string }}
 */
export function importSave(text, now) {
  if (typeof text !== 'string' || !text.trim()) return refuse('The file is empty.');
  if (text.length > MAX_LENGTH) return refuse('The file is too large to be a backup of this game.');
  let file;
  try { file = JSON.parse(text); } catch { return refuse('The file could not be read. It is damaged, or it is not a backup of this game.'); }
  if (!plain(file) || file.game !== BACKUP_MARK) return refuse('This is not a backup of this game.');
  if (!(file.format <= BACKUP_FORMAT) || !plain(file.save)) return refuse(file.format > BACKUP_FORMAT ? 'This backup was made by a newer version of the game. Update the game, then try again.' : 'The backup is damaged: the game in it is missing.');
  const raw = file.save;
  if (!Number.isFinite(raw.v)) return refuse('The backup is damaged: the game in it is missing.');
  if (raw.v > SAVE_VERSION) return refuse('This backup was made by a newer version of the game. Update the game, then try again.');
  if (!amount(raw.cash) || !plain(raw.unlocked) || !plain(raw.paid) || !Array.isArray(raw.areas) || (raw.company != null && !plain(raw.company))) {
    return refuse('The backup is damaged: parts of the game in it are missing.');
  }
  // Copies of the upgrades: the Economy rescales their costs by the legacy stars of the save it loads,
  // and the game that is running must not feel that.
  const upgrades = allUpgrades(AREAS).map(u => ({ ...u }));
  const known = new Set(upgrades.map(u => u.id)), yards = new Set(AREAS.map(a => a.id));
  const kept = {
    ...raw, cash: Math.min(raw.cash, MAX_CASH),
    unlocked: Object.fromEntries(Object.entries(raw.unlocked).filter(([id, on]) => known.has(id) && on)),
    paid: Object.fromEntries(Object.entries(raw.paid).filter(([id, v]) => known.has(id) && amount(v))),
    areas: raw.areas.filter((id, i, all) => yards.has(id) && all.indexOf(id) === i),
  };
  let econ, company;
  try {
    econ = new Economy({ items: ITEMS, upgrades, baseCapacity: BASE_CAPACITY, firstArea: AREAS[0].id }, kept);
    company = new Company({ econ, areas: AREAS, items: ITEMS, recipes: RECIPES }, kept.company || null);
    econ.company = company;
  } catch { return refuse('The backup is damaged: the game in it could not be loaded.'); }
  econ.lastSeen = Math.floor(now);
  const save = JSON.parse(JSON.stringify(econ));
  return { ok: true, save, summary: { exported: amount(file.exported) ? file.exported : 0, yards: save.areas.length, cash: save.cash,
    rank: company.rankInfo().name, stars: company.legacy.stars, name: company.name } };
}
