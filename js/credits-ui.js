// The credit balance in the top bar, and the store behind it: what credits buy, in sections, what is owned, what can be
// bought again and how often today, the daily gift and the ways to earn credits, and, for the owner only, giving credits.
// Drawn with the rows the yard list and the log use, in a sheet like theirs.
// Everything shown comes from js/credits.js, which has it from the server; every button asks the server. What an item
// would do right now is asked of the game (game.storeWorth, js/game/store.js): an item that could do nothing is not sold.
// A helper with levels is one row: the level owned, what it gives, what the next level gives, and a button for that level.
// The offers: the day's deal is said first and marked on its row with what the item costs on other days; a pass that is
// owned says how long it still runs; the Monthly card's row has the button that collects today's; the piggy bank's row
// shows how full it is; and the Event ticket's row, once a ticket was bought, offers the events to choose from.
// An offer the server no longer sells keeps its row while the player has it running or waiting (js/credits.js, items):
// without a price and without Get, and with what the row does for what was bought before.
import { icon, emblemIcon } from './icons.js';
import { fmt } from './format.js';
import { helperText, itemTitle } from './sim/store.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const KIND_ICON = { helper: 'team', look: 'eye', boost: 'up', skip: 'clock', upgrade: 'upgrade', offer: 'bag' };   // a look changes how things look; the star is for ranks
/** The store's sections, in their order, and the kinds of item each holds. A section with nothing on sale is not shown. */
const SECTIONS = [['Boosts', ['boost', 'skip']], ['Upgrades', ['upgrade']], ['Helpers', ['helper']], ['Offers', ['offer']], ['Looks', ['look', 'decor']], ['Services', ['service']]];
const hex = n => '#' + n.toString(16).padStart(6, '0');
/**
 * The first button of a look's chooser: the game's own look, though the item is owned. Every look of the store's fifth
 * part has one, so a pick can always be taken back; the fence has it too (each yard's own fence). The Outfit colours
 * have none: their first choice is the player's own colours.
 */
const OWN = {
  fence: 'Each yard\'s own', emblem: 'No emblem', pets: 'No other pet', hat: 'Your helmet', uniform: 'Each trade\'s own', truck_paint: 'Each truck\'s own',
  skin: 'Each yard\'s own', floor: 'Each yard\'s own', shop: 'Each yard\'s own', sale_fx: 'Only the sparks', body: 'Yourself', sky: 'Day and night', decor: 'None', music: 'The game\'s own',
};
const FIRST = ['outfit', 'fence'];   // the looks of the first version: their picks are kept as they always were (js/credits.js, look)
const ABOUT = [
  'Credits are a second currency, apart from your money. You earn them with the daily gift and the tasks above, and the game\'s owner can give them.',
  'Some things here change what your company earns: cash, boosts, upgrades and most helpers, marked "Changes earnings". The first time you buy one, your company moves to the boosted ranking for good and leaves the main ranking. Looks, and the helpers without the mark, do not.',
  'Your credits and what you own are kept on the server, with a record of every change. They need an account and a connection; without one, upgrades, helpers, passes and looks rest until the server answers. A boost that is already running keeps running, and what a pass has for you waits.',
  'One item a day is sold at half price: the same for every player, chosen by the server, until its day ends at midnight UTC. The season is a calendar month by the same clock.',
  'The server guarantees your balance, your items, the daily limits and one charge for one purchase. It cannot stop a player from changing the game in their own browser, which is why companies that bought an edge are ranked apart.',
];
/**
 * What the store asks before a purchase: the price, and, before the first purchase that changes earnings, what it means
 * for the ranking. The item's name leads, as a title, so that every name reads well: "Open the next yard: spend 1
 * credit?", "Cash pack, 1 hour: this changes ...", "Runner, level 2: spend 90 credits?".
 */
