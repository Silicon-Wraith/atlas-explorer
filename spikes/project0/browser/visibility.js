// spikes/project0/browser/visibility.js — a page-local visibility test (T9 fix round 5, Codex T9 r6 item 5; E4.5). Pure, so Node tests it with fake
// elements; the integrity preflight asserts it in real Chrome.
//
// An element counts as visible when it is connected; no element on its ancestor chain has `display: none`, `opacity: 0` or (above it)
// `content-visibility: hidden`; its own computed `visibility` is `visible` (the property inherits, so the element's own value already reflects its
// ancestors); and its client rect has a positive width and height and intersects the viewport.
//
// Why not `offsetParent`: it is null for a fixed-position element even while that element is painted (CSSOM View), and #status is fixed. Why not
// `checkVisibility()` alone: Chrome 151 supports its `opacityProperty`/`visibilityProperty` options, but it does not test for a zero-sized box or
// for a box outside the viewport, and it cannot be exercised in Node; the explicit test covers all of these and runs identically in both.
export function elementVisible(el, { view = el?.ownerDocument?.defaultView ?? globalThis } = {}) {
  if (!el || el.isConnected !== true) return false;
  for (let e = el; e; e = e.parentElement) {
    const cs = view.getComputedStyle(e);
    if (cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (e === el && cs.visibility !== 'visible') return false;
    if (e !== el && cs.contentVisibility === 'hidden') return false;
  }
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  return r.right > 0 && r.bottom > 0 && r.left < view.innerWidth && r.top < view.innerHeight;
}
