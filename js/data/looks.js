// What makes one yard look different from the next: the ground it stands on, the fence around it, what
// its workers wear, the colours of its shop, the belt of its machines and what stands along its fences. Looks only: nothing here is
// read by the rules. Every yard has an entry of its own; one that is missing falls back to its location.

/** Ground kinds are drawn in js/textures.js (`ground`); `scale` is how many metres one tile of the picture covers. */
export const GROUNDS = {
  soil: { scale: 9 }, chips: { scale: 8 }, furrows: { scale: 7 }, gravel: { scale: 6 }, cobble: { scale: 5 }, flags: { scale: 6 },
  sand: { scale: 9 }, rock: { scale: 9 }, tile: { scale: 4 }, asphalt: { scale: 8 }, concrete: { scale: 7 },
};
/** Fence kinds are built in js/area.js. */
export const FENCES = ['rail', 'picket', 'stone', 'brick', 'iron', 'mesh', 'glass'];
/** Hats are built in js/characters.js. */
export const HATS = ['hard', 'straw', 'chef', 'miner', 'cap'];

/**
 * What a trade wears. shirt: a few shades, so that two workers of one yard are not copies; apron and
 * vest are optional; helmet is the colour of the hat.
 */
export const OUTFITS = {
  lumber:    { hat: 'hard',  helmet: 0xffd23f, shirt: [0xc8452f, 0xb53b3b, 0xd2603a], pants: 0x3f4a66, vest: null },                  // checked red, no vest
  carpenter: { hat: 'cap',   helmet: 0x6b4a2b, shirt: [0xe8dcc0, 0xd9cdb0, 0xf0e6d0], pants: 0x5a4632, apron: 0x8b5a2b, vest: null },
  quarry:    { hat: 'miner', helmet: 0xf2f2f2, shirt: [0x8d959e, 0x7c8590, 0x9aa3ad], pants: 0x4a4f57, vest: 0xff8a1f },
  farmer:    { hat: 'straw', helmet: 0xe3c765, shirt: [0x5a8fd6, 0x4f7fc4, 0x6fa3e0], pants: 0x3f5a8f, vest: null },                  // blue overalls
  baker:     { hat: 'chef',  helmet: 0xffffff, shirt: [0xffffff, 0xf4f1ea, 0xf9f6f0], pants: 0x9aa3ad, apron: 0xf4f1ea, vest: null },
  glazier:   { hat: 'cap',   helmet: 0x2f7fd6, shirt: [0x58b6d9, 0x4aa6cc, 0x6cc4e3], pants: 0x3d4652, apron: 0x3d4652, vest: null },
  miner:     { hat: 'miner', helmet: 0xffd23f, shirt: [0x6f5a4f, 0x7a6558, 0x5f4d44], pants: 0x3b3430, vest: 0xff8a1f },
  smith:     { hat: 'cap',   helmet: 0x2b2f36, shirt: [0x4a4f57, 0x565c66, 0x3f444c], pants: 0x2b2f36, apron: 0x6b4226, vest: null },
  rigger:    { hat: 'hard',  helmet: 0xe0452f, shirt: [0x2f6fd6, 0x2a62bd, 0x3a7ce0], pants: 0x2b3a55, vest: 0xffd23f },
  jeweller:  { hat: 'cap',   helmet: 0x8e5bd6, shirt: [0xefe6f7, 0xe3d6f0, 0xf6effb], pants: 0x4a3f66, apron: 0x4a3f66, vest: null },
  plant:     { hat: 'hard',  helmet: 0xf2f2f2, shirt: [0xff8a1f, 0xf07a14, 0xff9a3a], pants: 0x3d4652, vest: 0xd7ff3f },               // high-visibility
  lab:       { hat: 'cap',   helmet: 0xf2f2f2, shirt: [0xf2f5f8, 0xe6ecf2, 0xffffff], pants: 0x9fb0c2, vest: null },
  assembly:  { hat: 'cap',   helmet: 0x1f6f94, shirt: [0x2f8f83, 0x2a8076, 0x38a094], pants: 0x23404a, vest: null },
  clerk:     { hat: 'cap',   helmet: 0x8e2f3a, shirt: [0xf4ecd8, 0xe9dfc6, 0xfbf5e6], pants: 0x2b2f36, apron: 0x8e2f3a, vest: null },
};

