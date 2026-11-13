// The safety net. An uncaught error, a promise nobody handled or a script that did not load would otherwise
// leave the player looking at a frozen screen. This notices it and shows one calm sheet: reload, copy the
// details, or keep playing. Nothing is stored and nothing is sent anywhere: the details exist only so the
// player can pass them on.
//
// It imports nothing, so it cannot be taken down by the thing it watches, and js/main.js imports it first,
// so it is already listening while every other module starts. It cannot see a failure that stops main.js
// from starting at all (a missing or unreadable module in the page's own import list): for that the page
// would have to load this file with a script tag of its own, before main.js.

const QUIET = new Set(['AbortError', 'NotAllowedError', 'NotSupportedError', 'NetworkError', 'TimeoutError', 'QuotaExceededError', 'SecurityError', 'InvalidStateError']);
const MAX_KEPT = 5;

/**
 * What an "error" or "unhandledrejection" event means for the player: { kind, message, where, stack }, or null
 * when it is not the game breaking (a browser extension, a request that did not get through, a sound the
 * browser would not play). Pure, so the rules can be tested.
 */
export function problemFrom(type, e) {
  if (type === 'error') {
    const el = e.target && e.target.tagName ? e.target : null;
    if (el) {   // a file did not load; only a script takes the game down with it
      return el.tagName === 'SCRIPT' && el.src ? { kind: 'load', message: 'A part of the game did not load', where: el.src, stack: '' } : null;
    }
    const error = e.error, message = String(e.message || (error && error.message) || '');
    if (!message) return null;
    if (!error && /^Script error\.?$/i.test(message)) return null;                  // another site's script: no detail to go on
    if (/ResizeObserver loop/i.test(message)) return null;                           // a browser notice, not a failure
    if (/^[a-z-]+-extension:/i.test(String(e.filename || ''))) return null;
    const where = e.filename ? `${e.filename}:${e.lineno || 0}:${e.colno || 0}` : '';
    return { kind: 'error', message, where, stack: String((error && error.stack) || '') };
  }
  if (type === 'unhandledrejection') {
    const r = e.reason;
    if (!r || typeof r.name !== 'string' || typeof r.message !== 'string') return null;   // a rejection with no error in it says nothing
    if (QUIET.has(r.name)) return null;
    // A request that did not get through is the connection, not the game. A module that did not load is the game.
    if (r.name === 'TypeError' && /fetch|network|load failed/i.test(r.message) && !/module|import/i.test(r.message)) return null;
    return { kind: 'error', message: `${r.name}: ${r.message}`, where: '', stack: String(r.stack || '') };
  }
  return null;
}

/** The text behind "Copy details": what broke and where, plus the browser and the game version. Nothing about the player. */
export function detailsText(problems, { time = '', version = null, page = '', browser = '' } = {}) {
  const head = [
    'Yard Empire problem report',
    'Time: ' + time,
    'Version: ' + (version && version.commit ? `${version.commit}${version.date ? ' (' + version.date + ')' : ''}` : 'unknown'),
    'Page: ' + page,
    'Browser: ' + browser,
  ];
  const body = problems.map((p, i) => [`${i + 1}. ${p.message}`, p.where && '   at ' + p.where, p.stack && p.stack.split('\n').slice(0, 12).map(l => '   ' + l.trim()).join('\n')].filter(Boolean).join('\n'));
  return [...head, '', ...body].join('\n');
}

const problems = [];
let sheet = null, details = null, shown = false;

function report() {
  return detailsText(problems, {
    time: new Date().toISOString(), version: window.yardEmpireVersion || null,
    page: location.origin + location.pathname, browser: navigator.userAgent,
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function build() {
  if (!document.querySelector('link[data-platform-styles]')) {
    const link = el('link');
    link.rel = 'stylesheet'; link.href = 'css/platform.css'; link.dataset.platformStyles = '';
    document.head.append(link);
  }
  sheet = el('dialog', 'ye-oops');
  sheet.setAttribute('aria-labelledby', 'ye-oops-title');
  const title = el('h2', '', 'Something went wrong');
  title.id = 'ye-oops-title';
  const text = el('p', '', 'The game hit a problem and may have stopped. Reload to carry on from your last save.');
  details = el('pre', 'ye-oops-details');
  details.tabIndex = 0;   // long reports scroll, and a keyboard has to be able to reach them
  const reload = el('button', 'ye-oops-btn primary', 'Reload');
  const copy = el('button', 'ye-oops-btn', 'Copy details');
  const stay = el('button', 'ye-oops-btn quiet', 'Keep playing');
  for (const b of [reload, copy, stay]) b.type = 'button';
  reload.addEventListener('click', () => location.reload());
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(details.textContent); copy.textContent = 'Copied'; }
    catch {   // no clipboard here (an old browser, or a page that is not https): select the text for a manual copy
      getSelection().selectAllChildren(details);
      copy.textContent = 'Selected: copy it now';
    }
  });
  stay.addEventListener('click', () => sheet.close());
  sheet.append(title, text, details, reload, copy, stay);
  document.body.append(sheet);
}

function show(problem) {
  if (problems.length < MAX_KEPT) problems.push(problem);
  if (sheet && sheet.open) { details.textContent = report(); return; }
  if (shown) return;   // once per visit: a player who chose to keep playing is not asked again
  shown = true;
  try {
    if (!sheet) build();
    details.textContent = report();
    if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
  } catch { /* the net must never throw itself */ }
}

/** Start listening. Called once below when this file loads in a page. */
export function installErrorSheet() {
  // Capturing, because the "error" of a script that did not load does not bubble up to the window.
  addEventListener('error', e => { const p = problemFrom('error', e); if (p) show(p); }, true);
  addEventListener('unhandledrejection', e => { const p = problemFrom('unhandledrejection', e); if (p) show(p); });
}

// In a page, not under the test runner. A module runs once however many times it is imported, so this listens once.
if (typeof window !== 'undefined' && typeof document !== 'undefined') installErrorSheet();
