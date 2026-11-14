// @ts-check
// Surfaces drawn in code: grass, soil, wood, bark, painted metal and soft shadows.
// Each picture is made once on a canvas (there are no image files to load), repeats without a seam,
// and is shared. Every call returns a texture of its own, so each use can repeat it differently.
// The near-white ones (soil, wood, bark, metal, edge) multiply the colour of the material they are on.
import * as THREE from 'three';

let anisotropy = 4;
/** How sharp surfaces stay when seen at a low angle; the renderer knows the most the device can do. */
export function setAnisotropy(n) { anisotropy = Math.max(1, Math.min(8, n || 1)); }

function rng(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const images = new Map(), sources = new Map(), textures = new Map(), ids = new WeakMap();
let lastId = 0;
const idOf = img => { if (!ids.has(img)) ids.set(img, ++lastId); return ids.get(img); };
function image(name, size, draw) {
  if (!images.has(name)) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size, rng(name.length * 977 + size));
    images.set(name, c);
  }
  return images.get(name);
}
/**
 * A texture of one picture, repeated rx by ry. The same picture with the same options is the same texture, and every
 * texture of one picture shares one copy of it (its Source), so the graphics chip holds each picture once per colour
 * space instead of once per surface. Pass shared: false for a texture that will be moved or changed later.
 */
