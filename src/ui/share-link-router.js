// Share links while Plane is not the active workspace (spec §14; plan B14, Codex B14-F3). Plane detaches
// its own `hashchange` listener when it is deactivated, so the shell keeps this one persistent listener.
// While Plane is active it does nothing: Plane's own listener applies the link. Otherwise a supported
// Plane scene switches to Plane and is restored there as a whole scene (one undo entry, through Plane's
// own restore path); an invalid or unsupported link is reported and changes neither investigation nor
// either history. Space share links are deferred beyond Project 1 (§19.1 Q6) and are reported as such.
//   createShareLinkRouter({plane, switcher, report, decode?, target?, location?}) → {destroy()}
import { decodeShareHash } from '../plane/scene-adapter.js';

const capitalized = text => `${text[0].toUpperCase()}${text.slice(1)}`;

export function createShareLinkRouter({ plane, switcher, report = () => {}, decode = decodeShareHash, target = globalThis, location = globalThis.location }) {
  let destroyed = false;
  async function onHashChange() {
    if (destroyed || plane.isActive()) return;
    const hash = location.hash, link = decode(hash);
    if (link.kind === 'none') return;
    if (link.kind === 'unsupported') { report(`${capitalized(link.error.message)}. Your view is unchanged.`); return; }
    if (link.scene.workspace !== 'plane') { report('Share links for this workspace are not supported in this release. Your view is unchanged.'); return; }
    const switched = await switcher.switchTo('plane');
    // A newer link or switch supersedes this one; it is handled by its own event.
    if (destroyed || location.hash !== hash || switched.outcome !== 'activated') return;
    plane.openShareHash(hash);
  }
  target.addEventListener('hashchange', onHashChange);
  return Object.freeze({ destroy() { if (destroyed) return; destroyed = true; target.removeEventListener('hashchange', onHashChange); } });
}
