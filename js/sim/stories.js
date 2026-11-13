// The people behind the clients, and the story of an order. Pure, and words only: a story is worked out
// from a contract each time it is shown and changes nothing. What is ordered, how much, what it pays and
// how long a rush order has are the contract's own (js/sim/company.js); the texts (js/data/stories.js,
// written from tools/stories/stories.json) hold no numbers, and the ones a story shows are put in here.
import { STORIES } from '../data/stories.js';

/** "40 planks", "40 planks and 20 bricks", "5 gems, 10 rings and 2 cars": what an order asks for, as the Headquarters writes it. */
export function needsText(needs, items) {
  const parts = needs.map(([item, qty]) => `${qty} ${(Object.hasOwn(items, item) && items[item].label) || item}`);
  return parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
/** A rush order's time limit in words: "90 seconds", "5 min", "2 min 30 s". Limits are counted in seconds of play. */
export function limitText(seconds) {
  const s = Math.round(seconds);
  if (s < 120) return `${s} seconds`;
  return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
}
/** Which of `n` lines an order shows: always the same one for the same order, and spread evenly over the orders. */
export function pick(id, n) {
  let h = Math.imul((Number(id) | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) % n;
}

/** The person behind a client: { who, role, about }, or null for a client the texts do not know. */
export const personOf = (client, stories = STORIES) => (typeof client === 'string' && Object.hasOwn(stories.clients, client) ? stories.clients[client] : null);

/**
 * Who asks, and what they say.
 * @param contract  an offer or a running contract: { id, kind, client, needs: [[item, qty]], limit? }
 * @param items     the goods of the game by id, for their names
 * @returns {{ who: string, role: string, about: string, text: string }|null}  null for a client the texts do not
 *   know (a save from another version of the game): the card is then shown as it was before there were stories
 */
export function storyFor(contract, items, stories = STORIES) {
  const person = personOf(contract?.client, stories);
  if (!person || !Array.isArray(contract.needs) || !contract.needs.length) return null;
  const timed = contract.limit > 0;
  let lines = [...person.lines];
  // A shop sells to customers of its own: for an order of one kind of goods it may also tell of the customer who wants them.
  if (person.shop && !timed && contract.needs.length === 1) lines.push(...(Object.hasOwn(stories.goods, contract.needs[0][0]) ? stories.goods[contract.needs[0][0]] : []));
  if (!timed) lines = lines.filter(l => !l.includes('{limit}'));   // a text never speaks of a time the order does not have
  if (!lines.length) return null;
  const text = lines[pick(contract.id, lines.length)]
    .replace('{needs}', needsText(contract.needs, items))
    .replace('{limit}', timed ? limitText(contract.limit) : '');
  return { who: person.who, role: person.role, about: person.about, text };
}