function texture(img, { rx = 1, ry = 1, color = true, rotate = 0, shared = true } = {}) {
  const key = shared ? [idOf(img), rx, ry, color, rotate].join('|') : '';
  if (shared && textures.has(key)) return textures.get(key);
  const t = new THREE.CanvasTexture(img);
  if (!sources.has(img)) sources.set(img, t.source); else t.source = sources.get(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = anisotropy;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (rotate) { t.center.set(0.5, 0.5); t.rotation = rotate; }
  if (shared) { t.userData.shared = true; textures.set(key, t); }
  return t;
}
/** How many distinct textures and pictures the surfaces made so far use (for the graphics diagnostics). */
export const textureStats = () => ({ textures: textures.size, pictures: sources.size });

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Smooth noise that repeats: a function of (u, v) in 0..1 giving 0..1, with cx by cy cells. */
function noise(rnd, cx, cy = cx) {
  const g = new Float32Array(cx * cy).map(() => rnd());
  const at = (x, y) => g[((y % cy + cy) % cy) * cx + ((x % cx + cx) % cx)];
  return (u, v) => {
    const x = u * cx, y = v * cy, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(0, 1, x - x0), fy = smooth(0, 1, y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}
/** Three layers of noise, coarse to fine. */
function clouds(rnd) {
  const a = noise(rnd, 4), b = noise(rnd, 9), c = noise(rnd, 21);
  return (u, v) => a(u, v) * 0.55 + b(u, v) * 0.3 + c(u, v) * 0.15;
}
/** Fill the canvas from a function of (u, v) that gives [r, g, b] or a grey level, 0..255. */
function pixels(g, N, fn) {
  const im = g.createImageData(N, N), d = im.data;
  for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i += 4) {
    const c = fn(x / N, y / N);
    if (typeof c === 'number') d[i] = d[i + 1] = d[i + 2] = c; else { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
    d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}
/** Draw something at (x, y) and again across the edges it touches, so that the picture tiles. */
function tiled(N, x, y, pad, draw) {
  for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
    const px = x + ox, py = y + oy;
    if (px > -pad && px < N + pad && py > -pad && py < N + pad) draw(px, py);
  }
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// --------------------------------------------------------------------------------- the pictures
const grassImage = () => image('grass', 512, (g, N, rnd) => {
  const big = clouds(rnd), patch = noise(rnd, 3);
  pixels(g, N, (u, v) => {
    const c = mix([82, 150, 50], [134, 198, 82], big(u, v));
    return mix(c, [168, 194, 88], smooth(0.55, 0.95, patch(u, v)) * 0.28);   // drier patches
  });
  const BLADES = ['#5a9638', '#74b548', '#93cf5f', '#b6e07a', '#4f8a33'];
  g.lineCap = 'round';
  for (let i = 0; i < 15000; i++) {
    const x = rnd() * N, y = rnd() * N, len = 3 + rnd() * 6, a = -Math.PI / 2 + (rnd() - 0.5) * 1.5;
    g.strokeStyle = BLADES[Math.floor(rnd() * BLADES.length)]; g.globalAlpha = 0.25 + rnd() * 0.35; g.lineWidth = 0.8 + rnd() * 0.8;
    tiled(N, x, y, 10, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
  }
  g.globalAlpha = 1;
});

const soilImage = () => image('soil', 256, (g, N, rnd) => {
  const big = clouds(rnd);
  pixels(g, N, (u, v) => 196 + 59 * big(u, v));
  for (let i = 0; i < 2600; i++) {   // grit
    const x = rnd() * N, y = rnd() * N, r = 0.4 + rnd() * 0.9;
    g.fillStyle = rnd() < 0.7 ? `rgba(45,35,15,${0.08 + rnd() * 0.14})` : `rgba(255,255,255,${0.2 + rnd() * 0.25})`;
    tiled(N, x, y, 3, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); });
  }
  for (let i = 0; i < 40; i++) {     // pebbles, each with its small shadow
    const x = rnd() * N, y = rnd() * N, r = 1.6 + rnd() * 2.6, turn = rnd() * 3, grey = 205 + Math.floor(rnd() * 40);
    tiled(N, x, y, 8, (px, py) => {
      g.fillStyle = 'rgba(30,25,10,0.28)'; g.beginPath(); g.ellipse(px + 1, py + 1.4, r * 1.25, r, turn, 0, 7); g.fill();
      g.fillStyle = `rgb(${grey},${grey},${grey - 6})`; g.beginPath(); g.ellipse(px, py, r * 1.25, r, turn, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(px - r * 0.3, py - r * 0.3, r * 0.5, r * 0.35, turn, 0, 7); g.fill();
    });
  }
});

/** Wood grain running along the width of the picture: fine wavy lines and two knots. */
const woodImage = () => image('wood', 256, (g, N, rnd) => {
  const streak = noise(rnd, 2, 26);
  pixels(g, N, (u, v) => 214 + 41 * streak(u, v));
  for (let i = 0; i < 80; i++) {
    const y = rnd() * N, waves = 1 + Math.floor(rnd() * 3), amp = rnd() * 2.4, ph = rnd() * 6;
    g.strokeStyle = `rgba(70,35,10,${0.06 + rnd() * 0.18})`; g.lineWidth = 0.5 + rnd() * 1.2;
    for (const oy of [-N, 0, N]) {
      g.beginPath();
      for (let x = 0; x <= N; x += 4) { const yy = y + oy + Math.sin(x / N * Math.PI * 2 * waves + ph) * amp; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
  }
  for (let i = 0; i < 2; i++) {
    const x = 30 + rnd() * (N - 60), y = 30 + rnd() * (N - 60);
    for (let r = 2; r < 9; r += 2.2) { g.strokeStyle = `rgba(60,30,8,${0.3 - r * 0.02})`; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, r * 1.7, r, 0, 0, 7); g.stroke(); }
  }
});

/** Bark: dark cracks running up the picture. */
const barkImage = () => image('bark', 256, (g, N, rnd) => {
  const streak = noise(rnd, 30, 3);
  pixels(g, N, (u, v) => 176 + 79 * streak(u, v));
  for (let i = 0; i < 60; i++) {
    const x = rnd() * N, waves = 1 + Math.floor(rnd() * 3), amp = rnd() * 3, ph = rnd() * 6;
    g.strokeStyle = `rgba(35,18,6,${0.2 + rnd() * 0.35})`; g.lineWidth = 0.8 + rnd() * 2;
    for (const ox of [-N, 0, N]) {
      g.beginPath();
      for (let y = 0; y <= N; y += 4) { const xx = x + ox + Math.sin(y / N * Math.PI * 2 * waves + ph) * amp; y ? g.lineTo(xx, y) : g.moveTo(xx, y); }
      g.stroke();
    }
  }
});

/** The cut end of a log: pale wood with year rings and a rim of bark. In colour. */
const ringsImage = () => image('rings', 128, (g, N, rnd) => {
  g.fillStyle = '#6b3d1c'; g.fillRect(0, 0, N, N);
  g.fillStyle = '#e9c08a'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.44, 0, 7); g.fill();
  for (let r = 5; r < N * 0.43; r += 4 + rnd() * 4) {
    g.strokeStyle = `rgba(150,92,40,${0.3 + rnd() * 0.3})`; g.lineWidth = 0.8 + rnd() * 1.2;
    g.beginPath(); g.ellipse(N / 2 + (rnd() - 0.5) * 3, N / 2 + (rnd() - 0.5) * 3, r, r * (0.92 + rnd() * 0.1), rnd() * 3, 0, 7); g.stroke();
  }
  g.fillStyle = 'rgba(120,70,30,0.7)'; g.beginPath(); g.arc(N / 2, N / 2, 2.5, 0, 7); g.fill();
});

/** How dark the picture gets toward its edges, 0.8 at the edge to 1 inside: the shade where two faces of a block meet. */
const edgeShade = (u, v, width = 0.08) => 0.8 + 0.2 * smooth(0, width, Math.min(u, v, 1 - u, 1 - v));

/** A plain block face: the shade at the edges and a hint of unevenness. */
const edgeImage = () => image('edge', 128, (g, N, rnd) => {
  const big = noise(rnd, 5);
  pixels(g, N, (u, v) => 255 * edgeShade(u, v) * (0.965 + 0.035 * big(u, v)));
});

/** Painted sheet metal: shaded edges, fine scratches, two seams and a row of rivets along the top and the bottom. */
const panelImage = () => image('panel', 256, (g, N, rnd) => {
  const big = clouds(rnd);
  pixels(g, N, (u, v) => 255 * edgeShade(u, v, 0.05) * (0.9 + 0.1 * big(u, v)));
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N, y = rnd() * N, a = rnd() * 6.3, len = 6 + rnd() * 30;
    g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.1})` : `rgba(0,0,0,${0.04 + rnd() * 0.07})`; g.lineWidth = 0.5 + rnd() * 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (const x of [N / 3, N * 2 / 3]) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 1, 0, 2, N);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 1, 0, 1, N);
  }
  for (const y of [13, N - 13]) for (let k = 0; k < 12; k++) {
    const x = (k + 0.5) * N / 12;
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.arc(x + 0.6, y + 0.8, 2.6, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x, y, 2.1, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(x + 0.5, y + 0.5, 1.2, 0, 7); g.fill();
  }
});

/** A soft dark patch, densest in the middle: what gathers under something that stands on the ground. */
const shadowImage = round => image(round ? 'shadow-round' : 'shadow-box', 128, (g, N) => {
  // Grey levels, used as the opacity of the patch: white in the middle, black at the rim.
  const corner = 0.3;   // how round the corners of the box-shaped patch are
  pixels(g, N, (u, v) => {
    const px = Math.abs(u - 0.5), py = Math.abs(v - 0.5);
    if (round) return 255 * (1 - smooth(0.3, 1, Math.hypot(px, py) * 2));
    const qx = px - (0.5 - corner), qy = py - (0.5 - corner);
    const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);   // below 0 inside, `corner` at the rim
    return 255 * (1 - smooth(-0.1, corner, dist));
  });
});

// --------------------------------------------------------------------------------- what the game asks for
/** Grass, in colour. The same picture, uncoloured, also raises the surface a little. */
export const grass = (rx, ry) => ({ map: texture(grassImage(), { rx, ry }), bumpMap: texture(grassImage(), { rx, ry, color: false }), bumpScale: 0.6 });
/** Bare ground with grit and pebbles; takes the colour of the yard. */
export const soil = (rx, ry) => ({ map: texture(soilImage(), { rx, ry }), bumpMap: texture(soilImage(), { rx, ry, color: false }), bumpScale: 0.8 });
/** Wood with the grain along the width of each face, or turned to run up it. */
export const wood = ({ upright = false, rx = 1, ry = 1 } = {}) => ({ map: texture(woodImage(), { rx, ry, rotate: upright ? Math.PI / 2 : 0 }), roughness: 0.82 });
export const bark = () => ({ map: texture(barkImage(), { rx: 2, ry: 1 }), bumpMap: texture(barkImage(), { rx: 2, ry: 1, color: false }), bumpScale: 1, roughness: 0.95 });
export const rings = () => ({ map: texture(ringsImage()), roughness: 0.85 });
export const edge = () => texture(edgeImage());
export const panel = () => ({ map: texture(panelImage()), bumpMap: texture(panelImage(), { color: false }), bumpScale: 0.5, roughness: 0.55, metalness: 0.3 });

/** Safety paint on a floor: yellow and near-black diagonal stripes, worn a little, along the width of the picture. */
const stripesImage = () => image('stripes', 128, (g, N, rnd) => {
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, N, N);
  g.fillStyle = '#23262b';
  for (let x = -N; x < N * 2; x += 32) { g.beginPath(); g.moveTo(x, N); g.lineTo(x + 16, N); g.lineTo(x + 16 + N * 0.5, 0); g.lineTo(x + N * 0.5, 0); g.closePath(); g.fill(); }
  for (let i = 0; i < 260; i++) {   // scuffs where boots and pallets pass
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '60,50,40'},${0.06 + rnd() * 0.1})`;
    g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 6, 1 + rnd() * 2);
  }
});
/** Safety stripes repeated rx times along a strip of floor paint. */
export const stripes = rx => ({ map: texture(stripesImage(), { rx, ry: 1 }), roughness: 0.7 });

