// Inside the Android app these pages take the game's place on the screen, so they need a way back to it:
// the phone's Back button, and a link that says so. In a browser this file does nothing: there the page
// opens in a tab of its own.
const app = globalThis.Capacitor;
if (app?.isNativePlatform?.()) {
  const back = () => { if (history.length > 1) history.back(); else location.href = '../'; };
  app.Plugins?.App?.addListener?.('backButton', back);
  const link = document.createElement('a');
  link.href = '../'; link.className = 'back'; link.textContent = '‹ Back to the game';
  link.addEventListener('click', e => { e.preventDefault(); location.href = '../'; });
  document.querySelector('header')?.before(link);
}