/** The paint of a shop: counter, counter top, sign board and the stripe on it. */
const SHOP = {
  red:    { counter: 0xd63a2f, top: 0xb52d24, board: 0xffd23f, stripe: 0xff8a1f },
  green:  { counter: 0x3a8f55, top: 0x2f7545, board: 0xf4ecd8, stripe: 0x2f7545 },
  blue:   { counter: 0x2f7fd6, top: 0x2566b0, board: 0xf2f5f8, stripe: 0x2566b0 },
  cream:  { counter: 0xe9dcc0, top: 0xb5803f, board: 0x8b4a24, stripe: 0xe9dcc0 },
  slate:  { counter: 0x4a4f57, top: 0x2b2f36, board: 0xffd23f, stripe: 0x2b2f36 },
  violet: { counter: 0x7a52c7, top: 0x5a3a9c, board: 0xefe6f7, stripe: 0x5a3a9c },
  teal:   { counter: 0x2f8f83, top: 0x23706a, board: 0xf2f5f8, stripe: 0x23706a },
  wine:   { counter: 0x8e2f3a, top: 0x6f2430, board: 0xf4ecd8, stripe: 0xd9b25a },
};

/** The conveyor of a machine: its frame, the surface of the belt and the chevrons on it. */
const BELT = {
  town:       { frame: 0x3aa7d8, surface: '#1e6f94', chevron: 'rgba(255,255,255,0.22)' },
  city:       { frame: 0x4a4f57, surface: '#23272e', chevron: 'rgba(255,200,40,0.55)' },
  metropolis: { frame: 0x2f8f83, surface: '#1c4f4a', chevron: 'rgba(255,255,255,0.3)' },
};

const BY_LOCATION = {
  town:       { ground: 'soil', fence: 'rail', outfit: 'lumber', shop: 'red' },
  city:       { ground: 'asphalt', fence: 'mesh', outfit: 'plant', shop: 'slate' },
  metropolis: { ground: 'concrete', fence: 'glass', outfit: 'assembly', shop: 'teal' },
};

const BY_YARD = {
  sawmill:     { ground: 'chips',    fence: 'rail',   outfit: 'lumber',    shop: 'red' },
  carpentry:   { ground: 'flags',    fence: 'rail',   outfit: 'carpenter', shop: 'cream' },
  quarry:      { ground: 'gravel',   fence: 'stone',  outfit: 'quarry',    shop: 'slate' },
  farm:        { ground: 'furrows',  fence: 'picket', outfit: 'farmer',    shop: 'green' },
  bakery:      { ground: 'cobble',   fence: 'brick',  outfit: 'baker',     shop: 'cream' },
  glassworks:  { ground: 'sand',     fence: 'rail',   outfit: 'glazier',   shop: 'blue' },
  ironmine:    { ground: 'rock',     fence: 'stone',  outfit: 'miner',     shop: 'slate' },
  forge:       { ground: 'flags',    fence: 'iron',   outfit: 'smith',     shop: 'slate' },
  oilfield:    { ground: 'sand',     fence: 'mesh',   outfit: 'rigger',    shop: 'red' },
  goldmine:    { ground: 'rock',     fence: 'stone',  outfit: 'miner',     shop: 'cream' },
  jewelry:     { ground: 'tile',     fence: 'iron',   outfit: 'jeweller',  shop: 'violet' },
  gemmine:     { ground: 'gravel',   fence: 'stone',  outfit: 'miner',     shop: 'violet' },
  powerplant:  { ground: 'asphalt',  fence: 'mesh',   outfit: 'plant',     shop: 'slate' },
  steelworks:  { ground: 'flags',    fence: 'mesh',   outfit: 'smith',     shop: 'red' },
  chemical:    { ground: 'concrete', fence: 'mesh',   outfit: 'lab',       shop: 'blue' },
  electronics: { ground: 'tile',     fence: 'mesh',   outfit: 'lab',       shop: 'teal' },
  engineplant: { ground: 'concrete', fence: 'glass',  outfit: 'assembly',  shop: 'teal' },
  autofactory: { ground: 'asphalt',  fence: 'glass',  outfit: 'assembly',  shop: 'blue' },
  robotics:    { ground: 'tile',     fence: 'glass',  outfit: 'lab',       shop: 'teal' },
  store:       { ground: 'flags',    fence: 'glass',  outfit: 'clerk',     shop: 'wine' },
};