/** The shadows of clouds as an opacity map: mostly clear, with soft dark islands. */
const cloudImage = () => image('clouds', 256, (g, N, rnd) => {
  const big = clouds(rnd);
  pixels(g, N, (u, v) => 255 * smooth(0.5, 0.72, big(u, v)));
});
export const cloudShadow = repeat => texture(cloudImage(), { rx: repeat, ry: repeat, color: false, shared: false });   // js/sky.js moves it

/** A soft shadow lying on the ground, w by d, round or with rounded corners. */
const PLANE = new THREE.PlaneGeometry(1, 1); PLANE.userData.shared = true;
const shadowMats = new Map();
export function softShadow(w, d, { round = false, opacity = 0.34 } = {}) {
  // one square for every patch, stretched to size, and one material for each look: they are never changed afterwards
  const key = round + '|' + opacity;
  if (!shadowMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ alphaMap: texture(shadowImage(round), { color: false }), color: 0x1c2410, transparent: true, opacity, depthWrite: false });
    m.userData.shared = true; shadowMats.set(key, m);
  }
  const m = new THREE.Mesh(PLANE, shadowMats.get(key));
  m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.y = 0.016; m.renderOrder = 1;
  return m;
}

// --------------------------------------------------------------------------------- light and wear
/** A soft round patch as an opacity map, densest in the middle: a pool of light on the ground. */
export const glowMap = () => texture(shadowImage(true), { color: false });

