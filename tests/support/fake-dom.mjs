import { installMaskWorkerDouble } from './mask-worker-double.mjs';
// A minimal fake browser for Node unit tests of workspaces (plan B14). It never renders: elements
// keep listeners, attributes, values and focus; `#id` lookups create elements on demand; animation
// frames are collected and run only when a test calls runFrames(). Nothing here launches a browser.
const SELECTOR_ID = /^#([\w-]+)$/;

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach(name => this.set.add(name)); }
  remove(...names) { names.forEach(name => this.set.delete(name)); }
  toggle(name, force) { const on = force === undefined ? !this.set.has(name) : Boolean(force); if (on) this.set.add(name); else this.set.delete(name); return on; }
  contains(name) { return this.set.has(name); }
}

function listenerHost(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn, options) => {
    if (!listeners.has(type)) listeners.set(type, []);
    if (!listeners.get(type).some(entry => entry.fn === fn)) listeners.get(type).push({ fn, once: Boolean(options?.once) });
  };
  target.removeEventListener = (type, fn) => {
    const list = listeners.get(type); if (!list) return;
    const index = list.findIndex(entry => entry.fn === fn); if (index >= 0) list.splice(index, 1);
  };
  target.listenerCount = type => type ? (listeners.get(type)?.length ?? 0) : [...listeners.values()].reduce((sum, list) => sum + list.length, 0);
  target.dispatchEvent = event => {
    if (!event.target) Object.defineProperty(event, 'target', { value: target, configurable: true, writable: true });
    event.currentTarget = target;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    for (const entry of [...(listeners.get(event.type) ?? [])]) {
      if (entry.once) target.removeEventListener(event.type, entry.fn);
      entry.fn.call(target, event);
    }
    const handler = target[`on${event.type}`];
    if (typeof handler === 'function') handler.call(target, event);
    return !event.defaultPrevented;
  };
  return target;
}

export function createFakeDocument({ width = 800, height = 600 } = {}) {
  const elements = new Map(), dialogs = new Set();
  const document = listenerHost({ hidden: false, visibilityState: 'visible', activeElement: null, focused: true });
  function element(tagName = 'div', id = '') {
    const node = listenerHost({
      tagName: tagName.toUpperCase(), id, children: [], parentNode: null, dataset: {}, classList: new FakeClassList(),
      attributes: {}, hidden: false, disabled: false, value: '', checked: false, textContent: '', title: '', files: [],
      width: 300, height: 150, clientWidth: width, clientHeight: height, open: false, ownerDocument: document,
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
    });
    let html = '';
    Object.defineProperty(node, 'innerHTML', { get: () => html, set: value => { html = String(value); node.children = []; } });
    Object.defineProperty(node, 'className', { get: () => [...node.classList.set].join(' '), set: value => { node.classList.set = new Set(String(value).split(/\s+/).filter(Boolean)); } });
    Object.assign(node, {
      setAttribute(name, value) { node.attributes[name] = String(value); }, getAttribute(name) { return node.attributes[name] ?? null; },
      removeAttribute(name) { delete node.attributes[name]; },
      append(...children) { for (const child of children) if (typeof child === 'object') { child.parentNode = node; node.children.push(child); } },
      prepend(...children) { for (const child of children.reverse()) if (typeof child === 'object') { child.parentNode = node; node.children.unshift(child); } },
      replaceChildren(...children) { node.children = []; node.append(...children); },
      remove() { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); node.parentNode = null; },
      replaceWith(other) { if (node.id) { other.id = node.id; elements.set(`#${node.id}`, other); } },
      cloneNode() { return element(tagName, ''); },
      contains(other) { for (let cursor = other; cursor; cursor = cursor.parentNode) if (cursor === node) return true; return false; },
      closest(selector) { for (let cursor = node; cursor; cursor = cursor.parentNode) if (cursor.matches?.(selector)) return cursor; return null; },
      matches(selector) {
        return selector.split(',').map(part => part.trim()).some(part => {
          const id = SELECTOR_ID.exec(part); if (id) return node.id === id[1];
          if (part.startsWith('[')) return false;
          return node.tagName === part.toUpperCase();
        });
      },
      querySelector: () => null, querySelectorAll: () => [],
      focus() { document.activeElement = node; node.dispatchEvent({ type: 'focus' }); },
      blur() { if (document.activeElement === node) { document.activeElement = null; node.dispatchEvent({ type: 'blur' }); } },
      click() { if (!node.disabled) node.dispatchEvent({ type: 'click' }); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height }),
      setPointerCapture(id) { node.captured = id; }, releasePointerCapture(id) { if (node.captured === id) node.captured = null; },
      getContext: type => type === '2d' ? { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} } : null,
      showModal() { node.open = true; node.attributes.open = ''; }, close() { node.open = false; delete node.attributes.open; node.dispatchEvent({ type: 'close' }); },
      toBlob(callback) { callback(null); },
    });
    if (tagName === 'dialog') dialogs.add(node);
    return node;
  }
  const body = element('body');
  Object.assign(document, {
    body, documentElement: element('html'), elements,
    createElement: tag => element(tag),
    getElementById: id => document.querySelector(`#${id}`),
    querySelector(selector) {
      if (selector === 'dialog[open]') return [...dialogs].find(dialog => dialog.open) ?? null;
      const id = SELECTOR_ID.exec(selector);
      if (!id) return null;
      if (!elements.has(selector)) {
        const tag = /dialog$/.test(id[1]) ? 'dialog' : /canvas|^fractal$/.test(id[1]) ? 'canvas' : 'div';
        elements.set(selector, element(tag, id[1]));
      }
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      if (selector === 'dialog') return [...dialogs];
      if (selector === 'input[type=range]') return ['#phase', '#frequency', '#detail'].map(id => document.querySelector(id));
      return [];
    },
    hasFocus: () => document.focused,
    define(selector, tag) { const id = SELECTOR_ID.exec(selector)[1]; const node = element(tag, id); elements.set(selector, node); return node; },
  });
  return document;
}

