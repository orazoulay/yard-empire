// The status line: one small line over the yard for things the player should know but that must not stop
// the game: "A new version is ready", "You are offline", "Back online". It makes its own element and
// brings its own stylesheet (css/platform.css), so the page does not have to know about it.

/**
 * Which notice is showing. Several can be wanted at once (offline and an update waiting); the line shows the
 * most important one, and the newest among equals. Pure: no page, no timers.
 */
export class NoticeBoard {
  constructor() { this.wanted = new Map(); this.count = 0; }

  /** @param notice {{ text: string, priority?: number, action?: string, tone?: string }} */
  set(id, notice) { this.wanted.set(id, { priority: 0, ...notice, id, order: ++this.count }); }
  clear(id) { this.wanted.delete(id); }

  current() {
    let best = null;
    for (const n of this.wanted.values()) {
      if (!best || n.priority > best.priority || (n.priority === best.priority && n.order > best.order)) best = n;
    }
    return best;
  }
}

const board = new NoticeBoard();
const timers = new Map();
const actions = new Map();
let line = null, text = null, button = null;

function build() {
  if (!document.querySelector('link[data-platform-styles]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'css/platform.css'; link.dataset.platformStyles = '';
    document.head.append(link);
  }
  line = document.createElement('div');
  line.className = 'ye-notice'; line.hidden = true;
  line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite');
  const dot = document.createElement('span');
  dot.className = 'ye-notice-dot'; dot.setAttribute('aria-hidden', 'true');
  text = document.createElement('span');
  text.className = 'ye-notice-text';
  button = document.createElement('button');
  button.type = 'button'; button.className = 'ye-notice-btn';
  button.addEventListener('click', () => actions.get(board.current()?.id)?.());
  line.append(dot, text, button);
  document.body.append(line);
}

function render() {
  const now = board.current();
  if (!now) { if (line) line.hidden = true; return; }
  if (!line) build();
  // Written only when it changes, so a screen reader hears each message once.
  if (text.textContent !== now.text) text.textContent = now.text;
  button.hidden = !now.action;
  button.textContent = now.action || '';
  line.dataset.tone = now.tone || '';
  line.hidden = false;
}

/**
 * Show a line. `id` names it so it can be replaced or taken away; `action` and `onAction` add one button;
 * `seconds` takes it away by itself. A higher `priority` wins the line while both are wanted.
 */
export function showNotice(id, { text: message, action = '', onAction = null, tone = '', priority = 0, seconds = 0 }) {
  clearTimeout(timers.get(id));
  board.set(id, { text: message, action, tone, priority });
  if (onAction) actions.set(id, onAction); else actions.delete(id);
  if (seconds > 0) timers.set(id, setTimeout(() => hideNotice(id), seconds * 1000));
  render();
}

export function hideNotice(id) {
  clearTimeout(timers.get(id));
  timers.delete(id); actions.delete(id);
  board.clear(id);
  render();
}
