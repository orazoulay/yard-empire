// What makes one yard look different from the next: the ground it stands on, the fence around it, what
// its workers wear, the colours of its shop and the belt of its machines. Looks only: nothing here is
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
 * The look of a yard.
 * @param area  { id, location }
 * @returns {{ ground: string, scale: number, fence: string, outfit: object, shop: object, belt: object }}
 */
export function lookOf(area) {
  const location = BY_LOCATION[area?.location] ? area.location : 'town';
  const pick = BY_YARD[area?.id] || BY_LOCATION[location];
  return {
    ground: pick.ground, scale: GROUNDS[pick.ground].scale, fence: pick.fence,
    outfit: OUTFITS[pick.outfit], outfitName: pick.outfit, shop: SHOP[pick.shop], shopName: pick.shop, belt: BELT[location],
  };
}

/** What worker number `n` of a yard wears: the trade's outfit, in one of its shades. */
export function outfitFor(area, n = 0) {
  const o = lookOf(area).outfit;
  return { hat: o.hat, helmet: o.helmet, shirt: o.shirt[n % o.shirt.length], pants: o.pants, vest: o.vest ?? null, apron: o.apron ?? null };
}
