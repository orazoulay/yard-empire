// Pure worker job selection. A "station view" is a plain object:
//   { id, area, x, z, machine?, provides(item) -> count available, accepts(item) -> free slots }
// `machine` is true for processing stations and false or absent for shops.

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * Where a worker may take `item`, best first.
 * Deliver first, sell the surplus: any machine with room for the item comes before a shop, even
 * when that machine stands in the neighbouring yard. Selling only ever happens in the worker's
 * own yard, so goods are not hauled across the map just to be sold. With `worker.reach` set, machines
 * further away than a neighbouring yard are left out too, and the worker's own machines come first.
 * @param near  point the distance is measured from (defaults to the worker)
 */
export function rankDests(worker, stations, item, near = worker, claims = []) {
  return rank(worker, stations, item, near, ledger(claims));
}

function rank(worker, stations, item, near, L) {
  const open = stations.filter(s => L.room(s, item) > 0);
  const byDist = (a, b) => d2(a, near) - d2(b, near);
  // `reach` lists the yards a worker delivers to: their own and the ones next door. Without it, anywhere.
  // A machine in the worker's own yard always comes before one in another yard.
  const reach = worker.reach, own = s => (s.area === worker.area ? 0 : 1);
  const machines = open.filter(s => s.machine && (!reach || reach.includes(s.area))).sort((a, b) => (own(a) - own(b)) || byDist(a, b));
  const ownShops = open.filter(s => !s.machine && s.area === worker.area).sort(byDist);
  return [...machines, ...ownShops];
}

/**
 * What colleagues have already committed to. A claim is
 *   { item, from: stationId|null, to: stationId|null, take: n, give: n }
 * `take` items are about to leave `from`; `give` items are about to arrive at `to`.
 * Without this every worker of a yard picks the same job at the same moment, they arrive
 * together, split one pile and walk off half empty.
 */
function ledger(claims) {
  const out = new Map(), into = new Map();
  for (const c of claims) {
    if (c.from != null && c.take > 0) { const k = c.from + '|' + c.item; out.set(k, (out.get(k) || 0) + c.take); }
    if (c.to != null && c.give > 0) { const k = c.to + '|' + c.item; into.set(k, (into.get(k) || 0) + c.give); }
  }
  return {
    avail: (s, item) => Math.max(0, s.provides(item) - (out.get(s.id + '|' + item) || 0)),
    room: (s, item) => Math.max(0, s.accepts(item) - (into.get(s.id + '|' + item) || 0)),
    incoming: (s, item) => into.get(s.id + '|' + item) || 0,
  };
}

// ------------------------------------------------------------------------------------------ roles
// The workers of a yard share its chain (openspec/changes/worker-roles). The first worker hired is the feeder: it keeps
// the yard's machines stocked, and does what every worker does the rest of the time. The second is the hauler, and does
// what every worker does: finished goods first. Without a role (the player's arrow) the rule is the one it always was.
//
// Why not a feeder that only feeds: one trip of 6 logs makes 12 planks, two trips to a shop twice as far away. The first
// yard is short of hauling, not of feeding. A worker that only feeds keeps the saw full and the saw then stands with a full
// output pad; measured, the yard earned 15 to 36% less. Keeping the saw from running dry, and hauling otherwise, removed the
// avoidable starvation (nobody bringing logs to an empty saw) and earned what it earned before.
//
// A full output pad is the yard's real limit, not a fault: when the pad is full and everyone is hauling, the machine
// waits, and nobody is sent to feed because of it. The feeder feeds only when the machine runs short of material.

/**
 * The role of the worker hired `index`-th in a yard (0 the first): 'feeder', 'hauler', or undefined where there is
 * nothing to feed (a yard whose workers carry finished goods only). Follows from the order of hiring alone, so a reloaded
 * game and an old save get the same roles.
 * A third worker (no yard has a plot for one yet) joins the side that is short: feeding while a machine runs short of
 * material, hauling otherwise. `pressure.short` says which; the caller decides it only when that worker has no job.
 * @param jobCfg  the yard's workerJob: { items: [product, materials...] }
 */
export function roleFor(index, jobCfg, pressure = {}) {
  if (!jobCfg || !Array.isArray(jobCfg.items) || jobCfg.items.length < 2) return undefined;
  if (index === 0) return 'feeder';
  if (index === 1) return 'hauler';
  return pressure.short ? 'feeder' : 'hauler';
}

/**
 * The materials the machines of the worker's own yard run short of: less than `worker.stockBelow` held, counting what
 * colleagues are already bringing. Most urgent first: fewest batches' worth, then the machine's first material.
 * A machine view needs `holds(item)`, `batch(item)` and `materials`; one that does not report them is never short.
 * @param items  only these materials (the worker's job); all of a machine's materials when left out
 * @returns [{ item, to: view, have, batches }]
 */
export function stockShort(worker, stations, claims = [], items = null) {
  return short(worker, stations, ledger(claims), items);
}

