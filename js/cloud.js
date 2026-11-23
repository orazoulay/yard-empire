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
const RESET_KEY = 'yard-empire-awaiting-reset';   // the email this device asked a new password for
const OLD_LINK = 'That link is too old or was already used. Sign in, or create the account again to get a new link.';
const GOOGLE_FAILED = 'Google sign-in did not work. Try again, or use your email.';
const GOOGLE_AGAIN = 'Continue with Google again, then choose a username.';
const EMAIL_TAKEN = 'That email already has an account. Sign in instead.';
const PROFILE = '/rest/v1/profiles?select=id,username,role,status,listed,created_at&limit=1';

const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
const write = (store, key, value) => { try { value == null ? store.removeItem(key) : store.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

/**
 * What the link in a Supabase email brought back in the address: a pass (in the #part), a one-time code to trade
 * for a pass (in the ?part, where the email is written that way), a problem, or nothing.
 * @returns {{ access_token, refresh_token, expires_in, type } | { token_hash, type } | { problem: string } | null}
 */
export function readLink(hash, search = '') {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (q.get('access_token') && q.get('refresh_token')) return { access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in')) || 3600, type: q.get('type') || '' };
  if (q.get('error') || q.get('error_code')) return { problem: q.get('error_code') || q.get('error') };
  const s = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (s.get('token_hash') && /^[a-z_]{3,20}$/.test(s.get('type') || '')) return { token_hash: s.get('token_hash'), type: s.get('type') };
  if (s.get('error') || s.get('error_code')) return { problem: s.get('error_code') || s.get('error') };
  return null;
}
/** The email a pass was made out to. Only read to compare with the email this device signed up with; the server still checks the pass itself. */
function emailOf(pass) {
  try { return String(JSON.parse(atob(pass.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || '').toLowerCase() || null; } catch { return null; }
}
/** The page's address, where a link from an email arrives. Not there outside a browser. */
function pageLink() {
  const l = globalThis.location, h = globalThis.history;
  return l && h?.replaceState ? { hash: l.hash, search: l.search, clear: query => h.replaceState(h.state, '', l.pathname + (query ? '' : l.search)) } : null;
}

/**
 * The Android app's own address: the phone opens the app for it (the intent filter in mobile/android's
 * AndroidManifest.xml), and js/native.js hands what the link carried to the game. The scheme is the app's ID, which
 * no other app on Google Play can have. Supabase follows it only while the project lists it under Redirect URLs.
 */
export const APP_LINK = 'com.yardempire.co.il://link';

/**
 * The game's own address, for the link in an email to come back to. Without it Supabase goes by where the request
 * came from, and a browser only tells it the site (https://name.github.io/), not the folder the game is in: the
 * link then ended on the host's "not found" page. In the Android app it is the app's own address (APP_LINK): the page
 * there is the phone's own (https://localhost/), which no link can come back to, and with nothing asked the link opened
 * the game's site in the phone's browser instead of the app. Empty outside a browser; Supabase then uses the address
 * set in the project.
 */
function pageHome() {
  const l = globalThis.location;
  if (!l || !/^https?:$/.test(l.protocol || '')) return '';
  if (globalThis.Capacitor?.isNativePlatform?.()) return APP_LINK;
  return l.origin + String(l.pathname || '/').replace(/[^/]*$/, '');
}

/** Supabase's own error texts, in the game's words. */
function plain(status, data) {
  const text = String(data?.msg || data?.error_description || data?.message || data?.error || '');
  if (/invalid login credentials/i.test(text)) return 'Email or password is wrong';
  if (/email not confirmed/i.test(text)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|already been registered/i.test(text)) return EMAIL_TAKEN;
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
 * @param deps   { fetch, storage, now, link, home }: replaced in tests. `link` is { hash, search, clear(query) }: the page's address, where an email
 *               link arrives. `home` is the game's own address, where such a link is asked to come back to
 * @returns call(method, path, body, { timeout, keepalive }) -> { status, ok, data }; never throws, status 0 = no connection
 */
export function supabaseTransport(cfg, { fetch: fetch_ = (...a) => fetch(...a), storage = globalThis.localStorage, now = () => Date.now(), link = pageLink(), home = pageHome() } = {}) {
  const base = cfg.url.replace(/\/+$/, '');
  const back = home ? '?redirect_to=' + encodeURIComponent(home) : '';   // on the requests that make Supabase send an email with a link
  let session = read(storage, SESSION_KEY);   // { access, refresh, expires (seconds), email }
  const keep = s => { session = s; write(storage, SESSION_KEY, s); };
  // How the account signs in, as Supabase lists it (['email', 'google']). A session from before the game knew of
  // Google has no list, and so has a pass given without one (the link in an email): both are accounts with a password.
  const waysOf = d => (Array.isArray(d.user?.app_metadata?.providers) ? d.user.app_metadata.providers.map(String) : session?.ways);
  const fromTokens = d => ({ access: d.access_token, refresh: d.refresh_token, expires: Math.floor(now() / 1000) + (d.expires_in || 3600), email: d.user?.email || session?.email, ways: waysOf(d) });
  const hasPassword = () => !session?.ways || session.ways.includes('email');
  const hasGoogle = () => !!session?.ways?.includes('google');

  // The player opened the link in an email and it brought them back here. Whatever it carried leaves the address
  // bar at once.
  //  - After signing up: the pass is taken only when this device is the one that signed up, with that same email.
  //    A link someone else made must not sign a player in to an account that is not theirs.
  //  - After "Forgot password?": the pass is kept in this page's memory only, to set the new password with.
  let news = null;       // what 'GET me' tells the player about the link: { note, good, signedIn } or { reset: { email } }
  let recovery = null;   // { tokens, email }: the pass of a "new password" link
  let unchecked = null;  // a link that carried a one-time code instead of a pass: traded for one by the first 'GET me'
  let unnamed = null;    // the answer to a first Google sign-in whose account has no username yet: kept in this page's memory only, until 'POST username'
  const take = (tokens, type) => {
    const email = String(tokens.user?.email || '').toLowerCase() || emailOf(tokens.access_token), waiting = read(storage, WAITING_KEY);
    if (type === 'recovery') {
      if (!email) { news = { note: OLD_LINK }; return; }
      recovery = { tokens, email };
      news = { reset: { email } };
    } else if (waiting && email && waiting === email) {
      session = null;
      keep(fromTokens({ ...tokens, user: { email } }));
      write(storage, WAITING_KEY, null);
      news = { note: 'Your email is confirmed. You are signed in.', good: true, signedIn: true };
    } else if (type === 'signup' || type === 'email') news = { note: 'Your email is confirmed. Sign in to continue.' + (home === APP_LINK ? '' : ' If you created the account in the app, go back to it and sign in there.'), good: true };
  };
  const inHash = link ? readLink(link.hash) : null, arrived = inHash || (link ? readLink('', link.search) : null);
  if (arrived) {
    try { link.clear(!inHash); } catch { /* the address stays; nothing else depends on it */ }   // what the link carried goes, from the #part or the ?part
    if (arrived.problem) news = { note: OLD_LINK };
    else if (arrived.token_hash) unchecked = arrived;
    else take(arrived, arrived.type);
  }

  /** One request. `as`: 'player' sends the signed-in player's pass, 'visitor' only the public key. */
  async function send(method, path, body, { as = 'player', timeout = 8000, keepalive = false, pass = null } = {}) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    const headers = { apikey: cfg.key };
    if (pass) headers.Authorization = 'Bearer ' + pass;   // one request with a pass that is not the session's (a "new password" link)
    else if (as === 'player' && session) headers.Authorization = 'Bearer ' + session.access;
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
    const r = await asPlayer('GET', PROFILE);
    return r.ok ? { ok: true, row: Array.isArray(r.data) ? r.data[0] || null : null } : { ok: false, r };
  }
  /** One change to credits. An answer the function gave on purpose (a refusal with its words) is passed on as it came. */
  async function creditsCall(body) {
    const r = await asPlayer('POST', '/functions/v1/credits', body);
    return r.ok || (r.status >= 400 && r.status < 500 && r.data?.code) || r.status === 0 ? r : fail(r);
  }
  /**
   * The ranking: with `which` 'all' the one list of everybody who joined (20261119180000_ranking.sql; a database from
   * before it answers with the main list), with 'boosted' the companies that bought something that changes what they
   * earn, otherwise the main list, which leaves those out.
   */
  const board = (period, which) => (session ? asPlayer : (m, p, b) => send(m, p, b, { as: 'visitor' }))('POST', '/rest/v1/rpc/leaderboard',
    { period: period === 'week' ? 'week' : 'all', ...(which === 'boosted' || which === 'all' ? { board: which } : {}) });

  const taken = cfg.google ? 'That email already has an account. Sign in, or continue with Google.' : EMAIL_TAKEN;
  const said = r => (r.data?.error === EMAIL_TAKEN ? { ...r, data: { ...r.data, error: taken } } : r);

  /**
   * A good pass for an account that has no username yet: a first sign-in with Google, or an account that left the name
   * form then and comes back by email. Nobody is signed in: the pass waits in this page's memory for 'POST username'.
   */
  const nameless = tokens => { unnamed = tokens; keep(null); return good({ choose: true }); };

  /** One request about a game played without an account (supabase/functions/guest). */
  const guestCall = async (as, body, opts) => {
    const r = as === 'player' ? await asPlayer('POST', '/functions/v1/guest', body, opts) : await send('POST', '/functions/v1/guest', body, { as: 'visitor', ...opts });
    return r.ok || r.status === 0 ? r : fail(r);
  };

  const routes = {
    /** Who is playing. Tells account.js that accounts exist here, and whether the pass on this device is still good. */
    async 'GET me'(body, opts) {
      if (unchecked) {   // the email's link carried a one-time code: the server trades it for a pass, once
        const v = await send('POST', '/auth/v1/verify', { type: unchecked.type, token_hash: unchecked.token_hash }, { as: 'visitor' });
        if (v.status === 0) return { status: 0, ok: false, data: null };
        const type = unchecked.type;
        unchecked = null;
        if (v.ok && v.data?.access_token) take(v.data, type); else news = { note: OLD_LINK };
      }
      const r = await routes.who(body, opts);
      if (news && r.ok) {   // said once, and truthfully: a pass the server refused did not sign anyone in
        const refused = news.signedIn && !r.data.user;
        if (news.note) { r.data.note = refused ? OLD_LINK : news.note; r.data.noteGood = !!news.good && !refused; }
        if (news.reset) r.data.reset = news.reset;   // the form for a new password opens, for this email
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
      return good({ accounts: true, user: { id: p.row.id, username: p.row.username, role: p.row.role }, password: hasPassword(), google: hasGoogle() });
    },
    async 'POST register'({ username, email, password }) {
      const free = await send('POST', '/rest/v1/rpc/username_free', { name: String(username || '') }, { as: 'visitor' });
      if (free.status === 0) return fail(free);
      if (free.ok && free.data === false) return { status: 409, ok: false, data: { error: 'Username must be 3 to 20 letters, numbers or underscores, and not taken.' } };
      const r = await send('POST', '/auth/v1/signup' + back, { email, password, data: { username } }, { as: 'visitor' });
      if (!r.ok) return said(fail(r));
      // Where emails are confirmed, Supabase answers a sign-up for an email that already has an account as if it were new,
      // only with no way of signing in listed, and sends nothing: waiting for that email would never end.
      if (!r.data?.access_token && Array.isArray(r.data?.identities) && r.data.identities.length === 0) return { status: 409, ok: false, data: { error: taken } };
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
      if (p.ok && !p.row) return nameless(r.data);   // made by Google and left without a name: the name is asked for now
      if (!p.ok || !p.row) { keep(null); return fail(p.ok ? { status: 500, data: null } : p.r); }
      if (p.row.status === 'banned') { keep(null); return { status: 403, ok: false, data: { error: 'This account is suspended.', banned: true } }; }
      return good({ user: { id: p.row.id, username: p.row.username, role: p.row.role } });
    },
    /**
     * Signing in with Google: js/google.js had a Google ID token made for `nonce`, and Supabase trades it for a pass
     * (it checks the token's signature, that it was made for this game, and the nonce). An email that has an account
     * already gets that account. An account that has no username yet is not signed in: its pass waits in this page's
     * memory for 'POST username', and the answer is { choose: true }.
     */
    async 'POST google'({ token, nonce }) {
      unnamed = null;
      const r = await send('POST', '/auth/v1/token?grant_type=id_token', { provider: 'google', id_token: token, nonce }, { as: 'visitor' });
      if (r.status === 0 || r.status === 429) return fail(r);
      if (!r.ok || !r.data?.access_token) return { status: r.status || 400, ok: false, data: { error: GOOGLE_FAILED } };
      const p = await send('GET', PROFILE, undefined, { pass: r.data.access_token });
      if (p.status === 0) return fail(p);
      if (!p.ok) return { status: p.status, ok: false, data: { error: GOOGLE_FAILED } };
      const row = Array.isArray(p.data) ? p.data[0] || null : null;
      if (!row) return nameless(r.data);
      if (row.status === 'banned') return { status: 403, ok: false, data: { error: 'This account is suspended.', banned: true } };
      keep(fromTokens(r.data));
      write(storage, WAITING_KEY, null);   // signed in: no link is waited for any more
      return good({ user: { id: row.id, username: row.username, role: row.role } });
    },
    /** The username of an account Google just opened (claim_username, supabase/migrations/20261121000000_google.sql). Then, and only then, the player is signed in. */
    async 'POST username'({ username }) {
      if (!unnamed) return { status: 403, ok: false, data: { error: GOOGLE_AGAIN } };
      const r = await send('POST', '/rest/v1/rpc/claim_username', { p_name: String(username || '') }, { pass: unnamed.access_token });
      if (r.status === 0) return fail(r);
      if (r.status === 401 || r.status === 403) { unnamed = null; return { status: 403, ok: false, data: { error: GOOGLE_AGAIN } }; }
      if (!r.ok) return fail(r);
      if (r.data?.ok !== true && r.data?.code !== 'named') {
        const code = r.data?.code === 'taken' ? 'taken' : 'invalid';
        return { status: 409, ok: false, data: { error: code === 'taken' ? 'That username is taken. Try another.' : 'Username must be 3 to 20 letters, numbers or underscores.', code } };
      }
      const tokens = unnamed;
      unnamed = null;
      keep(fromTokens(tokens));
      const p = await profile();
      if (!p.ok || !p.row) { keep(null); return fail(p.ok ? { status: 500, data: null } : p.r); }
      return good({ user: { id: p.row.id, username: p.row.username, role: p.row.role } });
    },
    /** Whether nobody has this username yet, for the name the form suggests. */
    async 'POST username/free'({ name }) {
      const r = await send('POST', '/rest/v1/rpc/username_free', { name: String(name || '') }, { as: 'visitor' });
      return r.ok ? good({ free: r.data !== false }) : fail(r);
    },
    /**
     * The player left the name form: the pass that waited is forgotten, and handed back to the server so that none is
     * left alive that nobody holds. Nothing was kept on the device. The account itself stays at Supabase, without a
     * profile: the next sign-in asks for the name again (legal/privacy.html says so).
     */
    async 'POST google/cancel'() {
      const held = unnamed;
      unnamed = null;
      if (held?.access_token) await send('POST', '/auth/v1/logout?scope=local', undefined, { pass: held.access_token });
      return good({ ok: true });
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
      const r = await send('POST', '/auth/v1/recover' + back, { email }, { as: 'visitor' });
      if (r.status === 0 || r.status === 429) return fail(r);
      write(storage, RESET_KEY, String(email || '').trim().toLowerCase());   // so the link in that email may sign this device in
      return good({ ok: true });
    },
    /**
     * Step two, by the link in the email: the pass it brought sets the new password. The player is signed in only on
     * the device that asked for the email; anywhere else the password is changed and they sign in by hand, so a link
     * someone else made cannot put a player into an account that is not theirs.
     */
    async 'POST password/link'({ password }) {
      if (!recovery) return { status: 403, ok: false, data: { error: OLD_LINK } };
      // the game's own rule, checked before the link is used: the server would take a shorter one, and the link works once
      if (String(password || '').length < 8) return { status: 400, ok: false, data: { error: 'Password must be 8 characters or more' } };
      const r = await send('PUT', '/auth/v1/user', { password }, { pass: recovery.tokens.access_token });
      if (r.status === 401 || r.status === 403) { recovery = null; return { status: 403, ok: false, data: { error: OLD_LINK } }; }
      if (!r.ok) return fail(r);
      const { tokens, email } = recovery, mine = read(storage, RESET_KEY) === email;
      recovery = null;
      write(storage, RESET_KEY, null);
      if (!mine) return good({ ok: true, email });
      keep(fromTokens({ ...tokens, user: { email } }));
      const p = await profile();
      if (!p.ok || !p.row || p.row.status === 'banned') { keep(null); return good({ ok: true, email }); }
      return good({ user: { id: p.row.id, username: p.row.username, role: p.row.role } });
    },
    /** Step two: the code from the email proves who is asking; the new password is set, and they are signed in. */
    async 'POST password/reset'({ email, code, password }) {
      const v = await send('POST', '/auth/v1/verify', { type: 'recovery', email, token: String(code || '').trim() }, { as: 'visitor' });
      if (v.status === 0) return fail(v);
      if (!v.ok || !v.data?.access_token) return { status: 403, ok: false, data: { error: 'That code is wrong or too old. Ask for a new one.' } };
      keep(fromTokens(v.data));
      write(storage, RESET_KEY, null);
      const r = await asPlayer('PUT', '/auth/v1/user', { password });
      if (!r.ok) { keep(null); return fail(r); }
      const p = await profile();
      if (p.ok && !p.row) return nameless(v.data);   // the password is set; the account still has no name
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
      if (r.status === 403 && r.data?.banned) return { status: 403, ok: false, data: { error: 'This account is suspended.', banned: true } };
      return r.ok || r.status === 409 || r.status === 0 ? r : fail(r);   // 409 carries the admin's version of the save
    },
    // A game played without an account (js/guest.js): no pass goes with it, except where it moves into the signed-in player's account.
    async 'POST guest/save'({ key, save }, opts) { return guestCall('visitor', { action: 'save', key, save }, opts); },
    async 'POST guest/load'({ key }, opts) { return guestCall('visitor', { action: 'load', key }, opts); },
    async 'POST guest/delete'({ key }, opts) { return guestCall('visitor', { action: 'delete', key }, opts); },
    async 'POST guest/move'({ key, save }, opts) { return guestCall('player', { action: 'move', key, save }, opts); },
    /** @param proof  { password }, or { google: { token, nonce } }: a Google ID token made just now, for an account that has no password */
    async 'POST account/delete'({ password, google }) {
      const proof = google ? { google: { id_token: google.token, nonce: google.nonce } } : { password };
      const r = await asPlayer('POST', '/functions/v1/account', { action: 'delete', ...proof });
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
        account: { username: p.row.username, email: session?.email || null, signIn: session?.ways || ['email'], role: p.row.role, joined: p.row.created_at, onLeaderboard: p.row.listed },
        save: row?.data ?? null,
        leaderboard: row ? { value: row.value, stars: row.stars, yards: row.yards, heldBack: row.suspect, savedAt: row.updated_at } : null,
      });
    },
    // Credits (supabase/migrations/20261113000000_credits.sql): read with the player's own pass, changed only through
    // the `credits` Edge Function. A refusal comes back as it is (409 short, 404 unknown...): the store shows its words.
    // The day's deal is asked for (p_deals): this game shows it and sends the price it showed with a purchase, so the
    // server never charges more (supabase/migrations/20261116000000_offers.sql). A server from before the offers has no
    // such argument and answers 404: it is asked again as before, and names no deal.
    async 'GET credits'() {
      let r = await asPlayer('POST', '/rest/v1/rpc/credits_state', { p_deals: true });
      if (r.status === 404) r = await asPlayer('POST', '/rest/v1/rpc/credits_state', {});
      return r.ok ? r : fail(r);
    },
    async 'POST credits/buy'({ item, key, price }) { return creditsCall({ action: 'buy', item, key, ...(Number.isInteger(price) ? { price } : {}) }); },
    async 'POST credits/claim'({ task }) { return creditsCall({ action: 'claim', task }); },
    async 'POST credits/grant'({ username, amount, note, key }) { return creditsCall({ action: 'grant', username, amount, note, key }); },
    async 'POST credits/gift'({ key }) { return creditsCall({ action: 'gift', key }); },
    async 'POST credits/exchange'({ key, price }) { return creditsCall({ action: 'exchange', key, price }); },
    /** What the store sells, for a visitor: the catalog's table is open to read (ids and prices of what is on sale). */
    async 'GET credits/offered'() {
      const r = await send('GET', '/rest/v1/credit_items?select=id,price&active=eq.true', undefined, { as: 'visitor' });
      return r.ok && Array.isArray(r.data) ? good({ items: r.data }) : fail(r);
    },
    async 'GET leaderboard'() { const r = await board('all'); return r.ok ? r : fail(r); },
    async 'GET leaderboard?period=week'() { const r = await board('week'); return r.ok ? r : fail(r); },
    async 'GET leaderboard?board=boosted'() { const r = await board('all', 'boosted'); return r.ok ? r : fail(r); },
    async 'GET leaderboard?period=week&board=boosted'() { const r = await board('week', 'boosted'); return r.ok ? r : fail(r); },
    async 'GET leaderboard?board=all'() { const r = await board('all', 'all'); return r.ok ? r : fail(r); },
    async 'GET leaderboard?period=week&board=all'() { const r = await board('week', 'all'); return r.ok ? r : fail(r); },
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
  call.guests = true;       // a game played without an account is kept here too (js/guest.js)
  call.needsEmail = true;   // the forms ask for an email: Supabase signs people in by it
  call.google = String(cfg.google || '');   // Google's client ID of this game, or '' where Google is not offered (js/google.js)
  return call;
}
