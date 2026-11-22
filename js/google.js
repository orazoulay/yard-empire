// @ts-check
// How the game gets a Google ID token: a short signed note from Google that says whose Google account this is, made
// for this game. On the site it comes from Google's own button (Google Identity Services); in the Android app from
// Android's account chooser, through the app's own plugin (mobile/android: GoogleSignInPlugin.java). The rest of the
// game cannot tell which: it gets { token, nonce } and hands them to js/cloud.js ('POST google').
//
// The nonce: a random value made here for each request. Google is given its SHA-256 and writes that into the token;
// Supabase is given the value itself and compares the two. A token taken from one device is of no use on another.
//
// Google's file is the one thing the game loads from another site, and only when it is asked for here: when the
// account sheet is shown to a guest, or a player who signed in with Google opens "Delete my account"; never as the
// game starts. serve.py allows exactly this address, on the game's page only.
import { isNativeApp } from './pwa-detect.js';

export const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

/**
 * A value for one request and its SHA-256, both as hex.
 * @returns {Promise<{ raw: string, hashed: string }>}
 */
export async function noncePair(crypto_ = globalThis.crypto) {
  const raw = hex(crypto_.getRandomValues(new Uint8Array(32)));
  return { raw, hashed: hex(await crypto_.subtle.digest('SHA-256', new TextEncoder().encode(raw))) };
}

/** The site: Google's own button, drawn by Google's file. */
function webSource(clientId, win, doc, crypto_) {
  let loading = null;
  /** Google's file, asked for once. False when it did not come or did not set itself up; the next call asks again. */
  const load = () => loading || (loading = new Promise(done => {
    if (win.google?.accounts?.id) { done(true); return; }
    const s = doc.createElement('script');
    const end = ok => { if (!ok) { loading = null; s.remove?.(); } done(ok); };
    s.src = GOOGLE_SCRIPT; s.async = true;
    s.onload = () => end(!!win.google?.accounts?.id);
    s.onerror = () => end(false);
    doc.head.appendChild(s);
  }));
  return {
    kind: 'web',
    /**
     * Put Google's button in `element`. Each time the player chooses an account, onToken({ token, nonce }) is called.
     * @param width  how wide to draw it, in pixels: the caller gives the form's width, because the button's own box is
     *               still hidden while Google's file is on its way. Google draws it 200 to 400 wide.
     * @returns {Promise<boolean>}  false when Google's file could not be had: there is then no button
     */
    async mount(element, onToken, width = element.clientWidth) {
      if (!(await load())) return false;
      const pair = await noncePair(crypto_);
      const id = win.google.accounts.id;
      try {   // Google's own code: whatever it throws, the game goes on with no Google button
        id.initialize({
          client_id: clientId, nonce: pair.hashed, auto_select: false,
          use_fedcm_for_button: true,   // the browser's own account chooser where it has one (Google asks new sites to)
          callback: answer => { if (answer?.credential) onToken({ token: answer.credential, nonce: pair.raw }); },
        });
        id.renderButton(element, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', locale: 'en',
          width: Math.min(400, Math.max(200, Math.round(width || 300))),
        });
      } catch { return false; }
      return true;
    },
  };
}

/** The Android app: the button is the game's own, and a press asks Android's account chooser through the plugin. */
function appSource(clientId, plugin, crypto_) {
  return {
    kind: 'app',
    /** @returns {Promise<{ token: string, nonce: string } | { cancelled: true } | { unavailable: true }>} */
    async ask() {
      const pair = await noncePair(crypto_);
      try {
        const answer = await plugin.signIn({ clientId, nonce: pair.hashed });
        return answer?.idToken ? { token: String(answer.idToken), nonce: pair.raw } : { unavailable: true };
      } catch (e) {
        // Android hands Google's refusal of an app it does not know (no Android client for this signing key in Google
        // Cloud) over as a cancellation, "[16] Account reauth failed.": that is not the player closing the chooser.
        const closed = String(e?.code || '').toLowerCase() === 'cancelled' && !/reauth failed/i.test(String(e?.message || ''));
        return closed ? { cancelled: true } : { unavailable: true };
      }
    },
  };
}

/**
 * @param cfg   { google }: Google's client ID of this game (the "Web application" one, in the app too), '' for none
 * @param deps  { win, doc, crypto }: replaced in tests
 * @returns the way to ask Google here, or null where there is none: no client ID, an Android app built before the
 *          plugin, or a page that cannot make a hash. With null the game shows nothing of Google.
 */
export function googleSource(cfg, { win = globalThis, doc = globalThis.document, crypto: crypto_ = globalThis.crypto } = {}) {
  const clientId = String(cfg?.google || '');
  if (!clientId || !crypto_?.subtle || !crypto_.getRandomValues) return null;
  if (isNativeApp(win)) {
    const plugin = win.Capacitor.Plugins?.GoogleSignIn;
    if (!plugin?.signIn || win.Capacitor.isPluginAvailable?.('GoogleSignIn') === false) return null;
    return appSource(clientId, plugin, crypto_);
  }
  if (!doc?.createElement || !doc.head) return null;
  return webSource(clientId, win, doc, crypto_);
}
