// @ts-check
// "How it works" for the Headquarters: one short card per tab, opened by its "?" button, and the three
// cards of the tour a new company gets the first time it opens the Headquarters (js/hq.js).
// Every figure here is read from the game's own rules, so the words cannot drift from what the game does.
import { CONTRACTS, RUSH, STREAK, FINANCE, GOALS } from './company.js';

const pct = share => `${+(share * 100).toFixed(1)}%`;   // 0.25 -> 25%, 0.001 -> 0.1%
const kindsByBonus = [...CONTRACTS.kinds].sort((a, b) => a.bonus - b.bonus);
/** "one good, small" / "one good, large" / "two goods" / "one good, with a time limit": what a kind of order asks for. */
export function kindWhat(kind) {
  if (kind.rush) return 'one good, with a time limit';
  if (kind.items > 1) return `${kind.items === 2 ? 'two' : kind.items} goods`;
  return kind.size < 1 ? 'one good, small' : 'one good, large';
}

/** Words that come back on several tabs, said once and the same way everywhere. */
export const TERMS = {
  xp: ['XP', 'Experience. Goals, contracts, milestones and achievements give it; enough of it moves you up a rank, and a new rank opens more of the game, such as managers and new locations.'],
  reputation: ['Reputation', `Grows with each contract delivered. Each point makes contracts pay ${pct(CONTRACTS.repBonus)} more, up to ${CONTRACTS.repCap} points.`],
  value: ['Company value', `Your cash, what you have spent building the company, and ${FINANCE.valuationSeconds / 60} minutes of your current profit.`],
  warehouse: ['Warehouse', 'Where the goods for a running contract wait until the order is full.'],
};

/**
 * One card per tab: a title, up to three steps (a bold start and the rest of the sentence), an optional
 * table (head row first) and the terms it uses. Tabs without an entry have no "?" button.
 */
export const HELP = {
  overview: {
    title: 'How the Headquarters works',
    steps: [
      ['Your company.', `With ${FINANCE.foundingYards} yards open you run a company: its income, its costs and what it is worth are counted here.`],
      ['Things to do come first.', 'Rewards to collect, orders to deliver and routes to buy are listed at the top of Overview.'],
      ['Ranks.', 'XP from goals and contracts moves you up a rank, and each rank opens more of the game.'],
    ],
    terms: ['xp', 'value'],
    tour: true,   // the card offers to show the three tour cards again
  },
  goals: {
    title: 'How goals work',
    steps: [
      ['Today.', `Three goals a day, new ones at midnight. Collect all three for a bonus of ${GOALS.daily.bonusXp} extra XP and cash.`],
      ['This week.', 'Three bigger goals, new ones every Monday. A goal you do not finish is simply replaced.'],
      ['Day streak.', `Collect a goal on days in a row: from the second day, the first goal of the day pays ${pct(STREAK.step)} more for each day, up to ${pct(STREAK.step * (STREAK.cap - 1))}.`],
    ],
    terms: ['xp'],
  },
  contracts: {
    title: 'How contracts work',
    steps: [
      ['Accept an offer.', 'A client asks for goods your yards make.'],
      ['The warehouse fills.', 'Those goods stop going to the shops and wait in the warehouse, so the money from them waits too.'],
      ['Deliver.', 'The client pays more than the shops would, with XP and reputation on top.'],
    ],
    table: [['Kind', 'Asks for', 'Over the shops'],
      ...kindsByBonus.map(k => [k.name.replace(/ order$/, ''), kindWhat(k) + (k.rush ? `; after ${RUSH.after} contracts` : ''), '+' + pct(k.bonus)])],
    terms: ['reputation', 'warehouse'],
  },
  logistics: {
    title: 'How logistics works',
    steps: [
      ['Warehouse.', 'Goods for a running contract collect here until the order is full.'],
      ['Trucks.', `A truck carries finished goods from one yard to the machines of the next, for ${pct(FINANCE.transportShare)} of their price, so nobody has to walk.`],
      ['Unlock them.', 'Trucks come with the Trucking research. The lab opens after your first contract.'],
    ],
    terms: ['warehouse'],
  },
  team: {
    title: 'How managers work',
    steps: [
      ['Hire.', 'A manager works for the whole company and does part of your work for you.'],
      ['Pay.', 'Each one is paid a small share of what your yards are expected to bring in.'],
      ['Train.', 'Each manager can be trained twice; some need a higher rank first.'],
    ],
    terms: ['xp'],
  },
  research: {
    title: 'How research works',
    steps: [
      ['Pay once.', 'A technology makes every yard better for good: faster machines, higher prices, lower costs.'],
      ['Levels.', 'Some can be bought again for a bigger effect.'],
      ['In force.', 'The top of the tab adds up everything that counts right now.'],
    ],
    terms: [],
  },
  finance: {
    title: 'How the figures work',
    steps: [
      ['Income.', 'What your yards sell, a minute.'],
      ['Costs.', 'Wages, upkeep, managers and trucks.'],
      ['Profit.', 'Income less costs. It is what your cash grows by while you play.'],
    ],
    terms: ['value'],
  },
};

/** The tour a company gets the first time its Headquarters opens. Each card may lead to a tab. */
export const TOUR = [
  { title: 'This is your Headquarters', text: 'Your yards are a company now. Goals that pay, client contracts, managers and research are run from here. A dot on the case at the top means something is waiting.' },
  { title: 'Ranks and XP', text: 'Goals, contracts and milestones give XP. The bar at the top fills toward the next rank, and each rank opens more of the game.' },
  { title: 'Contracts pay more', text: 'A client orders goods; while the order runs they collect in your warehouse instead of the shops, and the delivery pays more than selling them.', go: 'contracts', button: 'See offers' },
];