export function confirmText(it, c) {
  const price = `${fmt(it.price)} credit${it.price === 1 ? '' : 's'}`, name = it.level > 0 ? `${it.name}, level ${it.level + 1}` : it.name;
  if (it.earning && !c.boosted) return `${name}: this changes what your company earns. Buying it moves your company to the boosted ranking for good, and off the main ranking. Spend ${price}? Tap Confirm.`;
  return `${name}: spend ${price}? Tap Confirm.`;
}
/** A stretch of time in words, rounded down to what matters: "12 days", "5 hours", "40 min" (never less than "1 min"). */
export function leftText(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min >= 2880) return `${Math.floor(min / 1440)} days`;
  if (min >= 120) return `${Math.floor(min / 60)} hours`;
  return `${min} min`;
}
/**
 * The day's deal in one line, for the top of the store's list. @param deal  js/credits.js: { item, price, was, until }
 * @param it  the deal's item as the store lists it, or undefined when this copy of the game does not know it
 * @param now  the time by the server's clock
 * @param why  why the item cannot be bought right now (the row says the same), or '' when it can
 */
export function dealText(deal, it, now, why = '') {
  if (!deal || !it) return '';
  const ends = `A new deal comes at midnight UTC, in ${leftText(deal.until - now)}.`;
  const name = itemTitle(it);   // a name that holds a comma reads as one thing: "Cash pack (4 hours)"
  if (it.owned) return `Today's deal is the ${name}, which you own. ${ends}`;
  return `Today's deal: ${name} for ${creditsText(deal.price)}, not ${fmt(deal.was)}.` + (why ? ` It cannot be bought right now. ${why}` : '') + ` ${ends}`;
}
/** "1 credit", "6 credits". */
const creditsText = n => `${fmt(n)} credit${n === 1 ? '' : 's'}`;
/** What the store says when an item's price is no longer the one the player was shown: "The price changed: the Machine rush now costs 6 credits." */
export const priceText = (name, price) => `The price changed: the ${itemTitle({ name })} now costs ${creditsText(price)}.`;
/** "1 hour", "4 hours". */
const hoursText = n => `${fmt(n)} hour${n === 1 ? '' : 's'}`;
/**
 * What the row of a pass that is owned says: how long it still runs, in the words of what it is.
 * @param it  the item as js/credits.js lists it (with `until`)  @returns the line, or '' for anything else
 */
export function passText(it, now) {
  if (it.mode !== 'pass' || !it.owned || !(it.until > now)) return '';
  const left = leftText(it.until - now);
  if (it.does === 'bundle') return `Bought. Sold again in ${left}.`;
  if (it.does === 'season') return `Yours until the month ends, in ${left}.`;
  return `Yours for ${left} more.`;
}

/**
 * The lines of a helper with levels (js/credits.js gives `levels` and `level`): which level is owned and what it gives,
 * and what the next one gives. @returns {{ text: string, off: boolean }[]}  off: said quietly (what is not owned yet)
 */