/**
 * The beam of a headlight on the road, as an opacity map: narrow and bright at the lamp (the top of
 * the picture), wide and faint ahead of it.
 */
const beamImage = () => image('beam', 128, (g, N) => {
  pixels(g, N, (u, v) => {
    const wide = 0.14 + 0.36 * v, off = Math.abs(u - 0.5);
    return 255 * smooth(0, 0.05, v) * (1 - smooth(0.1, 1, v)) * (1 - smooth(wide * 0.5, wide, off));
  });
});
export const beamMap = () => texture(beamImage(), { color: false });

/**
 * The ground of a yard where it is walked on most: a darker, worn patch along every path and where
 * people stand. Drawn once for a yard (and again when a machine is added), from the yard's own paths.
 * @param w, d    size of the yard
 * @param paths   [{ a, b, weight }] with points measured from the yard's north-west corner
 * @param spots   [{ x, z }] where people stand, measured the same way
 */
export function wornGround(w, d, paths, spots = []) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.scale(N / w, N / d);   // from here on, one unit is one step in the yard
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.strokeStyle = g.fillStyle = '#fff';
  // A path is laid down as a few strokes, wide and faint to narrow and firm: that gives it a soft edge.
  for (const [width, alpha] of [[3.4, 0.07], [2.6, 0.09], [1.9, 0.11], [1.2, 0.13], [0.6, 0.1]]) {
    g.lineWidth = width;
    for (const p of paths) {
      g.globalAlpha = alpha * p.weight;
      g.beginPath(); g.moveTo(p.a.x, p.a.z); g.lineTo(p.b.x, p.b.z); g.stroke();
    }
    g.globalAlpha = alpha;
    for (const s of spots) { g.beginPath(); g.arc(s.x, s.z, width * 0.55, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = anisotropy;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ alphaMap: t, color: 0x2c261c, transparent: true, opacity: 0.36, depthWrite: false }));   // dark and nearly grey: it has to sit on soil and on asphalt alike
  m.rotation.x = -Math.PI / 2; m.position.y = 0.013;   // above the yard's ground, under the soft shadows
  return m;
}

