// The account sheet: create an account, sign in, change password, sign out. Opened from Settings.
import { passwordStrength } from './ui-logic.js';
import { showNotice } from './notice.js';

const $ = id => document.getElementById(id);
const SEEN_KEY = 'lumber-tycoon-account-seen';

/**
 * @param account {import('./account.js').Account}  @param hooks {{ onOpen?: () => void }}
 * @returns {{ offer: () => boolean }}  offer: show the sheet to a guest who has not been asked yet
 */
export function bindAccountUi(account, { onOpen } = {}) {
  const entry = $('btn-account');
  if (!account.supported) return { offer: () => false };   // no account server: the game plays as a guest, with no account buttons
  const sheet = $('account'), form = $('acc-form'), me = $('acc-me'), error = $('acc-error'), good = $('acc-ok');
  const name = $('acc-name'), pass = $('acc-pass'), submit = $('acc-submit');
  const pwForm = $('acc-pw-form'), pwError = $('acc-pw-error');
  let mode = 'new';

  const show = (el, message) => { el.textContent = message || ''; el.hidden = !message; };
  const setMode = next => {
    mode = next;
    $('acc-tab-new').classList.toggle('on', mode === 'new');
    $('acc-tab-in').classList.toggle('on', mode === 'in');
    submit.textContent = mode === 'new' ? 'Create account' : 'Sign in';
    pass.autocomplete = mode === 'new' ? 'new-password' : 'current-password';
    $('acc-hint').hidden = mode !== 'new';
    // By email (Supabase): the email is asked for both ways, the username only when the account is made.
    $('acc-email-field').hidden = !account.needsEmail;
    $('acc-name-field').hidden = account.needsEmail && mode !== 'new';
    $('acc-forgot').hidden = !(account.needsEmail && mode === 'in');   // a code can only be sent where accounts have an email
    show(error, ''); show(good, '');
    judge();
  };
  /**
   * Say in plain words how good a new password is, while it is typed. It only describes: what is
   * accepted is still the server's call, and signing in with an old password is never judged.
   */
  const meter = (box, input, username, wanted = true) => {
    const r = wanted ? passwordStrength(input.value, username) : { level: 0, text: '' };
    box.hidden = !r.text;
    box.dataset.level = String(r.level);
    box.querySelector('.pw-word').textContent = r.text;
  };
  const judge = () => meter($('acc-strength'), pass, name.value.trim(), mode === 'new');
  const judgeNew = () => meter($('acc-pw-strength'), $('acc-pw-new'), account.user?.username || '');
  /** Every password field can be shown, to check what was typed, and hidden again. */
  const hidePasswords = () => {
    for (const b of sheet.querySelectorAll('.pw-toggle')) {
      $(b.dataset.for).type = 'password';
      b.textContent = 'Show'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Show the password');
    }
  };
  /** @param byPlayer  the player asked for the sheet: the first field takes focus. Not when it opens by itself, where a phone keyboard would cover the yard unasked. */
  const open = (message, byPlayer = false, goodNews = false) => {
    sheet.hidden = false; account.open = true;
    pwForm.hidden = true; show(pwError, '');
    if (message) show(goodNews ? good : error, message);
    onOpen?.();
    if (byPlayer) (account.user ? $('acc-close') : account.needsEmail ? $('acc-email') : name).focus({ preventScroll: true });
  };
  const close = () => { sheet.hidden = true; account.open = false; pass.value = ''; show(error, ''); show(good, ''); hidePasswords(); judge(); if (!account.user && !byLink) endReset(); };   // a new password by link stays ready: the link works once
  /** Runs one request with the button disabled, so a slow network cannot send it twice. */
  const busy = async (button, label, work) => {
    const before = button.textContent;
    button.disabled = true; button.textContent = label;
    try { return await work(); } finally { button.disabled = false; button.textContent = before; }
  };

  // What the sheet and the Settings button show depends on who is playing.
  const user = account.user;
  entry.hidden = false;
  // A guest can lose everything with the browser's data: in Settings, "Save your progress" comes first for them (css: #settings.guest).
  $('settings')?.classList.toggle('guest', !user);
  form.hidden = !!user; me.hidden = !user;
  if (user) {
    entry.textContent = user.username;
    entry.classList.add('signed-in');
    $('acc-user').textContent = user.username;
    $('acc-avatar').textContent = user.username.slice(0, 1).toUpperCase();
    $('acc-status').textContent = account.online ? 'Your progress is saved to your account.' : 'Offline. Your progress will be saved when you are back online.';
    // The admin portal belongs to the small Python server. With accounts in the cloud it knows none of them, so it is not offered.
    $('acc-admin').hidden = user.role !== 'admin' || account.needsEmail;
  } else {
    entry.textContent = 'Sign in or create account';
  }

  entry.addEventListener('click', () => { $('btn-close').click(); open('', true); });
  for (const b of sheet.querySelectorAll('.pw-toggle')) {
    b.addEventListener('click', () => {
      const input = $(b.dataset.for), showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      b.textContent = showing ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', String(showing));
      b.setAttribute('aria-label', showing ? 'Hide the password' : 'Show the password');
    });
  }
  pass.addEventListener('input', judge);
  name.addEventListener('input', judge);   // a password that is the username is easy to guess
  $('acc-pw-new').addEventListener('input', judgeNew);
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  $('acc-guest').addEventListener('click', close);
  $('acc-close').addEventListener('click', close);
  $('acc-tab-new').addEventListener('click', () => setMode('new'));
  $('acc-tab-in').addEventListener('click', () => setMode('in'));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    show(error, ''); show(good, '');
    const r = await busy(submit, 'One moment…', () => {
      const email = $('acc-email').value.trim();
      if (mode === 'new') return account.register(name.value.trim(), pass.value, email);
      return account.signIn(account.needsEmail ? email : name.value.trim(), pass.value);
    });
    if (r.pending) {   // the account is made; it opens when the link in the email is used. Not an error, and nothing more to create.
      setMode('in');
      $('acc-email').value = r.email || ''; pass.value = ''; judge();
      return show(good, r.error);
    }
    if (!r.ok) show(error, r.error);   // on success the page reloads into the player's own game
  });

  $('acc-change').addEventListener('click', () => { pwForm.hidden = !pwForm.hidden; show(pwError, ''); if (!pwForm.hidden) $('acc-pw-current').focus(); });
  pwForm.addEventListener('submit', async e => {
    e.preventDefault();
    show(pwError, '');
    const r = await busy($('acc-pw-submit'), 'Saving…', () => account.changePassword($('acc-pw-current').value, $('acc-pw-new').value));
    if (!r.ok) return show(pwError, r.error);
    pwForm.reset(); pwForm.hidden = true; hidePasswords(); judgeNew();
    $('acc-status').textContent = 'Password changed. Other devices were signed out.';
  });
  // The player's own data: a copy to keep, and a way to have it all removed.
  const delForm = $('acc-del-form'), delError = $('acc-del-error');
  $('acc-export').addEventListener('click', async () => {
    const r = await busy($('acc-export'), 'Preparing…', () => account.exportData());
    // In the Android app the file goes through the share sheet, and the player may close it without choosing.
    $('acc-status').textContent = !r.ok ? r.error : r.how === 'cancelled' ? 'No file was made.' : r.how === 'shared' ? 'Your data is ready as a file.' : 'Your data was saved as a file.';
  });
  $('acc-delete').addEventListener('click', () => { delForm.hidden = !delForm.hidden; show(delError, ''); if (!delForm.hidden) $('acc-del-pass').focus(); });
  delForm.addEventListener('submit', async e => {
    e.preventDefault();
    show(delError, '');
    const r = await busy($('acc-del-submit'), 'Deleting…', () => account.deleteAccount($('acc-del-pass').value));
    if (!r.ok) show(delError, r.error);   // on success the page reloads as a guest
  });
  $('acc-signout').addEventListener('click', async () => {
    const r = await busy($('acc-signout'), 'Signing out…', () => account.signOut());
    if (!r.ok) $('acc-status').textContent = r.error;
  });

  // --- forgot password: a code by email, then the new password ---------------------------------------
  const reset = $('acc-reset-form'), resetError = $('acc-reset-error'), step2 = $('acc-reset-step2'), resetSubmit = $('acc-reset-submit');
  let sentTo = null;   // the email a code went to: the second step is showing
  let byLink = false;  // the player came by the link in the email: no code is asked, the link was the proof
  function endReset() {
    sentTo = null; byLink = false; reset.hidden = true; form.hidden = !!account.user; me.hidden = !account.user; step2.hidden = true;
    $('acc-reset-code-field').hidden = false; $('acc-reset-back').textContent = 'Back to sign in';
    $('acc-reset-email').readOnly = false; $('acc-reset-code').value = ''; $('acc-reset-pass').value = '';
    $('acc-reset-note').textContent = 'Enter the email of your account. We send a code to it.';
    resetSubmit.textContent = 'Send the code'; show(resetError, '');
  }
  $('acc-forgot').addEventListener('click', () => {
    form.hidden = true; reset.hidden = false;
    $('acc-reset-email').value = $('acc-email').value.trim();
    $('acc-reset-email').focus({ preventScroll: true });
  });
  $('acc-reset-back').addEventListener('click', () => { endReset(); setMode('in'); });
  reset.addEventListener('submit', async e => {
    e.preventDefault();
    show(resetError, '');
    const email = $('acc-reset-email').value.trim();
    if (byLink) {
      if ($('acc-reset-pass').value.length < 8) return show(resetError, 'Password must be 8 characters or more');
      const r = await busy(resetSubmit, 'One moment…', () => account.resetByLink($('acc-reset-pass').value));
      if (!r.ok) return show(resetError, r.error);
      if (r.signIn) {   // not the device that asked for the email: the password is changed, signing in is by hand
        endReset(); hidePasswords();
        if (!account.user) { setMode('in'); $('acc-email').value = r.email; show(good, 'Your password is changed. Sign in with it.'); }
        else $('acc-status').textContent = 'The password was changed.';
      }
      return;   // otherwise the page reloads, signed in
    }
    if (!sentTo) {
      if (!/^\S+@\S+\.\S+$/.test(email)) return show(resetError, 'Enter a valid email address');
      const r = await busy(resetSubmit, 'Sending…', () => account.forgotPassword(email));
      if (!r.ok) return show(resetError, r.error);
      sentTo = email; step2.hidden = false; $('acc-reset-email').readOnly = true;
      $('acc-reset-note').textContent = 'If an account has this email, an email is on its way. It can take a minute. Open the link in it, or enter the code from it here with a new password.';
      resetSubmit.textContent = 'Set the new password';
      return $('acc-reset-code').focus({ preventScroll: true });
    }
    if ($('acc-reset-pass').value.length < 8) return show(resetError, 'Password must be 8 characters or more');
    const r = await busy(resetSubmit, 'One moment…', () => account.resetPassword(sentTo, $('acc-reset-code').value, $('acc-reset-pass').value));
    if (!r.ok) show(resetError, r.error);   // on success the page reloads, signed in
  });

  setMode('new');
  if (account.reset) {   // the link in the "new password" email opened the game: only the new password is asked
    byLink = true; form.hidden = true; me.hidden = true; reset.hidden = false; step2.hidden = false;
    $('acc-reset-code-field').hidden = true;
    $('acc-reset-email').value = account.reset.email; $('acc-reset-email').readOnly = true;
    $('acc-reset-note').textContent = 'Choose a new password for this account.';
    resetSubmit.textContent = 'Set the new password'; $('acc-reset-back').textContent = 'Not now';
    open();
  }
  // The sheet shows by itself when there is news (signed out, suspended). A new guest is not asked at the start,
  // before having done anything: the game offers the account once, after the first purchase (offer, below).
  const flash = account.takeFlash();
  /**
   * Offer the account to a guest who has not been asked yet. The game calls this at a quiet moment after a purchase.
   * @returns true when the sheet was opened: it is opened once per browser
   */
  const offer = () => {
    if (user || account.open || account.reset) return false;
    try {
      if (localStorage.getItem(SEEN_KEY)) return false;
      localStorage.setItem(SEEN_KEY, '1');
    } catch { return false; }   // a browser that keeps nothing would be asked after every purchase: it is not asked
    setMode('new'); open();
    return true;
  };
  if (account.reset) return { offer };
  if (!user && flash) { setMode('in'); open(flash, false, account.flashGood); }
  else if (user && flash) showNotice('account', { text: flash, tone: 'gold', seconds: 8 });   // signed in by the link in the email
  return { offer };
}
