// @ts-check
// Everything about the company as data: cost rates, ranks, milestones, research, contracts,
// truck routes, the market, Headquarters tabs and the locations on the roadmap.
// Adding a technology, a milestone, a contract kind or a location is a change here, not in the rules.

/** Money rules. baseIncome and growth mirror the calibration targets in tools/balance (a test checks this). */
export const FINANCE = {
  foundingYards: 2,        // the company is founded when this many yards are open
  baseIncome: 20,          // dollars per second the first yard's workers bring in when it is fully built
  growth: 2.2,             // total worker income multiplies by this with each completed yard
  wageShare: 0.04,         // one worker costs this share of the yard's reference income
  upkeepShare: 0.02,       // one machine costs this share of the yard's reference income
  transportShare: 0.02,    // a truck charges this share of an item's price for moving it
  valuationSeconds: 600,   // the valuation counts this many seconds of current profit
  rateMemory: 60,          // per-minute figures are smoothed over about this many seconds
};

export const RANKS = [
  { name: 'Worker', xp: 0, icon: '🧑‍🔧' },
  { name: 'Yard Owner', xp: 100, icon: '🏡' },
  { name: 'Factory Owner', xp: 400, icon: '🏭' },
  { name: 'Industrial Manager', xp: 1000, icon: '📋' },
  { name: 'Business Owner', xp: 2500, icon: '💼' },
  { name: 'Corporation CEO', xp: 6000, icon: '🏢' },
  { name: 'Industrial Tycoon', xp: 25000, icon: '🎩' },
  { name: 'Global Business Empire', xp: 80000, icon: '🌍' },
  // The ninth rank needs more than experience: Commercial Metropolis fully built, once (kept through a sale of
  // the company). 250,000 continues the steps before it (25,000, then 80,000: about three times more each).
  { name: 'Industry Legend', xp: 250000, needs: 'metropolis', needsText: 'once Commercial Metropolis is fully built' },
];

/** measure: what is counted. The rules know: yards, workers, income, contracts, research, routes, market, goodPrice, sold, peak, rush. */
export const MEASURES = {
  yards: { name: 'yards open', icon: '🏗️' },
  workers: { name: 'workers hired', icon: '👷' },
  income: { name: 'earned in total', icon: '💵', money: true },
  contracts: { name: 'contracts delivered', one: 'contract delivered', icon: '📦' },
  research: { name: 'research levels done', one: 'research level done', icon: '🔬' },
  routes: { name: 'truck routes', one: 'truck route', icon: '🚚' },
  // the newer content: the market, the records and rush orders
  market: { name: 'goods sold on the market' },
  goodPrice: { name: 'goods sold from the warehouse at 10% or more above normal' },
  sold: { name: 'items brought to the shops' },
  peak: { name: 'earned in one minute', money: true },
  rush: { name: 'rush orders delivered in time', one: 'rush order delivered in time' },
};
/** "5 contracts delivered", "$1M earned in total": a milestone in words. `fmt` formats the number. */
export const milestoneText = (m, fmt) => {
  const meas = MEASURES[m.measure];
  return `${meas.money ? '$' : ''}${fmt(m.at)} ${m.at === 1 && meas.one ? meas.one : meas.name}`;
};
const steps = (measure, pairs) => pairs.map(([at, xp]) => ({ id: `${measure}:${at}`, measure, at, xp }));
export const MILESTONES = [
  ...steps('yards', [[2, 100], [3, 60], [4, 80], [6, 150], [8, 250], [10, 400], [12, 600], [14, 900], [16, 1500], [18, 2000], [20, 3000]]),
  ...steps('workers', [[4, 50], [12, 150], [24, 400], [32, 700], [40, 1000]]),
  ...steps('income', [[1e5, 60], [1e6, 120], [1e7, 250], [1e8, 500], [1e9, 1000], [1e10, 2000], [1e11, 4000], [1e12, 8000]]),
  ...steps('contracts', [[1, 40], [5, 100], [15, 250], [40, 500], [100, 1000], [250, 2000], [500, 4000]]),
  ...steps('research', [[1, 40], [5, 200], [13, 600], [23, 1500]]),
  ...steps('routes', [[1, 60], [4, 200], [11, 800], [19, 1200]]),
  // The newer content. Experience is in line with the steps above: a first step is worth 60 to 150, and the last
  // of a ladder, which takes days of play, 800 to 1,000. 6,610 in all, a sixth of what the older milestones give.
  ...steps('market', [[1000, 150], [10000, 400], [100000, 1000]]),      // a finished Automobile Factory sends about 1,800 cars an hour to its shop
  ...steps('goodPrice', [[100, 150], [1000, 400], [10000, 1000]]),      // only what waited in the warehouse for a price 10% over normal
  ...steps('sold', [[10000, 100], [100000, 300], [1000000, 800]]),
  ...steps('peak', [[1e6, 100], [1e8, 300], [1e10, 800]]),              // the most earned in one minute of play
  ...steps('rush', [[1, 60], [10, 250], [50, 800]]),
];

