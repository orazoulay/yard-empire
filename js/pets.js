// The pets bought with credits: the Yard Dog, and the cat, the robot dog and the parrot of "More pets". One pet at a
// time follows the player: it trots after them and stands when they stop; the parrot flies at their shoulder.
// It is only looked at: it carries nothing, blocks nobody and changes nothing in the game.
import * as THREE from 'three';
import { box, lit } from './world.js';
import { softShadow } from './textures.js';
import { bake, moving } from './engine/bake.js';
import { release } from './engine/materials.js';

const BEHIND = 1.5;     // how far behind the player it keeps
const SPEED = 9;        // it catches up quicker than anyone walks
const SIDE = 0.9;       // and walks a little to the side, so it is not hidden behind the player's legs
const NOSE = 0x222222;

/** A group at a place, added to `parent`. */
const part = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
/**
 * A mesh at a place, added to `parent`. Only a pet's body throws a shadow (`shadow`): the small parts would each cost
 * a draw more for it, and the soft patch under the pet is its shadow on every graphics level.
 */
const put = (parent, mesh, x, y, z, shadow = false) => { mesh.position.set(x, y, z); mesh.castShadow = shadow; parent.add(mesh); return mesh; };
/**
 * Two pairs of legs, each pair one part that swings from the hips: [z of the front hips, z of the back hips], how far
 * apart a pair stands, the hips' height, a leg's thickness and length. A pair is one mesh, so four legs are two draws.
 * With `trot`, each leg swings from its own hip (four parts: front left, front right, back left, back right), so that
 * the legs can go in diagonal pairs, as the Yard Dog players bought has always trotted.
 */
function legs(g, [front, back], apart, hipY, w, len, color, trot = false) {
  const leg = () => box(w, len, w, color, { round: w * 0.36 });
  if (trot) return [[-apart, front], [apart, front], [-apart, back], [apart, back]].map(([x, z]) => { const hip = part(g, x, hipY, z); put(hip, leg(), 0, -len / 2, 0); return hip; });
  return [front, back].map(z => {
    const hip = part(g, 0, hipY, z);
    for (const x of [-apart, apart]) put(hip, leg(), x, -len / 2, 0);
    return hip;
  });
}

/**
 * What each pet is built like. Each returns the parts that move ({ head, legs, tail, wings }); `size` is how much
 * larger than life it is drawn (a phone would show only a speck), `fly` the height it flies at. Every part is of the
 * one plain surface, so that a piece is joined into one mesh (js/engine/bake.js); only what glows is a part of its own.
 */
