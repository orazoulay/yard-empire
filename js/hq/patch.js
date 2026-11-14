// Redrawing without rebuilding: the Headquarters is drawn again twice a second, and patch() makes the page show the new
// drawing while touching only what changed.
// The screen is drawn again twice a second. Most of the time most of it has not changed, and replacing
// it anyway would cost time and take the hover, the focus and a tooltip from under the player. So what
// is on the page remembers the markup it was drawn with. A part whose markup is the same is left alone;
// one that differs is mended in place where it can be (attributes, a changed text, its children in the
// same way), and replaced only when its shape is different.
const built = new WeakMap();   // an element on the page -> its markup when it was drawn
/** Children are elements only, no loose text between them: they can be compared one by one. */
const plain = el => el.childNodes.length === el.children.length;
/** `was` stays on the page in place of `now`, which looks the same: hand over the click handlers, which may know newer data. */
function adopt(was, now) {
  if (now._click) was._click = now._click;
  const a = was.getElementsByTagName('button'), b = now.getElementsByTagName('button');
  for (let i = 0; i < b.length && i < a.length; i++) if (b[i]._click) a[i]._click = b[i]._click;
}
/** Turn `was` into `now` without taking it off the page. @returns false when that cannot be done and it has to be replaced */
function mend(was, now) {
  if (was._bound || now._bound || was.tagName !== now.tagName || !was._click !== !now._click) return false;
  const kids = now.children.length;
  if (was.children.length !== kids || (kids > 0 && !(plain(was) && plain(now)))) return false;   // a different shape, or text mixed with elements
  for (const a of Array.from(was.attributes)) if (now.getAttribute(a.name) === null) was.removeAttribute(a.name);
  for (const a of Array.from(now.attributes)) if (was.getAttribute(a.name) !== a.value) was.setAttribute(a.name, a.value);
  if (kids) patch(was, Array.from(now.children));
  else if (was.textContent !== now.textContent) was.textContent = now.textContent;
  if (now._click) was._click = now._click;
  return true;
}
/**
 * Make `parent` show the elements in `fresh`, touching as little of the page as possible.
 * @returns true when anything on the page was changed
 */
export function patch(parent, fresh) {
  const old = parent.children;
  if (old.length !== fresh.length) {
    for (const el of fresh) built.set(el, el.outerHTML);
    parent.replaceChildren(...fresh);
    return true;
  }
  let changed = false;
  for (let i = 0; i < fresh.length; i++) {
    const was = old[i], now = fresh[i], html = now.outerHTML;
    if ((built.get(was) ?? was.outerHTML) === html) { built.set(was, html); adopt(was, now); continue; }   // not seen before: its markup on the page speaks for it
    changed = true;
    if (mend(was, now)) built.set(was, html);
    else { built.set(now, html); was.replaceWith(now); }
  }
  return changed;
}