export const WAREHOUSE = { capacity: 60 };   // of each item, before research

export const CONTRACTS = {
  offers: 3,
  slots: 1,                // contracts running at once, before research
  refreshSeconds: 120,     // play time between two "new offers"
  repBonus: 0.001,         // each reputation point adds this share to contract pay
  repCap: 100,
  recentItems: 4,          // offers ask for goods of the newest yards
  fillSeconds: 300,        // ... and only for goods that reach the shops fast enough to fill a supply order in this time
  staleSeconds: 30,        // how often offers for goods that stopped reaching the shops are swapped out
  assumedRate: 0.2,        // items a second assumed to reach the shops while nothing has been measured yet
  tierXp: 0.1,             // experience grows by this share per yard index of the goods
  kinds: [
    { id: 'supply', name: 'Supply order', icon: '📦', items: 1, size: 0.5, bonus: 0.25, xp: 15, rep: 1,
      clients: ['Hillside Hardware', 'Corner Market', 'Brook Street Store', 'Old Town Traders', 'Lakeview Supply'] },
    { id: 'bulk', name: 'Bulk order', icon: '🚛', items: 1, size: 1, bonus: 0.35, xp: 30, rep: 2,
      clients: ['Northgate Wholesale', 'Union Depot', 'Riverside Builders', 'Grand Central Stores', 'Harbour Trading Co.'] },
    { id: 'project', name: 'Project', icon: '🏛️', items: 2, size: 0.75, bonus: 0.5, xp: 50, rep: 3,
      clients: ['Town Hall', 'New School', 'River Bridge', 'Railway Station', 'City Hospital', 'Public Library'] },
    // A rush order is never drawn with the three above: it is offered by its own clock (RUSH below).
    { id: 'rush', name: 'Rush order', rush: true, items: 1, size: 0.5, bonus: 0.7, xp: 40, rep: 2,
      clients: ['Night Express', 'Same Day Freight', 'Harbour Dispatch', 'Airport Cargo'] },
  ],
};

/**
 * Rush orders: a contract with a time limit, counted in seconds of play. It is as large as a supply order and
 * pays 70% over selling, against 25% for the supply order and 50% for a project, so it is clearly the best
 * offer when the yards can make it, and it is offered seldom so that it stays a small part of contract income.
 */
export const RUSH = {
  every: 900,              // seconds of play between two rush offers: four an hour at most
  first: 300,              // ... and until the first one of a company that has never seen one
  after: 3,                // contracts delivered before the first rush order: the player knows contracts by then
  slack: 1.5,              // the time limit is this many times what the goods need at the pace they reach the shops
  step: 30,                // ... rounded up to this many seconds
  minLimit: 90,            // never shorter than this: time to see the offer, accept it and walk a load over
  maxLimit: 600,           // a good that needs longer than this is not asked for in a hurry
  repLoss: 3,              // reputation lost when the time runs out or the order is given up: more than the 2 it would have brought
  retry: 30,               // seconds until the next try when no good can make it right now
  margin: 1.2,             // a manager (and the simulator's bot) takes a rush order only with this much time to spare
};

/**
 * Regular clients: every delivery to the same client counts, and at `levels` deliveries the client moves up a
 * level. Each level adds `bonus` to what that client's orders pay. Small on purpose: 3% at the top, on orders
 * that already pay 25% to 70% over selling.
 */
export const CLIENTS = {
  levels: [2, 5, 10],      // deliveries for level 1, 2 and 3
  bonus: 0.01,             // share of an order's pay added per level
};

export const ROUTES = {
  rate: 0.5,               // items per second
  costMult: 2,             // a route costs this many times the destination yard's first worker
};

