// @ts-check
// The renderer: made once, configured in one place, and kept alive when the device takes the graphics away.
//
// WebGL 2 through Three.js is the game's renderer on every device (see docs/graphics/README.md for why not WebGPU).
// A phone may drop the graphics context when the app goes to the background or memory runs short. Three.js stops
// drawing until the context is back and then uploads shapes, pictures and shaders again by itself; what it cannot
// remake is what was drawn into a texture once, at start: the sky's reflections (skyLight in js/world.js). That is
// made again here, and the game is told so that it can wait for the first good frame.
import * as THREE from 'three';

/**
 * @param {HTMLCanvasElement} canvas  the page's <canvas>
 * @param {{ remake?: () => void }} [o]  remake: called after the context came back, to make again what was drawn into textures once
 * @returns the renderer, with .lost (true while the context is gone)
 */
export function createRenderer(canvas, { remake } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // soft-edged in r187 (PCFSoftShadowMap is gone)
  // Bright sunlight is squeezed into what a screen can show the way a camera does it, instead of clipping to flat colour.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.lost = false;
  canvas.addEventListener('webglcontextlost', () => { renderer.lost = true; }, false);   // Three.js itself prevents the default
  canvas.addEventListener('webglcontextrestored', () => {
    renderer.lost = false;
    renderer.shadowMap.needsUpdate = true;
    remake?.();
  }, false);
  return renderer;
}

/** What the renderer is, for the diagnostics: the API and the Three.js release. */
export const rendererName = renderer => `${renderer.isWebGPURenderer ? 'WebGPU' : 'WebGL 2'} · three r${THREE.REVISION}`;