export function levelLines(it) {
  if (!(it.levels > 1)) return [];
  const t = helperText(it, it.level), out = [];
  if (it.level > 0) out.push({ text: `Level ${it.level} of ${it.levels}` + (t.now ? `: ${t.now}.` : ''), off: false });
  else out.push({ text: `${it.levels} levels, bought one by one, each at this price.`, off: true });
  if (it.level < it.levels && t.next) out.push({ text: `${it.level > 0 ? 'Next level' : 'Level 1'}: ${t.next}.`, off: true });
  return out;
}

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
  let confirmPrice = 0;                           // the price the confirmation named: the one sent with the purchase, so nothing dearer is charged
  let asked = 0;                                  // the end of the deal's day the server was last asked again for
  let minute = null, dealTimer = null, aimed = 0; // while the sheet is open: drawn again every minute, and when the deal's time ends
  if (!pill || !sheet) return { open() {}, render() {} };

  const showPill = () => {
    pill.hidden = !c.offered || c.status === 'off';
    const shown = c.ready ? fmt(c.balance) : '';
    if (value.textContent !== shown) value.textContent = shown;
    pill.setAttribute('aria-label', c.ready ? `${shown} credits. Open the store` : 'Credits store');
  };
  const say = (text, good = false) => { message = text ? { text, good } : null; };
  const signIn = () => { hud.closeSheet(sheet); $('btn-account')?.click(); };

  /**
   * One request at a time; the answer is said in the sheet, and a success is announced like an unlock.
   * @param again  what to say instead when the server answers that it had this request already (`again`): a purchase
   *               whose answer was lost and whose key was sent once more. Nothing new was bought, so nothing is announced.
   */
  const act = async (id, work, done, again = '', name = '') => {
    if (busy) return;
    busy = id; render();
    const r = await work();
    busy = ''; confirm = '';
    if (r.signIn) { signIn(); return; }
    if (r.ok && r.again && again) { say(again, true); game.sfx.click(); }
    else if (r.ok) { say(''); done?.(r); game.feel ? game.feel('credits') : game.sfx.fanfare(); pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    // the item costs more than the page showed (the day's deal ended, or the catalog changed): nothing was charged, and the row asks again
    else if (r.code === 'price' && name && r.price > 0) { say(`${priceText(name, r.price)} Nothing was charged.`); game.sfx.click(); }
    else { say(r.error || 'Something went wrong. Try again.'); game.sfx.click(); }
    render();
  };
  /** Why an item cannot be bought right now, as its row says it, or '' (owned items are not asked). */
  const whyNot = (it, worth, picking) => {
    if (picking) return 'A ticket you bought waits for its event: choose it on the Event ticket\'s row.';
    if (worth && !worth.usable) return worth.why || '';
    if (it.left === 0) return 'None are left for you today. More after midnight UTC.';
    return '';
  };
  /** The store's list, with the rows of what the player has running or waiting kept whether or not it is on sale (js/game/store.js, storeKeeps). */
  const listed = () => c.items(game.storeKeeps?.() || []);
  /** A waiting Event ticket: its row chooses, and sells no second one. The choice is a flag of the save: it needs no answer of the server. */
  const ticketWaits = it => it.does === 'event_ticket' && !game.storeUnknown && (game.ticketChoices?.().tickets || 0) > 0;

  function itemRow(it) {
    const row = el('div', 'row' + (it.owned ? ' owned' : it.short > 0 ? ' short' : '')), tile = el('span', 'r-icon'), body = el('span', 'r-body'), side = el('span', 'r-side');
    tile.append(icon(KIND_ICON[it.kind] || 'gem'));
    body.append(el('span', 'r-title', it.name), el('span', 'r-sub', it.desc));
    // What it would do right now (the game's rules say), how many are left today (the server says), and whether it changes earnings.
    const worth = !it.owned && game.storeWorth ? game.storeWorth(it) : null, blocked = !!worth && !worth.usable, none = it.left === 0;
    const picking = ticketWaits(it);   // a ticket waits: its row chooses, and sells no second one
    const off = it.sale === false;     // not on sale now: the row is for what was bought before, and sells nothing
    const price = el('span', 'r-price');
    if (it.owned) price.textContent = 'Owned';
    else if (picking) price.textContent = 'Bought';
    else if (off) price.textContent = 'Not on sale';
    else { price.append(icon('gem', 'gem'), fmt(it.price)); }
    side.append(price);
    if (it.was && !it.owned && !picking && !off) {   // the day's deal: what it costs on other days, beside the price, and said in words on the row
      side.append(el('span', 'r-was', `not ${fmt(it.was)}`));
      // in the ten minutes after midnight UTC, yesterday's deal is still charged at half: said as what it is, and for how long
      const mark = it.grace && c.grace ? `Yesterday's deal: half price for another ${leftText(c.grace.until - c.now())}` : 'Today\'s deal: half price';
      body.append(el('span', 'r-deal', mark));
    }
    for (const line of levelLines(it)) if (!off || !line.off) body.append(el('span', 'r-left r-level' + (line.off ? ' off' : ''), line.text));   // a row not on sale says the level owned, not the next to buy
    if (it.earning && !it.owned && !off) body.append(el('span', 'r-earns', 'Changes earnings'));
    if (worth?.cash && !off) body.append(el('span', 'r-worth', `Worth $${fmt(worth.cash)} now`));
    if (worth?.fill >= 0) {   // the piggy bank: how full it is, also while a purchase waits for it to fill
      const bar = el('span', 'r-bar r-fill'), fill = el('i'); fill.style.width = Math.round(worth.fill * 100) + '%'; bar.append(fill); body.append(bar);
    }
    if (worth?.note && worth.usable && !off) body.append(el('span', 'r-worth', worth.note));   // what it would do right now, in the rules' own words: "Opens Carpentry"
    if (blocked && !picking) body.append(el('span', 'r-worth off', worth.why));
    if (!it.owned && it.left != null && !picking) body.append(el('span', 'r-left' + (none ? ' off' : ''), none ? 'None left today. More after midnight UTC.' : `${it.left} left today`));
    if (!it.owned && c.ready && it.short > 0) {   // not enough: how many more, and how far the balance goes
      body.append(el('span', 'r-needs', `${fmt(it.short)} more credit${it.short === 1 ? '' : 's'} needed`));
      const bar = el('span', 'r-bar'), fill = el('i'); fill.style.width = Math.round(Math.min(1, c.balance / it.price) * 100) + '%'; bar.append(fill); body.append(bar);
    }
    offerLines(it, body, side);
    // A look: which of its choices is in force, picked here and kept on this device. One row of buttons for each set
    // of choices (the emblem has two: the emblem and its colour); a pick is applied at once (js/game/looks.js).
    if (it.owned && it.choices) for (const set of [...new Set(it.choices.map(ch => ch.set || ''))]) body.append(chooser(it, set));
    if (!it.owned && !picking && !off) {
      // A guest's button says what it does: it opens the sign-in, it does not buy.
      const label = c.status === 'guest' ? 'Sign in' : busy === it.id ? '…' : confirm === it.id ? 'Confirm' : it.level > 0 ? 'Next level' : 'Get';
      const b = el('button', 'store-btn' + (confirm === it.id ? ' confirm' : ''), label); b.type = 'button';
      b.disabled = !!busy || (c.status !== 'guest' && (!c.ready || it.short > 0 || none || blocked || !!game.storeUnknown));   // the saved game not checked yet: a purchase could not be applied
      b.addEventListener('click', () => {
        if (c.status === 'guest') { signIn(); return; }
        if (confirm !== it.id) { confirm = it.id; confirmPrice = it.price; say(confirmText(it, c), true); render(); return; }
        // the price the confirmation named goes with the purchase: the server charges no more than that (supabase/migrations/20261116000000_offers.sql)
        // announced with a card, unless it opened a yard and the sheet was closed under it: the yard has its own card (js/game/store.js, showGate)
        act(it.id, () => c.buy(it.id, confirmPrice), () => { if (!sheet.hidden || it.does !== 'open_gate') hud.unlock({ title: it.levels ? `${it.name}, level ${it.level + 1}` : it.name, desc: it.desc, kicker: 'Credits', symbol: 'gem' }); },
          'Your earlier purchase went through. Nothing more was charged.', it.name);
      });
      side.append(b);
    }
    row.append(tile, body, side);
    return row;
  }

  /**
   * The buttons of one set of a look's choices, the one in force marked; the first is the game's own look where there
   * is one to go back to. A set is a group named for what it chooses (the emblem's second set: its colour), and each
   * button carries its row, set and choice (data-pick), so that the focus finds it again once the page is drawn anew.
   */
  function chooser(it, set) {
    const picks = el('span', 'store-choices'), old = FIRST.includes(it.does), list = it.choices.filter(ch => (ch.set || '') === set);
    picks.setAttribute('role', 'group'); picks.setAttribute('aria-label', set ? `${it.name} ${set}` : it.name);
    const now = old ? (list.some(ch => ch.id === c.looks[it.does]) ? c.looks[it.does] : it.does === 'fence' ? '' : list[0].id) : c.picked(it, set);
    const button = (id, name, ch) => {
      const b = el('button', 'store-choice'); b.type = 'button';
      const colour = ch?.shirt ?? ch?.colour ?? ch?.paint;
      if (colour != null) { const dot = el('i'); dot.style.background = hex(colour); b.append(dot); }   // the colour it is, beside the name
      if (ch && it.does === 'emblem' && !set) b.append(emblemIcon(ch.id));
      b.append(name);
      b.setAttribute('aria-pressed', String(now === id)); b.dataset.pick = `${it.id}|${set}|${id}`;
      b.addEventListener('click', () => { c.setLook(it.does, id, set); game.sfx.click(); });
      picks.append(b);
    };
    if (!set && OWN[it.does]) button(old ? '' : 'none', OWN[it.does], null);
    for (const ch of list) button(ch.id, ch.name, ch);
    return picks;
  }

  /**
   * What the rows of the offers add: how long an owned pass still runs, the season's standing, the Monthly card's
   * daily collection, and the events a waiting Event ticket can start. Each asks the game, which asks the rules.
   */
  function offerLines(it, body, side) {
    const now = c.now(), pass = passText(it, now);
    if (pass) body.append(el('span', 'r-left', pass));
    if (it.does === 'season') {
      const s = game.seasonNow?.();
      if (s && it.owned) body.append(el('span', 'r-worth' + (s.rewards ? '' : ' off'), s.rewards ? `${s.rewards === 1 ? 'A boost waits' : `${s.rewards} boosts wait`} for you on the Goals tab of your Headquarters.` : `Step ${s.step} of ${s.steps}. Each new step brings a boost, collected on the Goals tab.`));
      else if (s && !it.owned && it.sale !== false) body.append(el('span', 'r-left', s.ends > now ? `The season of ${s.name} ends in ${leftText(s.ends - now)}. The pass ends with it.` : `The season of ${s.name} has ended, and closes once the store has answered.`));
      // a closed month's rewards wait in the saved game for the store's word: they come by themselves (js/sim/store.js, seasonStep)
      if (it.sale === false && !it.owned) for (const o of game.seasonOwedNow?.() || []) body.append(el('span', 'r-worth', `The boosts of your Season pass of ${o.name} that you had not collected come by themselves once the store has said the pass was yours.`));
    }
    if (it.does === 'card' && it.owned) {
      const card = game.cardNow?.();
      if (card?.ready) {
        const b = el('button', 'store-btn', 'Collect'); b.type = 'button'; b.disabled = !!busy;
        b.addEventListener('click', () => {
          const got = game.collectCard();
          if (got?.full) say(got.full.why);   // nothing was collected: no room for one of its items to start or wait
          else if (got) { say(`Collected: ${got.gave.map(g => itemTitle(g.item)).join(' and ')}.`, true); game.feel ? game.feel('credits') : game.sfx.fanfare(); } else say('There is nothing to collect right now.');
          render();
        });
        body.append(el('span', 'r-worth', `Today's: ${card.gives.map(itemTitle).join(' and ')}.`));   // a name that holds a comma reads as one thing
        side.append(b);
      } else if (card) {
        // the day turns at the player's own midnight; on the card's last day there is no tomorrow's
        const line = card.unsure ? 'Today\'s can be collected once the store has said the time again.' : card.taken ? (card.final ? 'Collected today: that was the card\'s last day.' : 'Collected today. Tomorrow\'s comes at your midnight.') : 'Nothing more to collect on this card.';
        body.append(el('span', 'r-worth off', line));
      }
    }
    if (ticketWaits(it)) {
      const t = game.ticketChoices();
      body.append(el('span', 'r-worth', `${t.tickets === 1 ? 'Your ticket is' : `${t.tickets} tickets are`} ready. Choose the event: it runs for ${hoursText(t.hours)} from now.`));
      // nothing can be chosen now: said once, above the buttons, with when it can (each button says why too)
      if (t.events.length && t.events.every(e => e.running || e.why)) {
        const why = t.events.find(e => e.why && !e.running)?.why;
        body.append(el('span', 'r-worth off', t.events.every(e => e.running) ? 'Every event runs now. Choose one once it has ended: the ticket waits.' : `No event can be chosen right now: the ticket waits. ${why}`));
      }
      const picks = el('span', 'store-choices store-events');
      for (const e of t.events) {
        const b = el('button', 'store-choice store-event'); b.type = 'button'; b.disabled = e.running || !!e.why;
        // an event counts once: on the eve of the calendar's own, a ticket adds only the hours before it (Company.ticketChoices)
        const adds = e.adds < t.hours ? `${e.desc}. Adds ${hoursText(e.adds)}: the calendar brings the rest` : e.desc;
        b.append(el('b', '', e.name), el('span', '', e.running ? 'Runs now' : e.why || adds));
        b.addEventListener('click', () => {
          if (game.chooseEvent(e.id)) { say(`${e.name} has started.`, true); game.feel ? game.feel('credits') : game.sfx.fanfare(); } else say(e.why || 'That event cannot start right now.');
          render();
        });
        picks.append(b);
      }
      body.append(picks);
    }
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

  /** The daily gift: one row, with a button while today's is still there. Only where the server has one, and for a signed-in player. */
  function giftRow(g) {
    const row = el('div', 'row' + (g.ready ? '' : ' owned')), tile = el('span', 'r-icon'), body = el('span', 'r-body'), side = el('span', 'r-side');
    tile.append(icon(g.ready ? 'gem' : 'check'));
    body.append(el('span', 'r-title', 'Daily gift'), el('span', 'r-sub', g.ready ? 'Free credits, once a day.' : 'Collected. The next one is ready after midnight UTC.'));
    const reward = el('span', 'r-price'); reward.append(icon('gem', 'gem'), '+' + fmt(g.credits));
    side.append(reward);
    if (g.ready) {
      const b = el('button', 'store-btn', busy === 'gift' ? '…' : 'Collect'); b.type = 'button';
      b.disabled = !!busy;
      b.addEventListener('click', () => act('gift', () => c.gift(), r => hud.unlock({ title: `+${fmt(r.credits || g.credits)} credits`, desc: 'Daily gift', kicker: 'Credits', symbol: 'gem' })));
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
    // The item waiting for its Confirm has another price now (the deal ended, the server's prices changed): the
    // confirmation goes, the row is back to Get, and the new price is said. Nothing is bought at a price not shown.
    const asking = confirm && listed().find(i => i.id === confirm && i.sale !== false);
    if (confirm && !busy && (!asking || asking.price !== confirmPrice)) {
      confirm = '';
      say(asking ? priceText(asking.name, asking.price) : 'This is no longer on offer.');
    }
    if (message) { const m = el('div', 'store-msg ' + (message.good ? 'good' : 'bad'), message.text); m.setAttribute('role', 'status'); rows.push(m); }
    // The store block of the saved game is not known yet (js/game/store.js, bindStoreRules): nothing is sold until it is.
    // Looks are no part of the save: one that is owned is chosen meanwhile, and the page says so when there is one.
    if (game.storeUnknown && c.ready) {
      const choosing = listed().some(i => i.owned && i.choices);
      rows.push(el('div', 'sheet-note small store-unsure', 'Nothing can be bought until your saved game has been checked with the server. That happens by itself as soon as the server answers.' + (choosing ? ' Looks you own can be chosen now.' : '')));
    }
    // A guest is told the one thing to do, as a button, before any price.
    if (c.status === 'guest') { const b = el('button', 'sheet-btn primary store-signin', 'Sign in or create account'); b.type = 'button'; b.addEventListener('click', signIn); rows.push(b); }
    // Purchases that could do nothing yet (no build running, every machine full): kept, and said here until they are used.
    for (const held of game.storeHeld || []) rows.push(el('div', 'sheet-note small store-held', `${held.name} is kept for later. ${held.why}`));
    // What the Monthly card or the season handed out and could not start yet: in the save, and given by itself.
    for (const due of game.storeWaiting?.() || []) rows.push(el('div', 'sheet-note small store-held', `${due.name} is kept for later. ${due.why}`));
    const items = listed(), dealItem = items.find(i => i.id === c.deal?.item && i.sale !== false);
    const deal = dealText(c.deal, dealItem, c.now(), dealItem && !dealItem.owned ? whyNot(dealItem, game.storeWorth ? game.storeWorth(dealItem) : null, ticketWaits(dealItem)) : '');
    if (deal) rows.push(el('div', 'store-deal', deal));
    // The deal's time ended while the store was open: ask again, once, so that the new day's prices are shown. Until the
    // answer, an item whose half price is over shows its usual price (js/credits.js), whatever the network does.
    const ends = c.dealEnds;
    if (ends && c.now() >= ends && asked !== ends) { asked = ends; c.refresh(); }
    aim(ends);
    for (const [head, kinds] of SECTIONS) {
      const section = items.filter(i => kinds.includes(i.kind));
      if (!section.length) continue;
      rows.push(el('div', 'store-head', head));
      for (const it of section) rows.push(itemRow(it));
    }
    // Without an account there is no email to confirm: that task is for players who have one.
    const tasks = c.tasks().filter(t => c.status !== 'guest' || t.rule !== 'email_confirmed'), gift = c.daily;
    if (tasks.length || gift) {
      rows.push(el('div', 'store-head', 'Earn credits'));
      if (gift) rows.push(giftRow(gift));
      for (const t of tasks) rows.push(taskRow(t));
    }
    if (c.isOwner) { rows.push(el('div', 'store-head', 'Give credits (owner)')); rows.push(giveForm()); }
    rows.push(el('div', 'store-head', 'About credits'));
    for (const p of ABOUT) rows.push(el('div', 'sheet-note small', p));
    // A pick draws the page again (every row is new): the keyboard stays on the same button of the same row.
    const focused = document.activeElement, pick = focused && list.contains?.(focused) !== false && focused.dataset?.pick;
    list.replaceChildren(...rows);
    if (pick) for (const b of list.querySelectorAll('.store-choice')) if (b.dataset.pick === pick) { b.focus(); break; }
  }

  /**
   * While the sheet is open the game is paused under it and nothing else draws it: a timer draws it every minute (the
   * countdowns, the card's day at the player's midnight), and one more at the moment the deal's time ends (`ends`).
   */
  function aim(ends) {
    if (sheet.hidden || !ends || ends === aimed || ends <= c.now()) return;
    aimed = ends;
    clearTimeout(dealTimer);
    dealTimer = setTimeout(render, ends - c.now() + 1000);
    dealTimer?.unref?.();
  }
  function rest() { clearInterval(minute); clearTimeout(dealTimer); minute = dealTimer = null; aimed = 0; }

  function open() {
    confirm = ''; say('');
    if (c.status !== 'guest') c.refresh();   // ask again: the connection may be back, and the server's day (the limits, the gift) may have turned
    hud.openSheet(sheet);
    rest();
    minute = setInterval(() => { if (sheet.hidden) rest(); else render(); }, 60000);
    minute?.unref?.();
    render();
  }

  pill.addEventListener('click', () => { game.sfx.click(); open(); });
  sheet.onclosed = () => { confirm = ''; say(''); rest(); };
  c.onChange(render);
  showPill();
  return { open, render, close: () => { if (!sheet.hidden) hud.closeSheet(sheet); } };
}
