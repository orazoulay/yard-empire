// The life of the yard that is only there to be looked at, run once a frame: workers who step around
// each other, customers at the shops, splashes of rain, fireflies after dark, smoke over the city,
// and thunder. It also passes the graphics level on to everything that draws less on "low".
// Nothing here changes what is made, sold or earned.
import { CITY_STACKS } from './world.js';
import { Fireflies } from './scenery.js';
import { Customers } from './customers.js';
import { pushApart } from './sim/yard.js';
import { TUNING } from './data/tuning.js';

const PERSON = 0.95;    // people closer together than this step apart
const SHOVE = 0.35;     // the most a worker is pushed in a frame, as a share of a walking step: never enough to hold one back
const SPLASH = { count: 2, color: 0xd6e8ff, speed: 0.9, up: 1.5, life: 0.22, size: 0.055, gravity: 10, spread: 0.1 };
const SPLASHES = 46;    // splashes a second around the camera in full rain
const CITY_SMOKE = { size: 1.1, life: 4.5, rise: 2.2, color: 0xcfd3d6 };
const inRect = (p, r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;

export class YardLife {
  /** @param setDetail  the world's own switch for the low graphics level (from createWorld) */
  constructor(game, setDetail) {
    this.game = game; this.setDetail = setDetail; this.low = false;
    this.fireflies = new Fireflies(game.scene);
    this.customers = new Customers(game.scene);
    this.crowd = []; this.to = { x: 0, z: 0 };
    this.splash = 0; this.spot = { x: 0, y: 0.05, z: 0 };
    this.smokeIn = 0;
    this.forest = (x, z) => this.inForest(x, z);
    game.player.fixed = true;   // the player pushes workers aside and is not pushed
  }

  /**
   * The low graphics level, switched while the game runs: fewer bushes, stones and flowers and none
   * of their shadows, a fraction of the rain, smaller bursts of particles, thinner smoke, fewer
   * fireflies, no splashes and no customers.
   */
  setLow(low) {
    this.low = low;
    this.setDetail(low);
    this.game.sky.setLow(low);
    this.game.particles.low = low;
  }

  /** Goods were sold for money at a shop the camera can see: perhaps a customer comes for them. */
  sold(shop) {
    if (this.low || !shop.seen) return;
    this.customers.sold(shop, this.game.area(shop.area).bounds);
  }

  /** @param paused  true while a sheet is open over the game: people stand still, the weather goes on */
  update(dt, paused) {
    const game = this.game, sky = game.sky, focus = game.camFocus;
    if (!paused) { this.keepApart(dt); this.customers.update(dt, game); }

    sky.calm = game.calm;   // no lightning for players who asked for less motion
    if (sky.rumble) game.sfx.thunder();

    // rain lands: small splashes on the ground around what the camera looks at
    if (sky.rain > 0.15 && !this.low) {
      this.splash += dt * SPLASHES * sky.rain;
      while (this.splash >= 1) {
        this.splash -= 1;
        this.spot.x = focus.x + (Math.random() - 0.5) * 30; this.spot.z = focus.z - 5 + (Math.random() - 0.5) * 26;
        game.particles.emit(this.spot, SPLASH);
      }
    }

    this.fireflies.update(dt, sky.night, focus, this.forest, this.low ? 12 : 36);

    // the chimneys around the city smoke for as long as a machine there is running
    if (CITY_STACKS.length && (this.smokeIn -= dt) <= 0) {
      this.smokeIn = this.low ? 1.2 : 0.45;
      if (this.cityWorks()) for (const c of CITY_STACKS) if (game.near(c.x, c.z, 60)) game.particles.puff(c.x, c.y, c.z, CITY_SMOKE);
    }
  }

  /** Workers do not walk through each other, or through the player: a gentle push apart when two get close. */
  keepApart(dt) {
    const game = this.game, crowd = this.crowd, to = this.to;
    crowd.length = 0; crowd.push(game.player);
    for (const a of game.areas) if (a.open) for (const w of a.workers) crowd.push(w);
    if (crowd.length < 2) return;
    pushApart(crowd, PERSON, TUNING.workerSpeed * dt * SHOVE);
    const blocks = game.blocks();
    for (let i = 1; i < crowd.length; i++) {
      const w = crowd[i];
      if (!w.dx && !w.dz) continue;
      to.x = w.pos.x + w.dx; to.z = w.pos.z + w.dz;
      // nobody is pushed out of the yard, or into a machine or a counter
      if (!game.allowed(to) || (this.blocked(blocks, to) && !this.blocked(blocks, w.pos))) continue;
      w.pos.x = to.x; w.pos.z = to.z;
      w.group.position.x = to.x; w.group.position.z = to.z;
    }
  }
  blocked(blocks, p) {
    for (let i = 0; i < blocks.length; i++) if (inRect(p, blocks[i])) return true;
    return false;
  }

  /** True where trees grow: outside the open yards, and off the asphalt around the cities. */
  inForest(x, z) {
    for (const a of this.game.areas) {
      const b = a.bounds;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return !a.open;   // a yard that is still forest, or one that is not
      if (a.open && x > b.minX - 1.5 && x < b.maxX + 1.5 && z > b.minZ - 1.5 && z < b.maxZ + 1.5) return false;   // not on top of a fence
      if (a.cfg.location !== 'town' && x > b.minX - 13 && x < b.maxX + 13 && z > b.minZ - 2.5 && z < b.maxZ + 13) return false;
    }
    return true;
  }

  cityWorks() {
    for (const a of this.game.areas) {
      if (!a.open || a.cfg.location === 'town') continue;
      for (const s of a.stations) if (s.type === 'processor' && s.sim.busy) return true;
    }
    return false;
  }
}
