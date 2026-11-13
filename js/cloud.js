// The game's accounts and saves on Supabase, spoken to with plain web requests (no library).
//
// js/account.js asks the server things like "who am I" and "store this save" through one function,
// call(method, path, body). This module answers those same questions from a Supabase project, in the
// same shapes, so the rest of the game cannot tell which backend it has:
//   sign-in and passwords   -> Supabase Auth      (/auth/v1/...)
//   reading your own rows   -> the database       (/rest/v1/...), guarded by row level security
//   storing a save, deleting the account -> Edge Functions (/functions/v1/...)
// The key in the config is the public one. It only names the project; the rules in the database
// (supabase/migrations) decide what a player may read and write.

const SESSION_KEY = 'yard-empire-session';
const EARLY = 60;   // refresh the pass this many seconds before it runs out
const WAITING_KEY = 'yard-empire-awaiting';   // the email this device signed up with and whose confirmation link it is waiting for
const OLD_LINK = 'That link is too old or was already used. Sign in, or create the account again to get a new link.';

const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
const write = (store, key, value) => { try { value == null ? store.removeItem(key) : store.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

/**
 * What the link in a Supabase email brought back in the #part of the address: a pass, a problem, or nothing.
 * @returns {{ access_token, refresh_token, expires_in, type } | { problem: string } | null}
 */
export function readLink(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (q.get('access_token') && q.get('refresh_token')) return { access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in')) || 3600, type: q.get('type') || '' };
  if (q.get('error') || q.get('error_code')) return { problem: q.get('error_code') || q.get('error') };
  return null;
}
/** The email a pass was made out to. Only read to compare with the email this device signed up with; the server still checks the pass itself. */
function emailOf(pass) {
  try { return String(JSON.parse(atob(pass.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || '').toLowerCase() || null; } catch { return null; }
}
/** The page's address, where a link from an email arrives. Not there outside a browser. */
function pageLink() {
  const l = globalThis.location, h = globalThis.history;
  return l && h?.replaceState ? { hash: l.hash, clear: () => h.replaceState(h.state, '', l.pathname + l.search) } : null;
}

/** Supabase's own error texts, in the game's words. */
function plain(status, data) {
  const text = String(data?.msg || data?.error_description || data?.message || data?.error || '');
  if (/invalid login credentials/i.test(text)) return 'Email or password is wrong';
  if (/email not confirmed/i.test(text)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|already been registered/i.test(text)) return 'That email already has an account. Sign in instead.';
  if (/username must be/i.test(text) || /database error saving new user/i.test(text)) return 'Username must be 3 to 20 letters, numbers or underscores, and not taken.';
  if (/valid email|invalid format|email address .* is invalid/i.test(text)) return 'Enter a valid email address';
  if (/password/i.test(text) && /(at least|characters|weak|short)/i.test(text)) return 'Password must be 8 characters or more';
  if (/different from the old/i.test(text)) return 'The new password must differ from the current one';
  const wait = /only request this after (\d+) seconds/i.exec(text);
  if (wait) return `Wait ${wait[1]} seconds, then try again.`;
  // Supabase's own sender only sends a few emails an hour: "wait a minute" would not be true
  if (data?.error_code === 'over_email_send_rate_limit' || /email rate limit/i.test(text)) return 'Too many emails were sent in the last hour. Wait a while, then try again.';
  if (status === 429 || /rate limit|too many/i.test(text)) return 'Too many tries. Wait a minute and try again.';
  return data?.error && typeof data.error === 'string' && status !== 500 ? data.error : 'Something went wrong. Try again.';
}

/**
 * @param cfg    { url, key }: the project's address and its public key
 * @param deps   { fetch, storage, now, link }: replaced in tests. `link` is { hash, clear() }: the page's address, where an email link arrives
 * @returns call(method, path, body, { timeout, keepalive }) -> { status, ok, data }; never throws, status 0 = no connection
 */
export function supabaseTransport(cfg, { fetch: fetch_ = (...a) => fetch(...a), storage = globalThis.localStorage, now = () => Date.now(), link = pageLink() } = {}) {
  const base = cfg.url.replace(/\/+$/, '');
  let session = read(storage, SESSION_KEY);   // { access, refresh, expires (seconds), email }
  const keep = s => { session = s; write(storage, SESSION_KEY, s); };
  const fromTokens = d => ({ access: d.access_token, refresh: d.refresh_token, expires: Math.floor(now() / 1000) + (d.expires_in || 3600), email: d.user?.email || session?.email });

  // The player opened the link in the confirmation email and it brought them back here. The pass in the address is
  // taken only when this device is the one that signed up, with that same email: a link someone else made must not
  // sign a player in to an account that is not theirs. Either way it leaves the address bar at once.
  let news = null;       // what 'GET me' tells the player about the link: { note, good, signedIn }
  const arrived = link ? readLink(link.hash) : null;
  if (arrived) {
    try { link.clear(); } catch { /* the address stays; nothing else depends on it */ }
    const waiting = read(storage, WAITING_KEY), email = arrived.problem ? null : emailOf(arrived.access_token);
    if (arrived.problem) news = { note: OLD_LINK };
    else if (waiting && email && waiting === email) {
      session = null;
      keep(fromTokens({ ...arrived, user: { email } }));
      write(storage, WAITING_KEY, null);
      news = { note: 'Your email is confirmed. You are signed in.', good: true, signedIn: true };
    } else if (arrived.type === 'signup') news = { note: 'Your email is confirmed. Sign in to continue.', good: true };
  }

  /** One request. `as`: 'player' sends the signed-in player's pass, 'visitor' only the public key. */
  async function send(method, path, body, { as = 'player', timeout = 8000, keepalive = false } = {}) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    const headers = { apikey: cfg.key };
    if (as === 'player' && session) headers.Authorization = 'Bearer ' + session.access;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch_(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', keepalive, signal: ctl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { status: res.status, ok: res.ok, data };
    } catch {
      return { status: 0, ok: false, data: null };
    } finally { clearTimeout(timer); }
  }
  const fail = r => ({ status: r.status, ok: false, data: r.status === 0 ? null : { error: plain(r.status, r.data) } });
  const good = data => ({ status: 200, ok: true, data });

  /** Trade the long-lived pass for a fresh short one. False when the player has to sign in again. */
  async function refresh() {
    if (!session?.refresh) return false;
    const r = await send('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh }, { as: 'visitor' });
    if (r.status === 0) return null;                 // no connection: the old pass may still do
    if (!r.ok || !r.data?.access_token) { keep(null); return false; }
    keep(fromTokens(r.data));
    return true;
  }
  /** A request as the signed-in player, with a pass that is still good; one more try after a refused one. */
  async function asPlayer(method, path, body, opts) {
    if (!session) return { status: 401, ok: false, data: { error: 'Sign in first' } };
    if (session.expires - now() / 1000 < EARLY && (await refresh()) === false) return { status: 401, ok: false, data: { error: 'Sign in first' } };
    let r = await send(method, path, body, opts);
    if (r.status === 401 && (await refresh()) === true) r = await send(method, path, body, opts);
    if (r.status === 401) keep(null);
    return r;
  }
  async function profile() {
    const r = await asPlayer('GET', '/rest/v1/profiles?select=id,username,role,status,listed,created_at&limit=1');
    return r.ok ? { ok: true, row: Array.isArray(r.data) ? r.data[0] || null : null } : { ok: false, r };
  }
  const board = period => (session ? asPlayer : (m, p, b) => send(m, p, b, { as: 'visitor' }))('POST', '/rest/v1/rpc/leaderboard', { period: period === 'week' ? 'week' : 'all' });

  const routes = {
    /** Who is playing. Tells account.js that accounts exist here, and whether the pass on this device is still good. */
    async 'GET me'(body, opts) {
      const r = await routes.who(body, opts);
      if (news && r.ok) {   // said once, and truthfully: a pass the server refused did not sign anyone in
        const refused = news.signedIn && !r.data.user;
        r.data.note = refused ? OLD_LINK : news.note;
        r.data.noteGood = !!news.good && !refused;
        news = null;
      }
      return r;
    },
    async who() {
      if (!session) return good({ accounts: true, user: null });
      const p = await profile();
      if (!p.ok) return p.r.status === 0 ? { status: 0, ok: false, data: null } : good({ accounts: true, user: null });
      if (!p.row) { keep(null); return good({ accounts: true, user: null }); }
      if (p.row.status === 'banned') { keep(null); return good({ accounts: true, user: null, banned: true }); }
      return good({ accounts: true, user: { id: p.row.id, username: p.row.username, role: p.row.role } });
    },
    async 'POST register'({ username, email, password }) {
      const free = await send('POST', '/rest/v1/rpc/username_free', { name: String(username || '') }, { as: 'visitor' });
      if (free.status === 0) return fail(free);
      if (free.ok && free.data === false) return { status: 409, ok: false, data: { error: 'Username must be 3 to 20 letters, numbers or underscores, and not taken.' } };
      const r = await send('POST', '/auth/v1/signup', { email, password, data: { username } }, { as: 'visitor' });
      if (!r.ok) return fail(r);
      // Where emails are confirmed, Supabase answers a sign-up for an email that already has an account as if it were new,
      // only with no way of signing in listed, and sends nothing: waiting for that email would never end.
      if (!r.data?.access_token && Array.isArray(r.data?.identities) && r.data.identities.length === 0) return { status: 409, ok: false, data: { error: 'That email already has an account. Sign in instead.' } };
      // With "confirm email" on, Supabase creates the account but gives no pass until the link in the email is opened.
      if (!r.data?.access_token) {
        write(storage, WAITING_KEY, String(email || '').trim().toLowerCase());   // so the link may sign this device in when it comes back
        return { status: 202, ok: false, data: { pending: true, email, error: 'Almost done. Open the link we sent to your email. It brings you back to the game. If you are not signed in then, sign in here.' } };
      }
      keep(fromTokens(r.data));
      return good({ user: { id: r.data.user.id, username, role: 'player' } });
    },
    async 'POST login'({ email, password }) {
      const r = await send('POST', '/auth/v1/token?grant_type=password', { email, password }, { as: 'visitor' });
      if (!r.ok || !r.data?.access_token) return fail(r);
      keep(fromTokens(r.data));
      write(storage, WAITING_KEY, null);   // signed in by hand: no link is waited for any more
      const p = await profile();
      if (!p.ok || !p.row) { keep(null); return fail(p.ok ? { status: 500, data: null } : p.r); }
      if (p.row.status === 'banned') { keep(null); return { status: 403, ok: false, data: { error: 'This account is suspended.', banned: true } }; }
      return good({ user: { id: p.row.id, username: p.row.username, role: p.row.role } });
    },
    async 'POST logout'() {
      if (session) {
        const r = await send('POST', '/auth/v1/logout?scope=local', undefined);
        if (r.status === 0) return fail(r);       // stay signed in rather than leave a pass alive on the server
      }
      keep(null);
      return good({ ok: true });
    },
    async 'POST password'({ current, password }) {
      if (!session?.email) return { status: 401, ok: false, data: { error: 'Sign in first' } };
      const check = await send('POST', '/auth/v1/token?grant_type=password', { email: session.email, password: current }, { as: 'visitor' });
      if (check.status === 0) return fail(check);
      if (!check.ok) return { status: 403, ok: false, data: { error: 'Password is wrong' } };
      keep(fromTokens(check.data));
      const r = await asPlayer('PUT', '/auth/v1/user', { password });
      return r.ok ? good({ ok: true }) : fail(r);
    },
    /**
     * Forgot password, step one: Supabase emails a code to this address, if an account has it. The answer is
     * the same either way, so the form cannot be used to find out who has an account.
     */
    async 'POST password/forgot'({ email }) {
      const r = await send('POST', '/auth/v1/recover', { email }, { as: 'visitor' });
      if (r.status === 0 || r.status === 429) return fail(r);
      return good({ ok: true });
    },
    /** Step two: the code from the email proves who is asking; the new password is set, and they are signed in. */
    async 'POST password/reset'({ email, code, password }) {
      const v = await send('POST', '/auth/v1/verify', { type: 'recovery', email, token: String(code || '').trim() }, { as: 'visitor' });
      if (v.status === 0) return fail(v);
      if (!v.ok || !v.data?.access_token) return { status: 403, ok: false, data: { error: 'That code is wrong or too old. Ask for a new one.' } };
      keep(fromTokens(v.data));
      const r = await asPlayer('PUT', '/auth/v1/user', { password });
      if (!r.ok) { keep(null); return fail(r); }
      const p = await profile();
      if (!p.ok || !p.row) { keep(null); return fail(p.ok ? { status: 500, data: null } : p.r); }
      return good({ user: { id: p.row.id, username: p.row.username, role: p.row.role } });
    },
    async 'GET save'() {
      const r = await asPlayer('GET', '/rest/v1/saves?select=data,admin_rev,updated_at&limit=1');
      if (!r.ok) return fail(r);
      const row = Array.isArray(r.data) ? r.data[0] : null;
      return good({ save: row?.data ?? null, adminRev: row?.admin_rev ?? 0, updatedAt: row ? Date.parse(row.updated_at) : null });
    },
    async 'PUT save'(body, opts) {
      const r = await asPlayer('POST', '/functions/v1/save', body, opts);
      return r.ok || r.status === 409 || r.status === 0 ? r : fail(r);   // 409 carries the admin's version of the save
    },
    async 'POST account/delete'({ password }) {
      const r = await asPlayer('POST', '/functions/v1/account', { action: 'delete', password });
      if (!r.ok) return fail(r);
      keep(null);
      return good({ ok: true });
    },
    /** Everything kept about this player, gathered from the rows they may read. */
    async 'GET account/export'() {
      const p = await profile();
      if (!p.ok || !p.row) return fail(p.ok ? { status: 404, data: null } : p.r);
      const s = await asPlayer('GET', '/rest/v1/saves?select=data,value,stars,yards,suspect,updated_at&limit=1');
      if (!s.ok) return fail(s);
      const row = Array.isArray(s.data) ? s.data[0] : null;
      return good({
        account: { username: p.row.username, email: session?.email || null, role: p.row.role, joined: p.row.created_at, onLeaderboard: p.row.listed },
        save: row?.data ?? null,
        leaderboard: row ? { value: row.value, stars: row.stars, yards: row.yards, heldBack: row.suspect, savedAt: row.updated_at } : null,
      });
    },
    async 'GET leaderboard'() { const r = await board('all'); return r.ok ? r : fail(r); },
    async 'GET leaderboard?period=week'() { const r = await board('week'); return r.ok ? r : fail(r); },
    async 'POST leaderboard'({ listed }) {
      const r = await asPlayer('POST', '/rest/v1/rpc/set_listed', { p_listed: !!listed });
      if (!r.ok) return fail(r);
      const b = await board('all');
      return b.ok ? b : fail(b);
    },
  };

  const call = async (method, path, body, opts = {}) => {
    const route = routes[`${method} ${path}`];
    if (!route) return { status: 404, ok: false, data: { error: 'Something went wrong. Try again.' } };
    try { return await route(body || {}, opts); } catch { return { status: 0, ok: false, data: null }; }
  };
  call.needsEmail = true;   // the forms ask for an email: Supabase signs people in by it
  return call;
}