/**
 * A painted wooden sign: a name and an arrow. The name is written when the sign is made; if the
 * game's own typeface has not arrived yet, the browser's plain one is used.
 * @param dir  which way the arrow points on the board: 'left', 'right', 'up' or 'down'
 */
export function signBoard(text, dir = 'right') {
  const W = 256, H = 96, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f1dfb0'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#6b4a2b'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  const INK = '#3b2a1e', arrowAt = dir === 'left' ? 38 : W - 38, textAt = dir === 'left' ? 38 + (W - 38) / 2 + 4 : (W - 38) / 2 - 4, room = W - 96;
  // the arrow: a shaft and a head, turned to the way it points
  g.save(); g.translate(arrowAt, H / 2); g.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0);
  g.fillStyle = INK; g.beginPath();
  g.moveTo(-20, -6); g.lineTo(2, -6); g.lineTo(2, -17); g.lineTo(22, 0); g.lineTo(2, 17); g.lineTo(2, 6); g.lineTo(-20, 6); g.closePath(); g.fill();
  g.restore();
  // the name: on one line if it fits, else broken at the space nearest its middle
  const words = text.split(' ');
  let lines = [text];
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = size => { g.font = `700 ${size}px Inter, system-ui, sans-serif`; };
  font(30);
  if (g.measureText(text).width > room && words.length > 1) {
    let best = 1;
    for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - text.length / 2) < Math.abs(words.slice(0, best).join(' ').length - text.length / 2)) best = i;
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  let size = lines.length > 1 ? 26 : 30;
  font(size);
  while (size > 12 && Math.max(...lines.map(l => g.measureText(l).width)) > room) font(size -= 2);
  lines.forEach((l, i) => g.fillText(l, textAt, H / 2 + (i - (lines.length - 1) / 2) * (size + 4)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
  return t;
}

// --------------------------------------------------------------------------------- the ground and the walls of each yard
// One picture per kind of ground (js/data/looks.js says which yard has which). All are near white,
// like the soil, so the yard's own colour still shows through, and all repeat without a seam.
const speck = (g, N, rnd, count, dark = 0.14, light = 0.25) => {
  for (let i = 0; i < count; i++) {
    const x = rnd() * N, y = rnd() * N, r = 0.4 + rnd() * 0.9;
    g.fillStyle = rnd() < 0.7 ? `rgba(35,30,20,${dark * (0.5 + rnd())})` : `rgba(255,255,255,${light * (0.5 + rnd())})`;
    tiled(N, x, y, 3, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); });
  }
};
const grey = v => `rgb(${v | 0},${v | 0},${v | 0})`;
/** A crack: a thin dark line that wanders. */
const crack = (g, N, rnd, alpha = 0.4) => {
  let x = rnd() * N, y = rnd() * N, a = rnd() * 6.3;
  g.strokeStyle = `rgba(20,18,15,${alpha})`; g.lineWidth = 0.6 + rnd() * 0.8; g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < 14; i++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); }
  g.stroke();
};
const GROUND_IMAGES = {
  soil: soilImage,
  // the sawmill: soil strewn with sawdust and wood chips
  chips: () => image('ground:chips', 256, (g, N, rnd) => {
    const big = clouds(rnd);
    pixels(g, N, (u, v) => 198 + 57 * big(u, v));
    speck(g, N, rnd, 1600, 0.08, 0.5);
    for (let i = 0; i < 300; i++) {
      const x = rnd() * N, y = rnd() * N, w = 3 + rnd() * 5, h = 1.2 + rnd() * 1.6, a = rnd() * 3.2;
      tiled(N, x, y, 8, (px, py) => {
        g.save(); g.translate(px, py); g.rotate(a);
        g.fillStyle = 'rgba(40,25,10,0.28)'; g.fillRect(-w / 2 + 0.7, -h / 2 + 0.9, w, h);
        g.fillStyle = grey(236 + rnd() * 19); g.fillRect(-w / 2, -h / 2, w, h);
        g.restore();
      });
    }
  }),
  // the farm: ploughed rows
  furrows: () => image('ground:furrows', 256, (g, N, rnd) => {
    const big = clouds(rnd), fine = noise(rnd, 24);
    pixels(g, N, (u, v) => 168 + 62 * (0.5 + 0.5 * Math.sin((v + 0.012 * Math.sin(u * Math.PI * 4)) * Math.PI * 2 * 10)) + 16 * big(u, v) + 9 * fine(u, v));
    speck(g, N, rnd, 900, 0.16, 0.2);
  }),
  // the quarry and the gem mine: crushed stone
  gravel: () => image('ground:gravel', 256, (g, N, rnd) => {
    const big = clouds(rnd);
    pixels(g, N, (u, v) => 150 + 40 * big(u, v));
    for (let i = 0; i < 1300; i++) {
      const x = rnd() * N, y = rnd() * N, r = 1 + rnd() * 2.2, turn = rnd() * 3, v = 190 + rnd() * 65;
      tiled(N, x, y, 5, (px, py) => {
        g.fillStyle = 'rgba(20,18,12,0.3)'; g.beginPath(); g.ellipse(px + 0.7, py + 0.9, r * 1.2, r, turn, 0, 7); g.fill();
        g.fillStyle = grey(v); g.beginPath(); g.ellipse(px, py, r * 1.2, r, turn, 0, 7); g.fill();
      });
    }
  }),
  // the bakery: cobblestones
  cobble: () => image('ground:cobble', 256, (g, N, rnd) => {
    g.fillStyle = grey(120); g.fillRect(0, 0, N, N);
    const rows = 8, cell = N / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < rows; c++) {
      const x = c * cell + (r % 2 ? cell / 2 : 0) + (rnd() - 0.5) * 2, y = r * cell + (rnd() - 0.5) * 2, v = 205 + rnd() * 50, w = cell - 4 - rnd() * 2, h = cell - 4 - rnd() * 2;
      tiled(N, x + cell / 2, y + cell / 2, cell, (px, py) => {
        g.fillStyle = grey(v); g.beginPath(); g.roundRect ? g.roundRect(px - w / 2, py - h / 2, w, h, 7) : g.rect(px - w / 2, py - h / 2, w, h); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(px - w * 0.12, py - h * 0.14, w * 0.26, h * 0.2, 0, 0, 7); g.fill();
      });
    }
  }),
  // the carpentry, the forge, the steel factory, the store: stone flags
  flags: () => image('ground:flags', 256, (g, N, rnd) => {
    g.fillStyle = grey(140); g.fillRect(0, 0, N, N);
    const rows = 4, h = N / rows;
    for (let r = 0; r < rows; r++) {
      const w = N / 2, shift = (r % 2) * w / 2;
      for (let c = 0; c < 2; c++) {
        const v = 212 + rnd() * 43;
        tiled(N, c * w + shift + w / 2, r * h + h / 2, w, (px, py) => { g.fillStyle = grey(v); g.fillRect(px - w / 2 + 1.5, py - h / 2 + 1.5, w - 3, h - 3); });
      }
    }
    speck(g, N, rnd, 1400, 0.1, 0.18);
    for (let i = 0; i < 3; i++) crack(g, N, rnd, 0.3);
  }),
  // the glassworks and the oil field: sand, rippled by the wind
  sand: () => image('ground:sand', 256, (g, N, rnd) => {
    const big = clouds(rnd);
    pixels(g, N, (u, v) => 226 + 24 * big(u, v) + 5 * Math.sin((v + 0.02 * Math.sin(u * Math.PI * 6)) * Math.PI * 2 * 14));
    speck(g, N, rnd, 1100, 0.07, 0.3);
  }),
  // the mines: dark, broken rock
  rock: () => image('ground:rock', 256, (g, N, rnd) => {
    const big = clouds(rnd), mid = noise(rnd, 13);
    pixels(g, N, (u, v) => 138 + 70 * big(u, v) + 40 * smooth(0.45, 0.6, mid(u, v)));
    for (let i = 0; i < 14; i++) crack(g, N, rnd, 0.5);
    speck(g, N, rnd, 900, 0.18, 0.3);
  }),
  // the jeweller's, the electronics and the robotics factory: square tiles in two tones
  tile: () => image('ground:tile', 256, (g, N, rnd) => {
    g.fillStyle = grey(150); g.fillRect(0, 0, N, N);
    const n = 4, s = N / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { g.fillStyle = grey((r + c) % 2 ? 216 + rnd() * 8 : 246 + rnd() * 9); g.fillRect(c * s + 1, r * s + 1, s - 2, s - 2); }
    speck(g, N, rnd, 500, 0.05, 0.15);
  }),
  // the power plant and the car factory: asphalt
  asphalt: () => image('ground:asphalt', 256, (g, N, rnd) => {
    const big = clouds(rnd), fine = noise(rnd, 48);
    pixels(g, N, (u, v) => 182 + 26 * big(u, v) + 22 * fine(u, v));
    speck(g, N, rnd, 2800, 0.16, 0.4);
    for (let i = 0; i < 4; i++) crack(g, N, rnd, 0.35);
  }),
  // the chemical plant and the engine plant: poured concrete in slabs
  concrete: () => image('ground:concrete', 256, (g, N, rnd) => {
    const big = clouds(rnd);
    pixels(g, N, (u, v) => 220 + 28 * big(u, v));
    speck(g, N, rnd, 1200, 0.07, 0.15);
    for (const at of [0, N / 2]) {   // the joints between slabs: a dark line with a pale edge beside it
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(at, 0, 2, N); g.fillRect(0, at, N, 2);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(at + 2, 0, 1, N); g.fillRect(0, at + 2, N, 1);
    }
    for (let i = 0; i < 2; i++) crack(g, N, rnd, 0.22);
  }),
};
const GROUND_RELIEF = { soil: 0.8, chips: 0.8, furrows: 1.5, gravel: 1.2, cobble: 1.4, flags: 1.0, sand: 0.5, rock: 1.3, tile: 0.5, asphalt: 0.5, concrete: 0.6 };
/** The ground of a yard of the given kind: a surface and its relief, repeating rx by ry times. */
export function ground(kind, rx, ry) {
  const k = GROUND_IMAGES[kind] ? kind : 'soil', img = GROUND_IMAGES[k]();
  return { map: texture(img, { rx, ry }), bumpMap: texture(img, { rx, ry, color: false }), bumpScale: GROUND_RELIEF[k] };
}

