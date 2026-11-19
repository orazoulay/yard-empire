// @ts-check
// The ranking's small rules: what the Ranking tab, the Overview and the button on the game's screen make of the
// server's answer. Pure: no page, no server. The answer is the one of `leaderboard` (backend/api.py, and in production
// supabase/migrations/20261119180000_ranking.sql): { top, me } and, for the one list of everybody, also
// { board: 'all', total, around }.

/** Where this browser keeps that the player `id` was invited to join the ranking: once per account. */
export const askedKey = id => 'lumber-tycoon-rank-asked:u' + id;

/** The answer is the one list of everybody. Any other answer is one of the two lists of before (a server from before the one list). */
export function oneList(data) { return data?.board === 'all'; }

/** "#3 of 12", or "#3" where the server does not count the list; '' for a company with no place. */
export function placeText(me, total) {
  if (!me?.place) return '';
  return '#' + me.place + (total > 0 ? ' of ' + total : '');
}

/**
 * Whom the asking player is chasing: the company one place above, and what is missing to pass it.
 * @param week  the list of the week: what was gained since Monday is compared, not the company's value
 * @returns {{ username: string, gap: number } | null}  null for the first, for a company with no place, and where
 *          the answer does not hold the line above (the lists of before give no neighbours below the first twenty)
 */
export function nextAbove(data, week = false) {
  const me = data?.me;
  if (!me?.place || me.place < 2) return null;
  const above = [...(data.around || []), ...(data.top || [])].find(r => r.place === me.place - 1);
  if (!above) return null;
  const of = r => Number(week ? r.gain : r.value) || 0;
  return { username: above.username, gap: Math.max(0, of(above) - of(me)) };
}

/**
 * The lines drawn under the first twenty: the asking player's neighbours and their own line, for a player further
 * down than the list goes. Lines the list already shows are left out.
 */
export function belowTop(data) {
  const me = data?.me, top = data?.top || [];
  if (!me?.place || !Array.isArray(data.around) || top.some(r => r.place === me.place)) return [];
  const last = top.reduce((n, r) => Math.max(n, r.place), 0);
  return data.around.filter(r => r.place > last);
}

/** What the button on the game's screen says beside its trophy: the place, once it is known. */
export function badgeText(me) { return me?.place && me.listed && !me.held ? '#' + me.place : ''; }

/**
 * Invite this player to join the ranking now? Once per account, and only where joining does something they can see.
 * @param o.me  the server's word on the player ({ listed, held }), or null while it has not answered
 */
export function shouldInvite({ user, founded, tutorial, busy, asked, me }) {
  return !!user && !!founded && !tutorial && !busy && !asked && !!me && me.listed === false && !me.held;
}