/**
 * The market of Commercial Metropolis (rules in js/sim/market.js). What a good sells for there is its
 * normal price times a level that moves with play time: every `step` seconds it takes a random step of
 * at most `swing` and is pulled `pull` of the way back to normal, and it never leaves the band.
 */
export const MARKET = {
  band: 0.25,              // a price is never more than this share above or below normal
  step: 30,                // seconds of play between two prices
  pull: 0.1,               // each step the price comes back this share of the way toward normal
  swing: 0.34,             // the largest random step, as a share of the band
  memory: 60,              // steps a price remembers; older ones have faded to under 0.2% and are left out
  history: 60,             // prices kept for the chart: half an hour of play
  goodPrice: 1.1,          // a warehouse sale at this much of normal or more counts as "a good price" (milestones); prices are there 19% of the time
  topPrice: 1.2,           // ... and at this much as the top of the market (an achievement)
  alertAt: 1.15,           // a marked good is announced when its price rises to this much of normal
  autoSellAt: 1.15,        // a Sales Manager at level 3 sells kept goods at this much of normal, when switched on
  autoSellLevel: 3,
};

export const CATEGORIES = {
  production: { name: 'Production', icon: '⚙️' },
  workforce: { name: 'Workforce', icon: '👷' },
  logistics: { name: 'Logistics', icon: '🚚' },
  finance: { name: 'Finance', icon: '📈' },
  energy: { name: 'Energy', icon: '⚡' },
  automation: { name: 'Automation', icon: '🤖' },
  materials: { name: 'Advanced materials', icon: '💎' },
};

/**
 * effect types the rules know:
 *   { type: 'mult', stat, value }      multiply a modifier (per level)
 *   { type: 'add', stat, value }       add to a modifier (per level)
 *   { type: 'set', values: { ... } }   set modifiers outright
 * Modifiers: price, speed, workerSpeed, wage, upkeep, storage, routeRate, contractPay,
 *            contractSlots, offlineShare, offlineCap, routes, researchCost, truckFee, clientBonus, forecast.
 * rank: index into RANKS the player must have. needs: research that must be done first.
 * location: a yard of that location must be open.
 * levels and costGrowth make a technology repeatable.
 */
