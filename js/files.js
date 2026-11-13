// Handing the player a file the game made: a backup of the save, or a copy of what their account holds.
// In a browser that is a download. Inside the Android app (mobile/) a page cannot download, so the file is
// written to the app's own temporary folder and the phone's share sheet is opened on it: the player picks
// where it goes (Drive, Files, an email to themselves).
import { isNativeApp } from './pwa-detect.js';

/**
 * @param name  the file's name
 * @param text  what is in it
 * @param type  its MIME type, for the browser
 * @returns {Promise<'saved'|'shared'|'cancelled'|'failed'>} 'saved': the browser took the download.
 *   'shared': the player sent it somewhere from the share sheet. 'cancelled': they closed the sheet.
 */
export async function saveFile(name, text, type = 'application/json', win = globalThis) {
  if (isNativeApp(win)) {
    const { Filesystem, Share } = win.Capacitor.Plugins || {};
    if (!Filesystem || !Share) return 'failed';
    try {
      const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: name, files: [uri] });
      return 'shared';
    } catch (e) {
      return /cancel/i.test(String(e?.message || e)) ? 'cancelled' : 'failed';
    }
  }
  const doc = win.document;
  if (!doc) return 'failed';
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = doc.createElement('a');
  a.setAttribute('href', url); a.setAttribute('download', name); a.setAttribute('hidden', '');
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);   // some browsers start the download a moment after the click
  return 'saved';
}
