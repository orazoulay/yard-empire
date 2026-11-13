// The "delete your account" page: sign in with email and password, then ask the server to remove the
// account. It uses the game's own way of talking to the backend (js/cloud.js), so the password is
// checked again on the server, exactly as when the account is deleted from inside the game.
import { CLOUD } from '../js/config.js';
import { supabaseTransport } from '../js/cloud.js';

const $ = id => document.getElementById(id);
const form = $('delete-form'), problem = $('problem'), button = $('submit');
const say = text => { problem.textContent = text || ''; problem.hidden = !text; };

// A session of its own, kept only in this page's memory: deleting an account here must not sign a
// player in or out of a game open in another tab.
const memory = new Map();
const storage = { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
const call = CLOUD.url ? supabaseTransport(CLOUD, { storage }) : null;

form.addEventListener('submit', async e => {
  e.preventDefault();
  say('');
  if (!call) return say('Accounts are not set up for this copy of the game.');
  const email = $('email').value.trim(), password = $('password').value;
  if (!email || !password) return say('Enter the email and the password of the account.');
  button.disabled = true; button.textContent = 'Deleting…';
  try {
    const signIn = await call('POST', 'login', { email, password });
    if (!signIn.ok) return say(signIn.status === 0 ? 'No connection. Try again.' : signIn.data?.error || 'Something went wrong. Try again.');
    const gone = await call('POST', 'account/delete', { password });
    if (!gone.ok) return say(gone.status === 0 ? 'No connection. Try again.' : gone.data?.error || 'Something went wrong. Try again.');
    form.hidden = true; $('done').hidden = false;
  } finally {
    button.disabled = false; button.textContent = 'Delete my account for good';
  }
});
