// The credit balance in the top bar, and the store behind it: what credits buy, what is owned, the ways to earn them,
// and, for the owner only, giving credits. Drawn with the rows the yard list and the log use, in a sheet like theirs.
// Everything shown comes from js/credits.js, which has it from the server; every button asks the server.
import { icon } from './icons.js';
import { fmt } from './format.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const KIND_ICON = { helper: 'team', look: 'eye' };   // a look changes how things look; the star is for ranks
const KIND_HEAD = { helper: 'Helpers', look: 'Looks', decor: 'For your site', service: 'Services' };
const hex = n => '#' + n.toString(16).padStart(6, '0');
const ABOUT = [
  'Credits are a second currency, apart from your money. You earn them by the tasks below, and the game\'s owner can give them.',
  'They buy convenience and looks only: nothing here changes what your company earns, or your place on the leaderboard.',
  'Your credits and what you own are kept on the server, with a record of every change. They need an account and a connection; without one, helpers and looks rest until the server answers.',
  'The server guarantees your balance, your items, and one charge for one purchase. It cannot stop a player from changing the game in their own browser, which is why nothing sold gives an edge over anyone.',
];

/** What the store says at the top, for each state of js/credits.js. */
export function storeNote(c) {
  switch (c.status) {
    case 'guest': return 'Credits are kept with an account. Sign in to earn them and to use what they buy.';
    case 'loading': return 'Asking the server…';
    case 'offline': return 'Credits need a connection. Helpers and looks rest until the server answers.';
    case 'ready': return `You have ${fmt(c.balance)} credit${c.balance === 1 ? '' : 's'}.` + (c.online ? '' : ' No connection now: this is what the server said earlier.');
    default: return '';
  }
}

/**
 * Bind the pill and the store to the game. @param game  the Game of js/main.js, with its credits, HUD, sound and account
 * @returns {{ open: () => void, render: () => void }}
 */