export const RESEARCH = [
  { id: 'tooling', cat: 'production', name: 'Sharper tooling', desc: 'Every machine works 25% faster', cost: 4000, rank: 1,
    effect: { type: 'mult', stat: 'speed', value: 1.25 } },
  { id: 'racks', cat: 'logistics', name: 'Warehouse racks', desc: 'The warehouse holds 150 of each item', cost: 6000, rank: 1,
    effect: { type: 'mult', stat: 'storage', value: 2.5 } },
  { id: 'training', cat: 'workforce', name: 'Training program', desc: 'Workers walk 20% faster', cost: 15000, rank: 1,
    effect: { type: 'mult', stat: 'workerSpeed', value: 1.2 } },
  { id: 'trucking', cat: 'logistics', name: 'Trucking', desc: 'Trucks can carry goods from one yard to the next', cost: 40000, rank: 2, needs: ['racks'],
    effect: { type: 'set', values: { routes: true } } },
  { id: 'efficient', cat: 'energy', name: 'Efficient machines', desc: 'Machine upkeep is cut in half', cost: 90000, rank: 2,
    effect: { type: 'mult', stat: 'upkeep', value: 0.5 } },
  { id: 'salesoffice', cat: 'finance', name: 'Sales office', desc: 'Run two contracts at the same time', cost: 150000, rank: 2,
    effect: { type: 'add', stat: 'contractSlots', value: 1 } },
  { id: 'nightshift', cat: 'automation', name: 'Night shift', desc: 'While you are away, workers earn 60% for up to 6 hours', cost: 400000, rank: 3,
    effect: { type: 'set', values: { offlineShare: 0.6, offlineCap: 6 * 3600 } } },
  { id: 'payroll', cat: 'workforce', name: 'Payroll system', desc: 'Wages are 25% lower', cost: 900000, rank: 3, needs: ['training'],
    effect: { type: 'mult', stat: 'wage', value: 0.75 } },
  { id: 'negotiation', cat: 'finance', name: 'Negotiation', desc: 'Contracts pay 20% more', cost: 2000000, rank: 3, needs: ['salesoffice'],
    effect: { type: 'mult', stat: 'contractPay', value: 1.2 } },
  { id: 'lines', cat: 'production', name: 'Assembly lines', desc: 'Every machine works another 40% faster', cost: 5000000, rank: 4, needs: ['tooling'],
    effect: { type: 'mult', stat: 'speed', value: 1.4 } },
  { id: 'express', cat: 'logistics', name: 'Express routes', desc: 'Trucks carry twice as much', cost: 8000000, rank: 4, needs: ['trucking'],
    effect: { type: 'mult', stat: 'routeRate', value: 2 } },
  { id: 'quality', cat: 'materials', name: 'Quality control', desc: 'Everything sells for 15% more', cost: 20000000, rank: 4,
    effect: { type: 'mult', stat: 'price', value: 1.15 } },
  { id: 'depot', cat: 'logistics', name: 'Distribution centre', desc: 'The warehouse holds 300 of each item', cost: 30000000, rank: 5, needs: ['racks'],
    effect: { type: 'mult', stat: 'storage', value: 2 } },
  { id: 'brand', cat: 'materials', name: 'Brand value', desc: 'Everything sells for 5% more, each level', cost: 50000000, rank: 5, levels: 12, costGrowth: 3,
    effect: { type: 'mult', stat: 'price', value: 1.05 } },
  // Four for the late game, priced like the others: near the plots of the yards where they start to matter
  // (Metropolis upgrades run from 530 million to 20 billion). None of them raises a price, a machine's speed
  // or what a truck carries, so the most a company can earn in a second, which the leaderboard's bound is
  // built on, stays put. Larger truck loads were tried and taken out: see "More to do" in docs/business/ECONOMY_DESIGN.md.
  { id: 'fleet', cat: 'logistics', name: 'Fleet contracts', desc: 'Trucks charge half as much for every item they move', cost: 600000000, rank: 5, needs: ['trucking'],
    effect: { type: 'mult', stat: 'truckFee', value: 0.5 } },
  { id: 'accounts', cat: 'finance', name: 'Key accounts', desc: 'Regular clients add twice as much to what their orders pay', cost: 1500000000, rank: 5, needs: ['negotiation'],
    effect: { type: 'mult', stat: 'clientBonus', value: 2 } },
  { id: 'forecast', cat: 'finance', name: 'Market forecast', desc: 'The Advisor shows the next price of every market good', cost: 2500000000, rank: 5, location: 'metropolis',
    effect: { type: 'set', values: { forecast: true } } },
  { id: 'vault', cat: 'logistics', name: 'Automated storage', desc: 'The warehouse holds half as much again', cost: 4000000000, rank: 5, needs: ['depot'],
    effect: { type: 'mult', stat: 'storage', value: 1.5 } },
];

/** Headquarters tabs. unlock: { contracts: n }, { rank: n } or { location: id } (a yard there is open); none means open from the founding. */
export const TABS = [
  { id: 'overview', name: 'Overview', icon: '🏢' },
  { id: 'goals', name: 'Goals', icon: '🎯' },
  { id: 'businesses', name: 'Businesses', icon: '🏭' },
  { id: 'team', name: 'Team', icon: '🧑‍💼', unlock: { rank: 2 }, hint: 'Reach the rank Factory Owner to hire managers.' },
  { id: 'contracts', name: 'Contracts', icon: '📦' },
  { id: 'research', name: 'Research', icon: '🔬', unlock: { contracts: 1 }, hint: 'Deliver your first contract to open the research lab.' },
  { id: 'logistics', name: 'Logistics', icon: '🚚' },
  { id: 'finance', name: 'Finance', icon: '📈', unlock: { rank: 2 }, hint: 'Reach the rank Factory Owner to open the books.' },
  { id: 'market', name: 'Market', icon: '💹', unlock: { location: 'metropolis' }, hint: 'Open Commercial Metropolis to trade on its market.' },
  { id: 'expansion', name: 'Expansion', icon: '🗺️' },
  { id: 'construction', name: 'Construction', unlock: { yards: 20 }, hint: 'Open all 20 yards to start building.' },   // the building site (js/data/builds.js)
  { id: 'ranking', name: 'Ranking', icon: '🏆' },
  { id: 'records', name: 'Records' },
  { id: 'advisor', name: 'Advisor' },
];

/**
 * The roadmap. Only locations with playable: true exist in the game; the rest are plans, shown as such.
 * market: true puts the goods made there on the market, where their price moves.
 */