/** Bricks in a running bond, near white. */
const brickImage = () => image('wall:brick', 128, (g, N, rnd) => {
  g.fillStyle = grey(150); g.fillRect(0, 0, N, N);
  const rows = 4, h = N / rows, w = N / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
    const v = 222 + rnd() * 33;
    tiled(N, c * w + (r % 2) * w / 2 + w / 2, r * h + h / 2, w, (px, py) => { g.fillStyle = grey(v); g.fillRect(px - w / 2 + 1.5, py - h / 2 + 1.5, w - 3, h - 3); });
  }
  speck(g, N, rnd, 400, 0.1, 0.15);
});
/** The face of a low wall, `rx` bricks or stones long: 'brick', or anything else for fitted stones. */
export const wall = (kind, rx) => {
  const img = kind === 'brick' ? brickImage() : GROUND_IMAGES.cobble();
  return { map: texture(img, { rx, ry: 1 }), bumpMap: texture(img, { rx, ry: 1, color: false }), bumpScale: 1.2, roughness: 0.95 };
};
/** Wire mesh as an opacity map: white wire, black holes. */
const meshImage = () => image('wall:mesh', 64, (g, N) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.strokeStyle = '#fff'; g.lineWidth = 2.2;
  for (let k = -N; k <= N * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + N, N); g.stroke(); g.beginPath(); g.moveTo(k, 0); g.lineTo(k - N, N); g.stroke(); }
});
export const chainLink = (rx, ry) => texture(meshImage(), { rx, ry, color: false });