/**
 * What dresses a yard: the things along its fences and the marks on its floor. Looks only. The things are sized and
 * placed in js/sim/dressing.js and drawn in js/gfx/props.js, under the names used here.
 *   hero    the big pieces that say what the yard is: each is built once, at the back of the yard, if it fits
 *   trade   the things of its trade: each stands at least once where there is room, some twice
 *   filler  small things for the room that is left
 *   verge   what grows or lies at the foot of the fence (the town only)
 *   floor   how the gates and the floor are marked: 'boards', 'slabs', 'paint' (factory lines) or 'plaza'
 *   line    the colour of the painted lines of 'paint' and 'plaza'
 *   tints   colours for a thing that comes in several, when the yard has its own: { kind: [colours] }
 */
const GRASS = ['tuft', 'tuft', 'flower', 'tuft'], STONES = ['pebble', 'pebble', 'tuft'];
const DRESS_BY_LOCATION = {
  town:       { hero: [], trade: ['crates', 'barrels', 'sacks'], filler: ['crate', 'barrel', 'stump'], verge: GRASS, floor: 'boards' },
  city:       { hero: [], trade: ['pallet', 'barrels', 'floodlight', 'bollards', 'hazardsign'], filler: ['crate', 'cones', 'barrel'], floor: 'paint', line: 0xf2b630 },
  metropolis: { hero: [], trade: ['planter', 'bollardlights', 'planttree', 'bench'], filler: ['pallet', 'litterbin', 'planter'], floor: 'plaza', line: 0x2f8f83 },
};
const DRESS = {
  sawmill:     { hero: ['timbershed'], trade: ['logdeck', 'sawhorse', 'plankstack', 'pennant', 'firewood', 'stumpaxe'], filler: ['stump', 'crates', 'barrel', 'toolrack', 'lantern'], verge: GRASS, floor: 'boards' },
  carpentry:   { hero: ['toolshed'], trade: ['workbench', 'timberrack', 'chairframes', 'plankstack', 'sawhorse'], filler: ['crates', 'barrel', 'stump', 'toolrack'], verge: GRASS, floor: 'boards' },
  quarry:      { hero: ['hoist'], trade: ['stoneblocks', 'wheelbarrow', 'lantern', 'brickpallet', 'toolrack', 'rocks'], filler: ['rocks', 'crate', 'barrel', 'stoneblocks'], verge: STONES, floor: 'slabs' },
  farm:        { hero: ['windpump'], trade: ['haybales', 'scarecrow', 'trough', 'lantern', 'vegcrates', 'churns', 'wheelbarrow'], filler: ['sacks', 'barrel', 'haybales', 'crate'], verge: ['tuft', 'flower', 'flower'], floor: 'boards' },
  bakery:      { hero: ['breadcart'], trade: ['cafetable', 'breadcrates', 'lantern', 'flowerbox', 'sacks', 'firewood', 'churns'], filler: ['barrel', 'crates', 'flowerbox', 'sacks'], verge: ['flower', 'tuft'], floor: 'slabs' },
  glassworks:  { hero: ['sandsilo'], trade: ['glassrack', 'sandheap', 'lantern', 'carboys', 'wheelbarrow', 'crates'], filler: ['barrel', 'crate', 'sandheap', 'carboys'], verge: ['tuft', 'pebble'], floor: 'boards' },
  ironmine:    { hero: ['minecart'], trade: ['pitprops', 'oreheap', 'lantern', 'toolrack', 'barrels'], filler: ['rocks', 'crate', 'lantern', 'pitprops'], verge: STONES, floor: 'slabs' },
  forge:       { hero: ['hearth'], trade: ['anvil', 'coalbin', 'barrack', 'quenchtub', 'toolrack'], filler: ['barrel', 'crates', 'anvil', 'coalbin'], verge: ['pebble'], floor: 'slabs' },
  oilfield:    { hero: ['bullettank'], trade: ['pipestack', 'valvetree', 'drumrack', 'windsock', 'floodlight', 'hazardsign'], filler: ['barrels', 'barrel', 'cones', 'pipestack'], verge: ['pebble', 'tuft'], floor: 'slabs',
                 tints: { barrel: [0x2e3238, 0xe0452f, 0x2e3238], barrels: [0x2e3238, 0xe0452f], drumrack: [0xe0452f, 0x2e3238] } },
  goldmine:    { hero: ['sluice'], trade: ['minecart', 'strongboxes', 'goldpans', 'lantern', 'pitprops'], filler: ['rocks', 'sacks', 'barrel', 'strongboxes'], verge: STONES, floor: 'slabs',
                 tints: { minecart: [0xd9b23c], oreheap: [0xd9b23c] } },
  jewelry:     { hero: ['gempost'], trade: ['displaycase', 'velvetrope', 'safe', 'topiary', 'bench', 'lampglobe'], filler: ['topiary', 'flowerbox', 'litterbin', 'displaycase'], verge: ['flower'], floor: 'slabs' },
  gemmine:     { hero: ['crystals'], trade: ['minecart', 'lantern', 'oreheap', 'crystals', 'crates'], filler: ['rocks', 'barrel', 'lantern', 'rocks'], verge: STONES, floor: 'slabs',
                 tints: { minecart: [0xb9a6ff], oreheap: [0x8f7fd6] } },
  powerplant:  { hero: ['transformer'], trade: ['switchgear', 'cabledrums', 'cellrack', 'pylon', 'floodlight', 'hazardsign', 'bollards'], filler: ['barrels', 'cones', 'pallet', 'cabledrums'], floor: 'paint', line: 0xf2b630,
                 tints: { barrels: [0xd94a36, 0xe0a52f] } },
  steelworks:  { hero: ['gantry', 'ventshed'], trade: ['coils', 'beams', 'slagbin', 'gascyl', 'floodlight', 'bollards'], filler: ['pallet', 'barrel', 'cones', 'beams'], floor: 'paint', line: 0xf2b630 },
  chemical:    { hero: ['tankfarm', 'piperack'], trade: ['totes', 'drumpallet', 'shower', 'windsock', 'floodlight', 'hazardsign'], filler: ['barrels', 'cones', 'bollards', 'totes'], floor: 'paint', line: 0xf2b630,
                 tints: { barrels: [0x3f7fc4, 0x4c9a5a] } },
  electronics: { hero: ['dishmast'], trade: ['servers', 'solar', 'acunit', 'partsbins', 'floodlight', 'handtruck', 'pallet'], filler: ['pallet', 'crate', 'bollards', 'cones'], floor: 'paint', line: 0xf2b630,
                 tints: { pallet: [0x3f7fc4, 0x8fa9c2, 0x2f6fd6], crate: [0x3f7fc4, 0x8fa9c2] } },
  engineplant: { hero: ['neongear'], trade: ['forklift', 'enginestand', 'toolchest', 'planter', 'bollardlights', 'planttree'], filler: ['pallet', 'planter', 'cones', 'litterbin'], floor: 'plaza', line: 0x2f8f83 },
  autofactory: { hero: ['neoncar'], trade: ['carbody', 'tyres', 'panelrack', 'chargepost', 'planter', 'cones'], filler: ['tyres', 'planter', 'bollardlights', 'planttree'], floor: 'plaza', line: 0x2f7fd6 },
  robotics:    { hero: ['neonbot'], trade: ['chargedock', 'dronepad', 'armcrate', 'servers', 'planter', 'bollardlights'], filler: ['planter', 'planttree', 'partsbins', 'litterbin'], floor: 'plaza', line: 0x25b8c9 },
  store:       { hero: ['kiosk'], trade: ['showcase', 'giftstack', 'bunting', 'bench', 'balloons', 'planttree', 'lampglobe'], filler: ['planter', 'litterbin', 'bench', 'giftstack', 'flowerbox'], floor: 'plaza', line: 0xc9a24a },
};

/**
 * The look of a yard.
 * @param area  { id, location }
 * @returns {{ ground: string, scale: number, fence: string, outfit: object, shop: object, belt: object, dress: object }}
 */
export function lookOf(area) {
  const location = BY_LOCATION[area?.location] ? area.location : 'town';
  const pick = BY_YARD[area?.id] || BY_LOCATION[location];
  return {
    ground: pick.ground, scale: GROUNDS[pick.ground].scale, fence: pick.fence,
    outfit: OUTFITS[pick.outfit], outfitName: pick.outfit, shop: SHOP[pick.shop], shopName: pick.shop, belt: BELT[location],
    dress: DRESS[area?.id] || DRESS_BY_LOCATION[location],
  };
}

/** What worker number `n` of a yard wears: the trade's outfit, in one of its shades. */
export function outfitFor(area, n = 0) {
  const o = lookOf(area).outfit;
  return { hat: o.hat, helmet: o.helmet, shirt: o.shirt[n % o.shirt.length], pants: o.pants, vest: o.vest ?? null, apron: o.apron ?? null };
}