export const LOCATIONS = [
  { id: 'town', name: 'Lumber Town', stage: 1, playable: true, icon: '🌲',
    pitch: 'Where it all starts: twelve yards, from a single saw to a gem mine.' },
  { id: 'city', name: 'Industrial City', stage: 2, playable: true, icon: '🏙️',
    pitch: 'Heavy industry with no raw materials of its own. Factories run on goods trucked in from Lumber Town, and most products need two of them.',
    opens: 'Finish the Gem Mine, then pay for the road at its gate.' },
  { id: 'metropolis', name: 'Commercial Metropolis', stage: 3, playable: true, market: true, icon: '🌆',
    pitch: 'Engines, cars, robots and a department store, sold on a market where prices move. Sell when the price is good, or keep goods in the warehouse until it is.',
    opens: 'Finish the Electronics Factory, then pay for the road at its gate.' },
  { id: 'region', name: 'International Industrial Region', stage: 4, icon: '🚢', rank: 6,
    pitch: 'Ports, trade routes and regional managers who run whole districts for you.',
    industries: ['Shipyard', 'Aircraft Manufacturing', 'Advanced Technology'],
    needs: ['Build up the Metropolis', 'Reach the rank Industrial Tycoon'] },
  { id: 'global', name: 'Global Business Empire', stage: 5, icon: '🌍', rank: 7,
    pitch: 'Companies on every continent, and the industries of the future.',
    industries: ['Space Industry', 'Global Logistics', 'Research Institutes'],
    needs: ['Build up the International Region', 'Reach the rank Global Business Empire'] },
];

// ---------------------------------------------------------------- managers (phase 2)
export const STAFF_RULES = {
  salaryShare: 0.01,   // each manager costs this share of the company's reference income (the open yards' summed)
  trainGrowth: 8,      // each training level costs this many times the one before
};
/** One effect per level, of the same types research uses. Flags: autoDeliver, autoAccept, autoBuy. */
const repeat = (text, more, effect) => ({ levels: [text, more, more], effects: [effect, effect, effect] });
export const STAFF = [
  { id: 'supervisor', name: 'Production Supervisor', icon: '🧑‍🏭', rank: 2, cost: 60000,
    ...repeat('Machines work 8% faster', 'Machines work another 8% faster', { type: 'mult', stat: 'speed', value: 1.08 }) },
  { id: 'warehouse', name: 'Warehouse Manager', icon: '📋', rank: 2, cost: 120000,
    levels: ['Delivers finished orders for you', 'Also accepts the best new order', 'The warehouse holds half as much again'],
    effects: [{ type: 'set', values: { autoDeliver: true } }, { type: 'set', values: { autoAccept: true } }, { type: 'mult', stat: 'storage', value: 1.5 }] },
  { id: 'factory', name: 'Factory Manager', icon: '🏗️', rank: 3, cost: 300000,
    levels: ['Buys the next upgrade in every yard when the cash is there', 'Wages are 10% lower', 'Wages are another 10% lower'],
    effects: [{ type: 'set', values: { autoBuy: true } }, { type: 'mult', stat: 'wage', value: 0.9 }, { type: 'mult', stat: 'wage', value: 0.9 }] },
  { id: 'dispatcher', name: 'Dispatcher', icon: '🚚', rank: 3, cost: 600000, needs: ['trucking'],
    ...repeat('Trucks carry 50% more', 'Trucks carry another 50% more', { type: 'mult', stat: 'routeRate', value: 1.5 }) },
  { id: 'sales', name: 'Sales Manager', icon: '🤝', rank: 4, cost: 2000000,
    ...repeat('Everything sells for 4% more', 'Everything sells for another 4% more', { type: 'mult', stat: 'price', value: 1.04 }),
    // at level 3 he can also be told to sell kept market goods by himself (MARKET.autoSellLevel; the switch is on the Advisor tab)
    levels: ['Everything sells for 4% more', 'Everything sells for another 4% more', 'Another 4% more, and he can sell the market goods you keep for you (switch on the Advisor tab)'] },
];

// ---------------------------------------------------------------- daily and weekly goals (phase 2)
/**
 * Seconds are seconds of the company's reference income, so goals grow with the company.
 * kinds: what is counted (the rules know each id). `daily` and `weekly` are the targets;
 * the income kind takes its target from earnSeconds. {n} in the text is the target.
 */
