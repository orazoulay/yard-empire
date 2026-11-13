// The building site: what a company that has opened every yard builds next. Data only; the rules are in
// js/sim/company.js (the part headed "the building site") and tests/construction.test.mjs.
//
// A build goes up in stages. Each stage needs goods, and takes them where goods are sold: at the shops.
// So a build may only ask for goods that reach a shop. In a finished company planks, iron bars, steel,
// plastic, circuits and engines never do: the next factory or a truck takes every one. Bricks, chairs, bread,
// cars and gift sets always do, because no machine uses them; of glass, tools, power cells, gems and rings a
// surplus does (SITE.surplus, measured with the simulator's 20-yard company). tests/construction.test.mjs fails
// for a build that asks for any other good.
//
// minutes: finishing pays this many minutes of the company's reference income (Company.goalRef, the figure
// the daily goals are priced with), and never less than SITE.floor times what the goods given sell for.
// done: what the card says when the stage is finished.
// shape: how it is drawn (js/sim/site.js works out the blocks, js/site.js draws them). at: where the middle of the
// building stands on the plot, from the plot's north-west corner; floor: the height of one floor; adds: what a
// finished stage adds to the picture, so the building grows with the stages.

export const SITE = {
  yards: 20,     // the site opens when this many yards are open: all of them
  floor: 1.5,    // a build pays at least this many times the normal price of the goods it was given
  none: 0.5,     // fewer than this many of a good a minute at the shops counts as "none reaches the shops"
  // Goods a machine uses, of which more is made than the machines and trucks take: a surplus reaches the shops.
  // Measured a minute in the simulator's finished company: power cells 88, glass 43, tools 43, gems 41, rings 37.
  surplus: ['glass', 'tool', 'cell', 'gem', 'ring'],
  // The plot, east of the Department Store. The camera looks north, so ground south of a yard is behind it.
  plot: { minX: 92, maxX: 116, minZ: 99, maxZ: 123 },
};

export const BUILDS = [
  { id: 'house', name: 'Family House', minutes: 20, xp: 1500,
    pitch: 'A brick house with a garden: the first home of the new quarter.',
    shape: { at: [5.5, 17], width: 7, depth: 6, floors: 2, floor: 1.3, roof: 'pitched', wall: 0xf0e2c4, roofColor: 0xb5533c },
    stages: [
      { name: 'Foundation', done: 'The foundation is laid', needs: [['brick', 600]], adds: ['slab'] },
      { name: 'Walls and windows', done: 'The walls are up', needs: [['brick', 900], ['glass', 250]], adds: ['walls', 'windows'] },
      { name: 'Fittings and furniture', done: 'The house is furnished', needs: [['tool', 200], ['chair', 300]], adds: ['roof', 'door', 'garden', 'lights'] },
    ] },
  { id: 'block', name: 'Apartment Block', minutes: 60, xp: 4000,
    pitch: 'Five floors of flats, with power, furniture and a car park.',
    shape: { at: [17, 15], width: 9, depth: 7, floors: 5, floor: 1.15, roof: 'flat', wall: 0xd9c7a8, roofColor: 0x6b7078 },
    stages: [
      { name: 'Foundation', done: 'The foundation is laid', needs: [['brick', 2500], ['cell', 400]], adds: ['slab'] },
      { name: 'Walls and windows', done: 'The walls are up', needs: [['brick', 4000], ['glass', 1200]], adds: ['walls', 'windows'] },
      { name: 'Flats', done: 'The flats are fitted out', needs: [['chair', 1500], ['tool', 800]], adds: ['lights', 'balconies'] },
      { name: 'Moving in', done: 'The first families moved in', needs: [['bread', 1000], ['car', 60]], adds: ['roof', 'door', 'parking'] },
    ] },
  { id: 'tower', name: 'Office Tower', minutes: 180, xp: 10000,
    pitch: 'Twelve floors behind a glass front, and the tallest thing your company has made.',
    shape: { at: [12, 5.5], width: 8, depth: 8, floors: 12, floor: 0.95, roof: 'crown', wall: 0x3f4b57, roofColor: 0x2f3944 },
    stages: [
      { name: 'Foundation', done: 'The foundation is laid', needs: [['brick', 6000], ['cell', 1500]], adds: ['slab'] },
      { name: 'Glass front', done: 'The glass front is in', needs: [['brick', 3000], ['glass', 5000]], adds: ['walls', 'glass'] },
      { name: 'Offices', done: 'The offices are fitted out', needs: [['chair', 4000], ['tool', 2500]], adds: ['lights'] },
      { name: 'Lobby', done: 'The lobby shines', needs: [['ring', 600], ['gem', 400]], adds: ['lobby'] },
      { name: 'Opening day', done: 'The tower is open', needs: [['car', 300], ['giftset', 200]], adds: ['roof', 'antenna', 'plaza'] },
    ] },
];
