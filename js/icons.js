// Line icons for the Headquarters screen, drawn as SVG so they look the same on every device.
// One style throughout: a 24 by 24 grid, 1.75 stroke, round ends, no fill, the colour of the text.
// Built with createElementNS from the shapes below; nothing here is parsed as HTML.

const NS = 'http://www.w3.org/2000/svg';
const p = d => ['path', { d }];
const c = (cx, cy, r) => ['circle', { cx, cy, r }];
const r = (x, y, width, height, rx = 1.5) => ['rect', { x, y, width, height, rx }];

const SHAPES = {
  // the Headquarters tabs, by tab id
  overview: [r(3.5, 3.5, 7, 7), r(13.5, 3.5, 7, 7), r(3.5, 13.5, 7, 7), r(13.5, 13.5, 7, 7)],
  goals: [c(12, 12, 8.5), c(12, 12, 4.5), c(12, 12, 0.6)],
  businesses: [p('M3.5 20.5V10l5.5 3.5V10l5.5 3.5V4.5h4v16z'), p('M2.5 20.5h19')],
  team: [c(9, 8, 3.5), p('M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6'), c(17.5, 9, 2.5), p('M17.2 14.2c2.5.4 4.3 2.4 4.3 5.3')],
  contracts: [r(5, 4.5, 14, 16.5, 2), p('M9 4.5V3h6v1.5'), p('M9 10.5h6M9 14.5h6')],
  research: [p('M9 3h6'), p('M10 3v6l-5.2 9a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 9V3'), p('M7.6 15h8.8')],
  logistics: [r(2.5, 7, 11, 9.5, 1), p('M13.5 10h3.8l4.2 4v2.5h-8z'), c(6.5, 18.2, 2), c(17, 18.2, 2)],
  finance: [p('M3.5 3.5v17h17'), p('M7 15l4-4 3 2.5 6-6.5')],
  market: [r(4.5, 11, 3.5, 6, 1), p('M6.25 8.5V11M6.25 17v2.5'), r(10.25, 5.5, 3.5, 7.5, 1), p('M12 3v2.5M12 13v3'), r(16, 9.5, 3.5, 6.5, 1), p('M17.75 7v2.5M17.75 16v3')],   // three price candles
  expansion: [p('M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z'), c(12, 10, 2.3)],
  ranking: [p('M8 4h8v5a4 4 0 0 1-8 0z'), p('M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4'), p('M12 13v4M8.5 20.5h7M9.5 17h5')],
  // what is counted, in goals and milestones
  coin: [c(12, 12, 8.5), p('M14.6 9.4c-.5-.8-1.4-1.3-2.6-1.3-1.5 0-2.6.8-2.6 1.9 0 2.7 5.4 1.3 5.4 4 0 1.1-1.1 1.9-2.8 1.9-1.2 0-2.2-.5-2.7-1.3'), p('M12 6.2v1.9M12 15.9v1.9')],
  store: [p('M4 9.5l1.5-5h13l1.5 5'), p('M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0'), p('M5.5 12.6V20h13v-7.4'), p('M10 20v-4.5h4V20')],
  upgrade: [c(12, 12, 8.5), p('M12 16V8.5M8.5 11.7L12 8.2l3.5 3.5')],
  award: [c(12, 9, 5.5), p('M8.6 13.4L7 21l5-2.6 5 2.6-1.6-7.6')],
  star: [p('M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z')],
  check: [p('M5 12.5l4.5 4.5L19 7.5')],
  gem: [p('M12 3.5l8 5.4-3.2 11H7.2L4 8.9z'), p('M4 8.9h16'), p('M12 3.5L9 8.9l3 11 3-11z')],   // credits, and what they buy
  dot: [c(12, 12, 1.6)],
  // what to do next, on the card at the bottom of the yard
  collect: [p('M12 4v10M8 10l4 4 4-4'), p('M5 16v3.5h14V16')],
  deliver: [p('M4 12h14M13 7l5 5-5 5')],
  // others
  more: [c(5.5, 12, 1.3), c(12, 12, 1.3), c(18.5, 12, 1.3)],
  close: [p('M6 6l12 12M18 6L6 18')],
  lock: [r(5, 11, 14, 9.5, 2), p('M8 11V8a4 4 0 0 1 8 0v3')],
  up: [p('M12 19V5M6 11l6-6 6 6')],
  down: [p('M12 5v14M6 13l6 6 6-6')],
  flat: [p('M5 12h14')],
  // the yard's top bar: the log, hiding the interface, and whether the game is saved
  bell: [p('M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z'), p('M10 20.5a2.2 2.2 0 0 0 4 0')],
  eye: [p('M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z'), c(12, 12, 2.8)],
  cloud: [p('M7.5 18.5a4.5 4.5 0 0 1-.7-8.95 5.5 5.5 0 0 1 10.6-1.2 4.6 4.6 0 0 1-.4 10.15z')],
  offline: [p('M7.5 18.5a4.5 4.5 0 0 1-.7-8.95 5.5 5.5 0 0 1 10.6-1.2 4.6 4.6 0 0 1-.4 10.15z'), p('M4 4l16 16')],
  // records, the Advisor and what they show
  records: [r(4, 13.5, 5, 7, 1), r(9.5, 7.5, 5, 13, 1), r(15, 11, 5, 9.5, 1)],   // a podium
  construction: [p('M3 20.5h18'), p('M5 20.5V10.5l5-4 5 4v10'), p('M8.5 20.5v-4.5h3v4.5'), p('M15 13.5h4v7'), p('M17 16.5h.01')],   // a house with a block going up beside it
  advisor: [p('M9.5 17.5v-1.6a6 6 0 1 1 5 0v1.6z'), p('M10 20.5h4')],   // a light bulb
  clock: [c(12, 12, 8.5), p('M12 7.5V12l3 2')],
  streak: [r(4, 5.5, 16, 15, 2), p('M4 10h16M8.5 3.5v4M15.5 3.5v4'), p('M9 14.5l2 2 4-4')],   // a day ticked off on the calendar
  swap: [p('M4 8.5h13M14 5.5l3 3-3 3'), p('M20 15.5H7M10 12.5l-3 3 3 3')],
  edit: [p('M4.5 19.5l1-4L16 5l3 3L8.5 18.5z'), p('M14 7l3 3')],
  restore: [p('M12 14V4M8 8l4-4 4 4'), p('M5 16v3.5h14V16')],   // the opposite of collect: back out of the box
};

/** The icon for what an upgrade does, by the type of its effect. */
export const EFFECT_ICON = { worker: 'team', station: 'businesses', area: 'expansion', speed: 'upgrade', capacity: 'store', price: 'coin' };

/** An SVG element for one of the icons above; an unknown name gives an empty icon of the same size. */
export function icon(name, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', ('icon ' + cls).trim());
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of SHAPES[name] || []) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}
export const ICON_NAMES = Object.keys(SHAPES);