export function bindStore(game) {
  const c = game.credits, hud = game.hud, pill = $('credits-pill'), value = $('credits-value'), sheet = $('store'), list = $('store-list');
  let confirm = '', busy = '', message = null;   // the item asked to be confirmed, the request on its way, the last word from the server
  if (!pill || !sheet) return { open() {}, render() {} };

  const showPill = () => {
    pill.hidden = !c.offered || c.status === 'off';
    const shown = c.ready ? fmt(c.balance) : '';
    if (value.textContent !== shown) value.textContent = shown;
    pill.setAttribute('aria-label', c.ready ? `${shown} credits. Open the store` : 'Credits store');
  };
  const say = (text, good = false) => { message = text ? { text, good } : null; };
  const signIn = () => { hud.closeSheet(sheet); $('btn-account')?.click(); };

  /** One request at a time; the answer is said in the sheet, and a success is announced like an unlock. */
  const act = async (id, work, done) => {
    if (busy) return;
    busy = id; render();
    const r = await work();
    busy = ''; confirm = '';
    if (r.signIn) { signIn(); return; }
    if (r.ok) { say(''); done?.(r); game.feel ? game.feel('credits') : game.sfx.fanfare(); pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    else { say(r.error || 'Something went wrong. Try again.'); game.sfx.click(); }
    render();
  };

  function itemRow(it) {
    const row = el('div', 'row' + (it.owned ? ' owned' : it.short > 0 ? ' short' : '')), tile = el('span', 'r-icon'), body = el('span', 'r-body'), side = el('span', 'r-side');
    tile.append(icon(KIND_ICON[it.kind] || 'gem'));
    body.append(el('span', 'r-title', it.name), el('span', 'r-sub', it.desc));
    const price = el('span', 'r-price');
    if (it.owned) price.textContent = 'Owned';
    else { price.append(icon('gem', 'gem'), fmt(it.price)); }
    side.append(price);
    if (!it.owned && c.ready && it.short > 0) {   // not enough: how many more, and how far the balance goes
      body.append(el('span', 'r-needs', `${fmt(it.short)} more credit${it.short === 1 ? '' : 's'} needed`));
      const bar = el('span', 'r-bar'), fill = el('i'); fill.style.width = Math.round(Math.min(1, c.balance / it.price) * 100) + '%'; bar.append(fill); body.append(bar);
    }
    if (it.owned && it.choices) {   // a look: which of its choices is worn, picked here and kept on this device
      const picks = el('span', 'store-choices'), now = c.looks[it.does];
      for (const ch of it.choices) {
        const b = el('button', 'store-choice'); b.type = 'button';
        if (ch.shirt != null) { const dot = el('i'); dot.style.background = hex(ch.shirt); b.append(dot); }   // the shirt's colour, beside the name
        b.append(ch.name);
        b.setAttribute('aria-pressed', String(now === ch.id || (!now && ch === it.choices[0])));
        b.addEventListener('click', () => { c.setLook(it.does, ch.id); game.sfx.click(); });
        picks.append(b);
      }
      body.append(picks);
    }
    if (!it.owned) {
      // A guest's button says what it does: it opens the sign-in, it does not buy.
      const label = c.status === 'guest' ? 'Sign in' : busy === it.id ? '…' : confirm === it.id ? 'Confirm' : 'Get';
      const b = el('button', 'store-btn' + (confirm === it.id ? ' confirm' : ''), label); b.type = 'button';
      b.disabled = !!busy || (c.status !== 'guest' && (!c.ready || it.short > 0));
      b.addEventListener('click', () => {
        if (c.status === 'guest') { signIn(); return; }
        if (confirm !== it.id) { confirm = it.id; say(`Spend ${fmt(it.price)} credits on the ${it.name}? Tap Confirm.`, true); render(); return; }
        act(it.id, () => c.buy(it.id), () => hud.unlock({ title: it.name, desc: it.desc, kicker: 'Credits', symbol: 'gem' }));
      });
      side.append(b);
    }
    row.append(tile, body, side);
    return row;
  }

  function taskRow(t) {
    const row = el('div', 'row' + (t.claimed ? ' owned' : '')), tile = el('span', 'r-icon'), body = el('span', 'r-body'), side = el('span', 'r-side');
    tile.append(icon(t.claimed ? 'check' : 'goals'));
    body.append(el('span', 'r-title', t.name), el('span', 'r-sub', t.desc));
    if (t.have != null && !t.claimed && t.need > 1) {
      body.append(el('span', 'r-needs', `${Math.min(t.have, t.need)} of ${t.need}`));
      const bar = el('span', 'r-bar'), fill = el('i'); fill.style.width = Math.round(Math.min(1, t.have / t.need) * 100) + '%'; bar.append(fill); body.append(bar);
    }
    const reward = el('span', 'r-price'); reward.append(icon('gem', 'gem'), '+' + fmt(t.credits));
    side.append(reward);
    if (t.claimed) reward.textContent = 'Collected';
    else if (c.ready) {
      const b = el('button', 'store-btn', busy === 'task:' + t.id ? '…' : 'Collect'); b.type = 'button';
      b.disabled = !!busy || !t.done;
      b.addEventListener('click', () => act('task:' + t.id, () => c.claim(t.id), r => hud.unlock({ title: `+${fmt(r.credits || t.credits)} credits`, desc: t.name, kicker: 'Credits', symbol: 'gem' })));
      side.append(b);
    }
    row.append(tile, body, side);
    return row;
  }

  function giveForm() {
    const form = el('form', 'store-form'), field = (label, input) => { const l = el('label', '', label); l.append(input); return l; };
    const name = el('input'); name.name = 'username'; name.autocomplete = 'off'; name.maxLength = 20; name.placeholder = 'username';
    const amount = el('input'); amount.name = 'amount'; amount.type = 'number'; amount.min = '1'; amount.step = '1'; amount.inputMode = 'numeric'; amount.placeholder = '50';
    const note = el('input'); note.name = 'note'; note.maxLength = 200; note.placeholder = 'why (kept in the ledger)';
    const go = el('button', 'store-btn', busy === 'grant' ? '…' : 'Give'); go.type = 'submit'; go.disabled = !!busy;
    form.append(field('Player', name), field('Credits', amount), field('Reason', note), go);
    form.addEventListener('submit', e => {
      e.preventDefault?.();
      const n = Number(amount.value);
      if (!/^[A-Za-z0-9_]{3,20}$/.test(name.value.trim()) || !Number.isInteger(n) || n < 1) { say('Write a username and a whole number of credits.'); render(); return; }
      act('grant', () => c.grant(name.value.trim(), n, note.value.trim()), r => say(`${r.username} now has ${fmt(r.balance)} credits.`, true));
    });
    return form;
  }

  function render() {
    showPill();
    if (sheet.hidden) return;
    $('store-note').textContent = storeNote(c);
    const rows = [];
    if (message) { const m = el('div', 'store-msg ' + (message.good ? 'good' : 'bad'), message.text); m.setAttribute('role', 'status'); rows.push(m); }
    // A guest is told the one thing to do, as a button, before any price.
    if (c.status === 'guest') { const b = el('button', 'sheet-btn primary store-signin', 'Sign in or create account'); b.type = 'button'; b.addEventListener('click', signIn); rows.push(b); }
    const items = c.items();
    for (const kind of [...new Set(items.map(i => i.kind))]) {
      rows.push(el('div', 'store-head', KIND_HEAD[kind] || kind));
      for (const it of items.filter(i => i.kind === kind)) rows.push(itemRow(it));
    }
    // Without an account there is no email to confirm: that task is for players who have one.
    const tasks = c.tasks().filter(t => c.status !== 'guest' || t.rule !== 'email_confirmed');
    if (tasks.length) { rows.push(el('div', 'store-head', 'Earn credits')); for (const t of tasks) rows.push(taskRow(t)); }
    if (c.isOwner) { rows.push(el('div', 'store-head', 'Give credits (owner)')); rows.push(giveForm()); }
    rows.push(el('div', 'store-head', 'About credits'));
    for (const p of ABOUT) rows.push(el('div', 'sheet-note small', p));
    list.replaceChildren(...rows);
  }

  function open() {
    confirm = ''; say('');
    if (c.status !== 'ready' && c.status !== 'guest') c.refresh();   // ask again: perhaps the connection is back
    hud.openSheet(sheet);
    render();
  }

  pill.addEventListener('click', () => { game.sfx.click(); open(); });
  sheet.onclosed = () => { confirm = ''; say(''); };
  c.onChange(render);
  showPill();
  return { open, render };
}
