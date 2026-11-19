// The ranking outside the Headquarters: the trophy button on the game's screen, with the player's place beside it,
// and the invitation to join that a signed-in player gets once.
//
// Until 19 November 2026 the ranking lived only in a tab of the Headquarters (on a phone, behind "More"), joining was a
// button on that tab, and nothing said that it was there: the live game had two players on it. The small rules are in
// js/sim/ranking.js; the tab itself is js/hq/people.js.
import { badgeText, shouldInvite, askedKey, placeText, oneList } from './sim/ranking.js';
import { showNotice } from './notice.js';
import { icon } from './icons.js';

const $ = id => document.getElementById(id);
const AGAIN = 60000;   // a look at the ranking that failed (no connection) is tried again after this long

/**
 * @param game  the Game: its account, company, tutorial and Headquarters are read
 * @returns {{ sync: () => void }}  sync: called every frame; shows the button once there is a company and looks at the ranking once a visit
 */
export function bindRanking(game) {
  const account = game.account, button = $('rank-btn'), badge = $('rank-place'), sheet = $('rank-invite'), join = $('rank-invite-join');
  if (!account.supported || !button) return { sync() {} };   // no account server: no ranking, and no button
  $('rank-icon').replaceChildren(icon('ranking'));
  let me = null, looked = false, looking = false, last = 0, due = 0, waiting = false;

  /** The all-time list says where the company stands: the place goes beside the trophy. */
  const show = data => {
    me = data?.me || null;
    const text = badgeText(me);
    badge.textContent = text; badge.hidden = !text;
    button.classList.toggle('placed', !!text);
    button.setAttribute('aria-label', text ? `Ranking: your company is ${text}` : 'Ranking');
  };
  // every list the Headquarters loads passes by here: the all-time one of everybody (or, on a server from before it, the main one) says the place
  game.onRanking = (data, how) => { if (!how.week && (oneList(data) || (how.ask !== 'boosted' && game.hq?.boardOne === false))) show(data); };

  const asked = () => { try { return !!localStorage.getItem(askedKey(account.user.id)); } catch { return true; } };   // a browser that keeps nothing is not asked at every visit
  const remember = () => { try { localStorage.setItem(askedKey(account.user.id), '1'); } catch { /* private mode */ } };
  const busy = () => !!(account.open || game.settingsOpen || game.hqOpen || game.offlineOpen || !sheet.hidden);
  const close = () => { sheet.hidden = true; account.open = false; };
  const invite = () => { waiting = false; sheet.hidden = false; account.open = true; join.focus({ preventScroll: true }); };

  join.addEventListener('click', async () => {
    remember();
    join.disabled = true; join.textContent = 'Joining…';
    const ok = await account.setListed(true);
    const data = ok ? await account.leaderboard(undefined, 'all') : null;
    join.disabled = false; join.textContent = 'Join the ranking';
    close();
    if (!ok) return showNotice('ranking', { text: 'Could not join just now. You can join in the Headquarters, on the Ranking tab.', seconds: 8 });
    if (data) { show(data); if (game.hq) game.hq.board = null; }   // the Headquarters asks again: its list is from before
    const place = data ? placeText(data.me, data.total) : '';
    showNotice('ranking', { text: place ? `You are on the ranking: ${place}.` : 'You are on the ranking.', tone: 'gold', seconds: 8,
      action: 'See it', onAction: () => game.hq.open('ranking') });
  });
  $('rank-invite-later').addEventListener('click', () => { remember(); close(); });
  button.addEventListener('click', () => { game.sfx?.click(); game.hq.open('ranking'); });

  /** Ask the server where this player stands: once a visit, for a signed-in player with a company. */
  const look = async () => {
    looking = true; last = Date.now();
    const data = await account.leaderboard(undefined, 'all');
    looking = false;
    if (!data) return;   // no connection: tried again in a minute
    looked = true;
    show(data);
    waiting = !!account.user && !asked() && data.me?.listed === false && !data.me.held;
  };

  return {
    sync() {
      const now = Date.now();
      if (now < due) return;
      due = now + 1000;
      const founded = !!game.company.founded;
      if (button.hidden === founded) button.hidden = !founded;
      if (!founded || !account.user) return;
      if (!looked && !looking && now - last > AGAIN && !game.tutorial.active) look();
      // the invitation waits for a quiet moment: no sheet open, the tutorial over
      if (waiting && shouldInvite({ user: account.user, founded, tutorial: game.tutorial.active, busy: busy(), asked: asked(), me })) invite();
    },
  };
}