function short(worker, stations, L, items) {
  const low = worker.stockBelow || 0, out = [];
  if (!(low > 0)) return out;
  for (const s of stations) {
    if (!s.machine || s.area !== worker.area || typeof s.holds !== 'function' || !Array.isArray(s.materials)) continue;
    // A full output pad does not change this: the machine is fed below one carry either way, or it runs dry the moment
    // the pad is cleared. (Measured: leaving a full machine unfed let the saw starve again, by 20 to 80 s in ten minutes.)
    s.materials.forEach((item, order) => {
      if (items && !items.includes(item)) return;
      const have = s.holds(item) + L.incoming(s, item);
      if (have < low && L.room(s, item) > 0) out.push({ item, to: s, have, batches: have / Math.max(1, s.batch?.(item) || 1), order });
    });
  }
  return out.sort((a, b) => (a.batches - b.batches) || (a.order - b.order)).map(({ order, ...rest }) => rest);
}

/**
 * Pick the best (source, dest, item) for a worker.
 * @param {{ area: string, x: number, z: number, carry: { type: string|null, count: number } }} worker
 * @param {Array} stations  station views
 * @param {{ items: string[] }} job  items in priority order
 * @param {Array} claims  what the other workers are already fetching and delivering
 * @returns {{ item: string, from: object|null, to: object|null } | null}
 */
export function chooseJob(worker, stations, job, claims = []) {
  const L = ledger(claims);
  // Already carrying: just find somewhere to deliver.
  if (worker.carry.type) {
    const to = rank(worker, stations, worker.carry.type, worker, L)[0];
    return to ? { item: worker.carry.type, from: null, to } : null;
  }
  // `avoid`: sources this worker just found empty (the player may have emptied them), left alone for a moment so it
  // does not walk straight back. `fetchReach` keeps the player's arrow from pointing across the map; workers fetch from anywhere.
  const avoid = worker.avoid?.length ? new Set(worker.avoid) : null;
  const sourcesOf = (item, not) => stations.filter(s => L.avail(s, item) > 0 && !not.includes(s) && !avoid?.has(s.id) && (!worker.fetchReach || worker.fetchReach.includes(s.area)))
    // Prefer the fullest source (keeps machines from clogging), tie-break by distance.
    .sort((a, b) => (L.avail(b, item) - L.avail(a, item)) || (d2(a, worker) - d2(b, worker)));
  // The feeder first keeps its own yard's machines from running dry, then does what everyone does. Only from close by:
  // its own yard and the ones next door (`reach`). A material made across the map (gold for the Electronics Factory) is
  // the trucks' to bring; a feeder walking there for it left the machines' output unsold for minutes, measured.
  if (worker.role === 'feeder') {
    const near = worker.reach ? s => worker.reach.includes(s.area) : () => true;
    for (const need of short(worker, stations, L, job.items)) {
      const from = sourcesOf(need.item, [need.to]).find(near);
      if (from) return { item: need.item, from, to: need.to };
    }
  }
  for (const item of job.items) {
    const anyDest = rank(worker, stations, item, worker, L);
    if (!anyDest.length) continue;
    const from = sourcesOf(item, anyDest)[0];
    if (!from) continue;
    const to = rank(worker, stations, item, from, L)[0];   // best destination as seen from the pick-up point
    return { item, from, to };
  }
  return null;
}

export function bestDest(worker, stations, item, claims = []) {
  return rank(worker, stations, item, worker, ledger(claims))[0] || null;
}

/**
 * The machine in `areaId` with the most work queued, or null when none has a batch to make.
 * Used to keep the player waiting at a working machine instead of sending them to another yard.
 * A station view exposes its machine as `station.sim` ({ inputs, busy, recipe }).
 */
export function busiestMachine(stations, areaId) {
  let best = null, bestQueued = 0;
  for (const v of stations) {
    const sim = v.station?.sim;
    if (v.area !== areaId || !sim) continue;
    const queued = sim.inputs + (sim.busy ? sim.recipe.inCount : 0);
    const second = !sim.recipe.input2 || sim.busy || sim.inputs2 >= sim.recipe.inCount2;   // a two-material machine needs both
    if (second && queued >= sim.recipe.inCount && queued > bestQueued) { best = v; bestQueued = queued; }
  }
  return best;
}

/**
 * Where the player should take what they carry. Same "deliver first" order as the workers, with
 * one extra: when nothing has room, the player may still unload on a full machine (workers may
 * not), so the nearest station that uses the item is returned rather than nothing.
 * Views need `wants(item)`: true if the station ever takes the item, full or not.
 */
export function playerDest(player, stations, item) {
  const ranked = rankDests(player, stations, item);
  if (ranked.length) return ranked[0];
  const score = s => Math.sqrt(d2(s, player)) + (s.area === player.area ? 0 : 1000);
  return stations.filter(s => s.wants?.(item)).sort((a, b) => score(a) - score(b))[0] || null;
}

/**
 * The claim a worker holds while on a job. `phase` is 'from' while still fetching and 'to' while
 * delivering; `carried` is what is in their hands, `capacity` what they can hold.
 */
export function claimOf(job, phase, carried, capacity) {
  const fetching = phase === 'from';
  return {
    item: job.item,
    from: fetching && job.from ? job.from.id : null,
    to: job.to ? job.to.id : null,
    take: fetching ? Math.max(0, capacity - carried) : 0,
    give: fetching ? capacity : carried,
  };
}