const MODELS = {
  dog(g) {
    const FUR = 0xc98a4b, DARK = 0x6b4226;
    put(g, box(0.42, 0.34, 0.8, FUR, { round: 0.1 }), 0, 0.48, 0, true);
    const head = part(g, 0, 0.74, 0.42);
    put(head, box(0.36, 0.32, 0.34, FUR, { round: 0.1 }), 0, 0, 0);
    put(head, box(0.2, 0.16, 0.2, DARK, { round: 0.05 }), 0, -0.05, 0.22);
    put(head, box(0.08, 0.06, 0.05, NOSE), 0, 0, 0.33);
    for (const x of [-0.13, 0.13]) {
      put(head, box(0.1, 0.18, 0.08, DARK, { round: 0.03 }), x, 0.2, -0.04);
      put(head, box(0.05, 0.06, 0.03, NOSE), x * 0.7, 0.05, 0.17);
    }
    const tail = part(g, 0, 0.6, -0.4);
    put(tail, box(0.07, 0.07, 0.32, DARK, { round: 0.03 }), 0, 0, -0.14).rotation.x = -0.6;
    return { head, tail, legs: legs(g, [0.28, -0.28], 0.13, 0.34, 0.11, 0.32, FUR, true), trot: true, size: 1.35, shadow: [1.1, 1.3] };
  },
  cat(g) {
    const FUR = 0x8d939b, PALE = 0xf2f2ee, PINK = 0xf0a3a8;
    put(g, box(0.3, 0.26, 0.66, FUR, { round: 0.1 }), 0, 0.4, 0, true);
    const head = part(g, 0, 0.6, 0.36);
    put(head, box(0.32, 0.27, 0.28, FUR, { round: 0.1 }), 0, 0, 0);
    put(head, box(0.14, 0.09, 0.08, PALE, { round: 0.03 }), 0, -0.07, 0.15);
    put(head, box(0.05, 0.04, 0.04, PINK), 0, -0.03, 0.2);
    for (const x of [-0.11, 0.11]) {
      put(head, box(0.1, 0.16, 0.07, FUR, { round: 0.02 }), x, 0.19, -0.02).rotation.z = x > 0 ? -0.35 : 0.35;   // pointed ears
      put(head, box(0.06, 0.07, 0.03, 0x9fe05a), x * 0.75, 0.03, 0.14);   // green eyes
    }
    const tail = part(g, 0, 0.5, -0.32);
    put(tail, box(0.06, 0.4, 0.06, FUR, { round: 0.025 }), 0, 0.17, -0.06).rotation.x = -0.35;   // carried high
    return { head, tail, legs: legs(g, [0.22, -0.22], 0.1, 0.28, 0.08, 0.27, FUR), size: 1.35, shadow: [0.9, 1.1] };
  },
  robodog(g) {
    const STEEL = 0xb8c0c8, DARK = 0x3d4652;
    put(g, box(0.44, 0.3, 0.78, STEEL, { round: 0.04 }), 0, 0.5, 0, true);
    put(g, box(0.3, 0.06, 0.4, 0xff8a1f, { round: 0.02 }), 0, 0.665, -0.05, true);   // an orange plate on its back
    const head = part(g, 0, 0.74, 0.42);
    put(head, box(0.36, 0.28, 0.32, STEEL, { round: 0.04 }), 0, 0, 0);
    put(head, box(0.3, 0.1, 0.05, DARK), 0, 0.03, 0.15);   // the visor
    put(head, lit(box(0.22, 0.05, 0.04, 0x9ff2ff, { map: null }), 0x7fe8ff, 0.7), 0, 0.03, 0.17);   // and the light in it
    put(head, box(0.2, 0.12, 0.16, DARK, { round: 0.03 }), 0, -0.07, 0.2);
    for (const x of [-0.15, 0.15]) put(head, box(0.05, 0.2, 0.1, DARK, { round: 0.02 }), x, 0.2, -0.06);   // ears like aerials
    const tail = part(g, 0, 0.62, -0.38);
    put(tail, box(0.04, 0.34, 0.04, DARK), 0, 0.14, -0.06).rotation.x = -0.4;
    put(tail, box(0.08, 0.08, 0.08, 0xff8a1f, { round: 0.02 }), 0, 0.3, -0.13);   // a knob at its tip
    return { head, tail, legs: legs(g, [0.28, -0.28], 0.15, 0.38, 0.1, 0.36, DARK), size: 1.35, shadow: [1.1, 1.3] };
  },
  parrot(g) {
    const RED = 0xe0362c, BLUE = 0x2f6fd6, YELLOW = 0xffc933;
    put(g, box(0.26, 0.34, 0.3, RED, { round: 0.11 }), 0, 0, 0);
    put(g, box(0.2, 0.05, 0.34, BLUE, { round: 0.02 }), 0, -0.1, -0.26).rotation.x = 0.35;   // the tail feathers
    const head = part(g, 0, 0.26, 0.08);
    put(head, box(0.24, 0.22, 0.24, RED, { round: 0.09 }), 0, 0, 0);
    put(head, box(0.1, 0.12, 0.14, YELLOW, { round: 0.04 }), 0, -0.04, 0.16);                 // the beak
    for (const x of [-0.122, 0.122]) put(head, box(0.02, 0.07, 0.07, 0xf6f1dc), x, 0.03, 0.04);
    for (const x of [-0.13, 0.13]) put(head, box(0.02, 0.035, 0.035, NOSE), x, 0.03, 0.05);
    const wings = [-1, 1].map(s => {   // each wing hangs from the shoulder and beats
      const w = part(g, s * 0.13, 0.1, 0);
      put(w, box(0.42, 0.05, 0.3, BLUE, { round: 0.02 }), s * 0.21, 0, -0.02);
      put(w, box(0.16, 0.045, 0.24, YELLOW, { round: 0.02 }), s * 0.47, 0, -0.04);
      return w;
    });
    return { head, wings, legs: [], tail: null, size: 1.5, fly: 2.05, shadow: [0.7, 0.7] };   // high over the ground it throws no shadow but its patch
  },
};
/** The pets there are: 'dog' (the Yard Dog) and the choices of "More pets" (js/data/looks.js, STORE_LOOKS.pets). */
export const PETS = Object.keys(MODELS);