export const GOALS = {
  daily: { count: 3, earnSeconds: 600, paySeconds: 240, xp: 40, bonusSeconds: 300, bonusXp: 60 },
  weekly: { count: 3, earnSeconds: 5400, paySeconds: 1800, xp: 250 },
  kinds: [
    { id: 'income', icon: '💵', text: 'Earn {n}', money: true },
    { id: 'sold', icon: '🛒', text: 'Bring {n} items to the shops', daily: 300, weekly: 2000 },
    { id: 'contracts', icon: '📦', text: 'Deliver {n} contracts', daily: 2, weekly: 10 },
    { id: 'upgrades', icon: '🔧', text: 'Buy {n} upgrades', daily: 3, weekly: 10 },
    { id: 'trucked', icon: '🚚', text: 'Truck {n} items between yards', daily: 150, weekly: 1000 },
    { id: 'research', icon: '🔬', text: 'Research {n} technologies', one: 'Research 1 technology', daily: 1, weekly: 3 },
  ],
};

/**
 * The daily streak. A day counts when a daily goal is collected on it, so opening the game pays nothing.
 * Every day in a row adds `step` to the first daily goal collected that day, up to `cap` days; a missed day
 * takes one day off the streak instead of ending it. At the cap the bonus is 30% of one daily goal: 72 seconds
 * of the company's reference income a day, against 1,020 for the three goals and their bonus.
 */
export const STREAK = { cap: 7, step: 0.05 };

// ---------------------------------------------------------------- achievements (phase 2)
/** measure: what is looked at (the rules know each one). Awarded once, when the measure reaches `at`. */
export const ACHIEVEMENTS = [
  { id: 'hands', icon: '🧤', name: 'Hands on', desc: 'Sell 1,000 items yourself', measure: 'byHand', at: 1000, xp: 100 },
  { id: 'full', icon: '🏬', name: 'Full house', desc: 'Fill the warehouse to its limit with one item', measure: 'fullest', at: 1, xp: 80 },
  { id: 'black', icon: '🖤', name: 'In the black', desc: 'Have four or more yards, every one of them in profit', measure: 'allProfit', at: 4, xp: 150 },
  { id: 'bigdeal', icon: '🤑', name: 'Big deal', desc: 'Deliver a contract worth $1M', measure: 'bestContract', at: 1e6, xp: 150, money: true },
  { id: 'projects', icon: '🏛️', name: 'Project manager', desc: 'Deliver 10 projects', measure: 'projects', at: 10, xp: 200 },
  { id: 'name', icon: '⭐', name: 'Good name', desc: 'Reach 50 reputation', measure: 'rep', at: 50, xp: 150 },
  { id: 'handsoff', icon: '🛋️', name: 'Hands off', desc: 'Let the Warehouse Manager deliver 10 orders', measure: 'autoDelivered', at: 10, xp: 150 },
  { id: 'scholar', icon: '🎓', name: 'Scholar', desc: 'Research every one-time technology', measure: 'oneTime', at: RESEARCH.filter(r => !r.levels).length, xp: 300 },
  { id: 'team', icon: '🧑‍🤝‍🧑', name: 'Dream team', desc: 'Hire all five managers', measure: 'staff', at: STAFF.length, xp: 250 },
  { id: 'trained', icon: '🏅', name: 'Top of the class', desc: 'Train a manager to level 3', measure: 'topLevel', at: 3, xp: 200 },
  { id: 'habit', icon: '📅', name: 'Daily habit', desc: 'Finish all three daily goals on 7 days', measure: 'dailySets', at: 7, xp: 300 },
  { id: 'billion', icon: '💰', name: 'Billion-dollar company', desc: 'Reach a company value of $1B', measure: 'value', at: 1e9, xp: 400, money: true },
  // Twelve for the records and the newer systems, with the same 80 to 400 experience: 3,050 in all (the first twelve give 2,430).
  { id: 'bigcity', name: 'Big city', desc: 'Open a yard in Commercial Metropolis', measure: 'metroOpen', at: 1, xp: 200 },
  { id: 'skyline', name: 'Skyline', desc: 'Build all four Metropolis yards to the last upgrade', measure: 'metroBuilt', at: 4, xp: 400 },
  { id: 'timing', name: 'Good timing', desc: 'Sell 500 goods from the warehouse at 10% or more above normal', measure: 'marketGood', at: 500, xp: 200 },
  { id: 'peak', name: 'Top of the market', desc: 'Sell 100 goods from the warehouse at 20% or more above normal', measure: 'marketTop', at: 100, xp: 250 },
  { id: 'fleet', name: 'Fleet owner', desc: 'Run 10 truck routes', measure: 'routes', at: 10, xp: 200 },
  { id: 'haul', name: 'Long haul', desc: 'Truck 100,000 items between yards', measure: 'trucked', at: 100000, xp: 300 },
  { id: 'week', name: 'Seven in a row', desc: 'Reach a streak of 7 days', measure: 'streakBest', at: STREAK.cap, xp: 300 },
  { id: 'clock', name: 'On the clock', desc: 'Deliver 5 rush orders in time', measure: 'rush', at: 5, xp: 200 },
  { id: 'regular', name: 'Regular client', desc: 'Bring a client to level 3', measure: 'clientTop', at: CLIENTS.levels.length, xp: 150 },
  { id: 'minute', name: 'A good minute', desc: 'Earn $1B in one minute', measure: 'peakMinute', at: 1e9, xp: 250, money: true },
  { id: 'specialist', name: 'Specialist', desc: 'Bring 100,000 of one good to the shops', measure: 'topGood', at: 100000, xp: 300 },
  { id: 'secondact', name: 'Second act', desc: 'Sell the company and found a new one', measure: 'sales', at: 1, xp: 300 },
  // Two for the building site (js/data/builds.js): 700 experience on top of what the builds themselves pay.
  { id: 'firsthome', name: 'First home', desc: 'Finish the Family House', measure: 'houseBuilt', at: 1, xp: 300 },
  { id: 'builder', name: 'Master builder', desc: 'Finish all three builds', measure: 'builds', at: 3, xp: 400 },
];