// Installs the browser globals the workspaces read (document, window listeners, matchMedia, location,
// history, animation frames, viewport size) and returns controls plus restore(). Frames are queued and
// run only by runFrames(time), so no Plane render (and no Worker) ever starts unless a test asks.
export function installFakeBrowser({ width = 800, height = 600 } = {}) {
  const saved = {}, keys = ['document', 'window', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'matchMedia', 'location', 'history',
    'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'listenerCount', 'Worker'];
  for (const key of keys) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  installMaskWorkerDouble();
  const document = createFakeDocument({ width, height });
  const window = listenerHost({});
  let frames = new Map(), nextFrame = 0;
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  define('document', document); define('window', globalThis);
  define('addEventListener', window.addEventListener); define('removeEventListener', window.removeEventListener);
  define('dispatchEvent', window.dispatchEvent); define('listenerCount', window.listenerCount);
  define('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  define('location', { hash: '', origin: 'http://atlas.test', pathname: '/' });
  define('history', { replaceState() {} });
  define('requestAnimationFrame', fn => { const id = ++nextFrame; frames.set(id, fn); return id; });
  define('cancelAnimationFrame', id => frames.delete(id));
  define('innerWidth', width); define('innerHeight', height); define('devicePixelRatio', 1);
  document.defaultView = globalThis;
  return {
    document, window,
    pendingFrames: () => frames.size,
    runFrames(time = 0) { const due = frames; frames = new Map(); for (const fn of due.values()) fn(time); return due.size; },
    restore() { for (const key of keys) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]; } },
  };
}

export function fakeShell(document, { toasts = [] } = {}) {
  return Object.freeze({ $: selector => document.querySelector(selector), toast: message => toasts.push(message), showDialog: selector => document.querySelector(selector).showModal() });
}

// A headless discoveries controller: Plane mounts its Discoveries control on it.
export function stubDiscoveries() {
  return { setWorkspace() {}, snapshot: () => ({ workspace: 'plane', sources: {}, writes: [] }), subscribe: () => () => {}, destroy() {} };
}