export class Pet {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.visible = false;   // where the pet is; what it looks like hangs under it (the model)
    scene.add(this.group);
    this.kind = ''; this.model = null; this.parts = null;
    this.picked = '';   // the pet of More pets that is owned and chosen, or '' (choose)
    this.pos = new THREE.Vector3(); this.heading = 0; this.t = 0; this.placed = false;
  }

  /**
   * Which pet it is. The model of the pet before is taken out and what only it was made of is freed (its joined
   * shapes); the shapes and materials shared with other things stay. Asked for the pet it is already, it does nothing.
   * @param kind  one of PETS, or '' for none
   */
  setKind(kind) {
    const want = Object.hasOwn(MODELS, kind) ? kind : '';   // 'constructor' is no pet
    if (want === this.kind) return;
    if (this.model) { release(this.model); this.model = null; this.parts = null; }
    this.kind = want;
    if (!want) return;
    const g = this.model = new THREE.Group(), p = this.parts = MODELS[want](g);
    const shade = p.shade = softShadow(p.shadow[0], p.shadow[1], { round: true, opacity: 0.26 });
    if (p.fly) shade.position.y -= p.fly / p.size;   // a pet that flies leaves its shadow on the ground
    p.ground = shade.position.y;                     // and the patch stays there while the pet bobs (update)
    g.add(shade);
    moving(p.head, p.tail, ...p.legs, ...(p.wings || []));
    for (const piece of [g, p.head, p.tail, ...p.legs, ...(p.wings || [])]) if (piece) bake(piece);   // the body and each moving part are one mesh or two
    g.scale.setScalar(p.size);
    this.group.add(g);
    this.placed = false;
  }

  /** The pet of More pets that is owned and chosen (js/game/looks.js): it comes in place of the Yard Dog. '' for none. */
  choose(kind) { this.picked = kind !== 'dog' && Object.hasOwn(MODELS, kind) ? kind : ''; }   // the Yard Dog is an item of its own: owned or not, it is never picked here

  /**
   * @param player  the player's Character: where it is and which way it faces
   * @param dog     the Yard Dog is owned (the server said so)
   */
  update(dt, player, dog) {
    this.setKind(this.picked || (dog ? 'dog' : ''));
    const shown = !!this.kind;
    this.group.visible = shown;
    if (!shown) { this.placed = false; return; }
    const p = player.pos, h = player.heading, parts = this.parts, fly = parts.fly || 0;
    const want = { x: p.x - Math.sin(h) * BEHIND + Math.cos(h) * SIDE, z: p.z - Math.cos(h) * BEHIND - Math.sin(h) * SIDE };
    if (!this.placed || Math.hypot(want.x - this.pos.x, want.z - this.pos.z) > 12) { this.pos.set(want.x, p.y, want.z); this.placed = true; }   // first time, or the player jumped to another yard
    const dx = want.x - this.pos.x, dz = want.z - this.pos.z, dist = Math.hypot(dx, dz), step = Math.min(dist, SPEED * dt * Math.min(1, dist));
    const going = dist > 0.15;
    if (going) {
      this.pos.x += dx / dist * step; this.pos.z += dz / dist * step;
      const turn = Math.atan2(dx, dz) - this.heading;
      this.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 10);
    }
    this.pos.y += (p.y - this.pos.y) * Math.min(1, dt * 10);   // up onto a foundation with the player
    this.t += dt * (going ? 14 : 3);
    const swing = going ? Math.sin(this.t) * 0.7 : 0;
    // the front pair forward as the back pair goes back; the Yard Dog trots, its front left leg with its back right one
    parts.legs.forEach((leg, i) => { leg.rotation.x = (parts.trot ? i === 0 || i === 3 : i === 0) ? swing : -swing; });
    if (parts.tail) parts.tail.rotation.y = Math.sin(this.t * (going ? 1 : 2.5)) * 0.5;   // wags, faster when it stands
    parts.head.rotation.x = going ? 0 : Math.sin(this.t * 0.4) * 0.08;
    if (parts.wings) {   // the parrot beats its wings, faster on the move, and bobs in the air
      const beat = Math.sin(this.t * (going ? 1.6 : 4)) * 0.75;
      parts.wings[0].rotation.z = beat; parts.wings[1].rotation.z = -beat;
    }
    // The pet bobs (the parrot in the air, a dog in its step): its model goes up and down, the patch of shadow under it
    // does not, so the patch lies on the ground in every frame.
    const bob = fly ? Math.sin(this.t * (going ? 0.8 : 2)) * 0.07 : going ? Math.abs(Math.sin(this.t)) * 0.05 : 0;
    this.group.position.copy(this.pos);
    this.group.position.y += fly;
    this.model.position.y = bob;
    parts.shade.position.y = parts.ground - bob / parts.size;
    this.group.rotation.y = this.heading;
  }
}
