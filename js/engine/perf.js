// @ts-check
// How fast the game draws, measured every frame, and a small panel that shows it to whoever builds the game.
//
// FrameStats keeps the last two seconds of frames: the time between frames (what the player feels) and the script
// time of each (what a slow processor feels). The automatic graphics level (js/engine/quality.js) reads the same
// numbers. The panel is for development only: it appears with ?debug=gfx in the address (or after
// localStorage['yard-debug'] = 'gfx'), shows numbers about the drawing and nothing about the player or the account.
import { sharingStats } from './materials.js';
import { rendererName } from './renderer.js';

const KEEP = 120;   // frames remembered

export class FrameStats {
  constructor() { this.gaps = new Float32Array(KEEP); this.work = new Float32Array(KEEP); this.n = 0; }
  add(gapMs, workMs) { const i = this.n++ % KEEP; this.gaps[i] = gapMs; this.work[i] = workMs; }
  /** { fps, frameMs, frameP95, workMs, workP95 } over the frames remembered */
  read() {
    const n = Math.min(this.n, KEEP);
    if (!n) return { fps: 0, frameMs: 0, frameP95: 0, workMs: 0, workP95: 0 };
    const g = [...this.gaps.slice(0, n)].sort((a, b) => a - b), w = [...this.work.slice(0, n)].sort((a, b) => a - b);
    const avg = a => a.reduce((s, x) => s + x, 0) / a.length, p95 = a => a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
    return { fps: 1000 / avg(g), frameMs: avg(g), frameP95: p95(g), workMs: avg(w), workP95: p95(w) };
  }
}

/** True when the diagnostics were asked for. Reading storage can fail (private mode): then they were not. */
export function debugWanted() {
  try { return new URLSearchParams(location.search).get('debug') === 'gfx' || localStorage.getItem('yard-debug') === 'gfx'; } catch { return false; }
}

/** The graphics diagnostics: a corner of text over the game, refreshed twice a second. */
export class DebugPanel {
  /** @param game  reads game.renderer, game.stats, game.quality and game.autoQuality */
  constructor(game) {
    this.game = game; this.age = 0;
    const el = this.el = document.createElement('pre');
    el.id = 'gfx-debug'; el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {   // set from script, which the page's style policy allows
      position: 'fixed', left: '6px', bottom: '6px', zIndex: 9999, margin: 0, padding: '6px 8px', pointerEvents: 'none',
      font: '11px/1.35 ui-monospace, Menlo, monospace', color: '#d8f5d0', background: 'rgba(8,12,16,0.78)', borderRadius: '6px', whiteSpace: 'pre',
    });
    document.body.appendChild(el);
  }
  update(dt) {
    if ((this.age += dt) < 0.5) return;
    this.age = 0;
    const g = this.game, r = g.renderer, s = g.stats.read(), info = r.info, mem = performance.memory, share = sharingStats();
    const q = g.quality, auto = g.settings.graphics === 'auto';
    this.el.textContent = [
      `${s.fps.toFixed(0)} fps  frame ${s.frameMs.toFixed(1)} ms (p95 ${s.frameP95.toFixed(1)})`,
      `script ${s.workMs.toFixed(1)} ms (p95 ${s.workP95.toFixed(1)})`,
      `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k`,
      `geometries ${info.memory.geometries}  textures ${info.memory.textures}  shaders ${info.programs?.length ?? '?'}`,
      `shared: ${share.materials} materials, ${share.shapes} shapes`,
      `quality ${q.name}${auto ? ' (auto)' : ''}  pixels ×${r.getPixelRatio().toFixed(2)} of ${devicePixelRatio}${g.autoQuality?.scale < 1 ? ` (scaled ${g.autoQuality.scale})` : ''}`,
      `${rendererName(r)}${r.lost ? '  CONTEXT LOST' : ''}`,
      mem ? `heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : '',
    ].filter(Boolean).join('\n');
  }
}
