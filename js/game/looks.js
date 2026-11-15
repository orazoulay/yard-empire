// The looks of the credits store in the running game: which choice of each look is in force (js/credits.js says: the
// server's word on what is owned, the player's pick on this device), and where in the world it goes.
//
// A look changes nothing a company earns. Nothing here reads or writes the rules (js/sim/), the economy or a save: it
// hands ids and colours to the things that are drawn and heard, each of which does nothing when it already is as asked.
// So applyLooks() (js/game/company-chores.js, which ends by calling applyStoreLooks() here) may run as often as the
// server's answer changes, and it runs again when a yard is opened.
//
// What is owned arrives after the page has loaded, and in a visit without a connection it never does. Until then
// every look is the game's own, and so it is again when the answer is gone (a player who signs out): credits.chosen()
// answers null for a look that is not owned in this visit, and null is the game's own look everywhere below.

/** The bursts of the Sale effects, in the particles the game already has (js/particles.js): what flies, and how. */
const PARTY = [0xffd23f, 0xff8a1f, 0x39c553, 0x4fc3f7, 0xff5a52, 0xffffff];
const SPARKS = { count: 4, color: 0xffe066, speed: 1.8, up: 4, life: 0.5, size: 0.11 };
export const SALE_FX = ['confetti', 'fireworks', 'coins'];
// A stack sold good by good is one show, not ten on top of each other: a show comes with a good only when the seller's
// good before it, at that counter, was sold longer ago than this (in milliseconds). Goods are dropped 70 ms apart.
const BURST_GAP = 220;

/** The looks of the Game. */
export class LooksMethods {
  /** The company's emblem as it is in force: { id, colour }, or null while there is none to show. */
  emblemNow() {
    const e = this.credits.chosen('emblem');
    return e ? { id: e.id, colour: this.credits.chosen('emblem', 'colour')?.colour ?? 0x2f6fd6 } : null;
  }

  /**
   * The looks of the store's fifth part, as the server and the player's picks have them: put on, or taken off. Called
   * when the server's answer changes (it arrives after the game has started), when a pick is made, and when a yard opens.
   */
  applyStoreLooks() {
    const c = this.credits, id = kind => c.chosen(kind)?.id || '';
    // the player's hat and body: the figure is built again only when one of them changed
    this.player.restyle({ hat: id('hat') || 'hard', body: id('body') });
    this.pet.choose(id('pets'));   // a pet of More pets comes in place of the Yard Dog
    // the emblem: one picture for the flags and the trucks, and the same shape in the Headquarters' header
    const emblem = this.emblemNow();
    if (emblem) this.paintEmblem(emblem.id, emblem.colour);
    this.hq.showEmblem(emblem);
    this.trucks.setLook(c.chosen('truck_paint')?.paint ?? null, !!emblem);
    // every yard: uniforms, skins, the floor, the shop, the decoration and the flag
    const yard = { uniform: c.chosen('uniform'), skin: id('skin'), floor: id('floor'), shop: id('shop'), decor: id('decor'), emblem: !!emblem };
    for (const a of this.areas) a.setLooks(yard);
    this.sky.setMode(id('sky'));
    this.sfx.setTune(id('music'));
    this.saleFx = id('sale_fx');
  }

  /**
   * What flies up when goods are sold at a shop in sight: the game's own few sparks, or the Sale effect that is
   * chosen. All of it is drawn with the particles the game keeps (a fixed number, used again and again): an effect
   * makes nothing and frees nothing, and the graphics level thins it as it thins every burst. A player who asked for
   * less motion gets the sparks. Only looked at: the sale was made before this is called.
   * @param at    where the seller stands
   * @param till  where the shop's till stands, in the world (one for each shop: the workers' sales are told apart by it)
   * @param mine  true when the player sold; a worker's sale is a smaller show
   */
  saleBurst(at, till, mine) {
    const p = this.particles, fx = this.calm ? '' : this.saleFx, now = performance.now();
    // when the seller's good before this one was sold: the player's anywhere, the workers' at this counter
    const shops = this.shopBurstAt ||= new WeakMap(), last = mine ? this.burstAt || 0 : shops.get(till) || 0;
    if (mine) this.burstAt = now; else shops.set(till, now);
    if (!fx || !SALE_FX.includes(fx) || now - last < BURST_GAP) {   // the game's own, and the goods of a stack after its first
      p.emit({ x: at.x, y: 1.6, z: at.z + 1.2 }, { ...SPARKS, count: mine ? 4 : 2 });
      return;
    }
    const k = mine ? 1 : 0.4;
    if (fx === 'confetti') {   // paper in six colours, thrown up over the counter
      for (const color of PARTY) p.emit({ x: till.x - 1.2, y: 2.4, z: till.z - 0.2 }, { count: Math.round(4 * k), color, speed: 4.4, up: 8.5, life: 1.25, size: 0.24, gravity: 8, spread: 2.2 });
    } else if (fx === 'fireworks') {   // a rocket from the counter, and a burst of one colour high over the shop
      const color = PARTY[Math.floor(Math.random() * 5)], high = { x: till.x - 1.2 + (Math.random() - 0.5) * 3.6, y: 5.6 + Math.random() * 1.6, z: till.z - 1 };
      p.emit({ x: high.x, y: 2.4, z: high.z }, { count: Math.round(4 * k), color: 0xffffff, speed: 0.3, up: 10, life: 0.4, size: 0.14, gravity: 8, spread: 0.1 });
      p.emit(high, { count: Math.round(22 * k), color, speed: 6.5, up: 2.4, life: 1.0, size: 0.22, gravity: 4, spread: 0.3 });
      p.emit(high, { count: Math.round(8 * k), color: 0xffffff, speed: 3.6, up: 1.6, life: 0.8, size: 0.14, gravity: 4, spread: 0.3 });
    } else {   // a fountain of coins out of the till
      p.emit({ x: till.x, y: 2.3, z: till.z }, { count: Math.round(14 * k), color: 0xffd23f, speed: 2.2, up: 9.5, life: 1.15, size: 0.26, gravity: 13, spread: 0.3 });
      p.emit({ x: till.x, y: 2.3, z: till.z }, { count: Math.round(5 * k), color: 0xfff1a8, speed: 1.6, up: 11, life: 1.15, size: 0.18, gravity: 13, spread: 0.25 });
    }
  }
}