// ---------------------------------------------------------------- selling the company (phase 4)
/** A sale pays stars(n) legacy stars for n fully built yards; every star adds starBonus to all prices. */
export const PRESTIGE = {
  minYards: 6,             // fully built yards the first sale needs
  minYardsPerSale: 2,      // ... and every company sold raises that by two, up to all of them: 6, 8, 10 and so on
  starBonus: 0.01,         // 1% per star: a full company (52 stars) is worth half as much again on every sale
  costPerStar: 0.08,       // ... and every upgrade of the next company costs 8% more per star, so each company is a bigger build than the last
  stars: n => Math.floor(n * (n + 1) / 8),   // 6 yards: 5 stars, 12: 19, 16: 34, 20: 52. Going further pays better per hour.
};

// ---------------------------------------------------------------- events (phase 4)
/**
 * days: weekdays the event runs on (0 = Sunday). effect: one effect of the kinds research uses.
 * goal: one extra goal while it runs, counted like the daily goals.
 */
export const EVENTS = [
  { id: 'fair', name: 'Trade Fair', icon: '🎪', days: [6, 0], desc: 'Contracts pay 50% more', until: 'Sunday night',
    effect: { type: 'mult', stat: 'contractPay', value: 1.5 }, goal: { kind: 'contracts', target: 5 } },
  { id: 'machines', name: 'Machine Day', icon: '⚙️', days: [3], desc: 'Every machine works 30% faster', until: 'midnight',
    effect: { type: 'mult', stat: 'speed', value: 1.3 }, goal: { kind: 'sold', target: 600 } },
  // Monday and Friday, so that no day has two boosts and Tuesday and Thursday stay ordinary days.
  // Truck Day waives the fee and leaves the loads alone: trucks that carry more take every iron bar, barrel of fuel and gold bar
  // for the first of the two yards that share them, and the second stands still (the economy document has the numbers).
  { id: 'trucks', name: 'Truck Day', days: [1], desc: 'Trucks carry goods free of charge', until: 'midnight',
    effect: { type: 'mult', stat: 'truckFee', value: 0 }, goal: { kind: 'trucked', target: 300 } },
  { id: 'lab', name: 'Lab Day', days: [5], desc: 'Research costs 15% less', until: 'midnight',
    effect: { type: 'mult', stat: 'researchCost', value: 0.85 }, goal: { kind: 'research', target: 1 } },
];
// paySeconds and earnSeconds are seconds of the company's reference income. A company that cannot finish an
// event's own goal (no truck route yet, no research it can afford) is asked to earn earnSeconds of it instead.
export const EVENT_GOAL = { paySeconds: 600, xp: 100, earnSeconds: 900 };
