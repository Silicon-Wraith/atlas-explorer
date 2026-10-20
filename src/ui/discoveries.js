// The Discoveries control (spec §13.10): one control, filtered to the active workspace by its
// controller, shown in the "Your discoveries" tab. Rendering is a pure view model
// (discoveryCards) plus thin DOM glue. Every discovery stays reachable: bounded pages with a
// "Show more" card; outstanding writes are visible; an unknown outcome offers "Check again",
// which re-reads without repeating the write.
import { icon } from './icons.js';

export const EMPTY_MESSAGE = 'Find a place you love. Press B to keep it here.';

export function discoveryCards(snapshot) {
  const cards = [], unavailable = [], more = [];
  let loading = false, total = 0, totalKnown = true;
  for (const [sourceId, view] of Object.entries(snapshot.sources)) {
    if (view.status === 'unavailable') unavailable.push({ sourceId, label: view.label, reason: view.reason });
    if (view.status === 'loading' || view.status === 'idle') loading = true;
    if (Number.isInteger(view.total)) total += view.total; else { totalKnown = false; total += view.items.length; }
    if (view.nextCursor) more.push({ sourceId, label: view.label, loaded: view.items.length, total: view.total });
    for (const item of view.items) {
      cards.push(item.record
        ? { key: item.key, sourceId, id: item.id, name: item.record.name, description: item.record.note || 'YOUR OWN LITTLE INFINITY', thumbnail: item.record.thumbnail.blob, openable: true }
        : { key: item.key, sourceId, id: item.id, name: 'Unsupported discovery', description: 'CANNOT BE OPENED', thumbnail: null, openable: false, reason: item.unsupported });
    }
  }
  const outstanding = snapshot.writes.filter(write => write.status === 'pending' || write.status === 'checking');
  const unknown = snapshot.writes.filter(write => write.status === 'unknown');
  return { cards, unavailable, more, outstanding, unknown, loading, loaded: cards.length, total, totalKnown, empty: !loading && cards.length === 0 && unavailable.length === 0 };
}

// Only `committed`, `aborted` and `failed` are definite outcomes (shared/discoveries.js). Every
// other observation — `pending`, `checking`, `unknown` (including a write left unknown by
// teardown), no observation at all, or a status this control does not know — claims nothing.
export function writeMessage(observation, verb) {
  const status = observation?.status, save = verb === 'save';
  if (status === 'committed') return save ? 'Discovery saved. Find it in Your discoveries.' : 'Discovery removed.';
  if (status === 'aborted') return save ? 'The discovery was not saved.' : 'The discovery was not removed.';
  if (status === 'failed') {
    const reason = observation.reason ? ` (${observation.reason})` : '';
    return save ? `The discovery could not be saved${reason}. Use Capture → Save location to keep this view.` : `The discovery could not be removed${reason}.`;
  }
  if (status === 'pending' || status === 'checking') return 'The result is still being checked. Its status is shown in Your discoveries.';
  return 'ATLAS could not confirm the result yet. Use Check again in Your discoveries.';
}

export const outstandingMessage = write => `${write.kind === 'save' ? 'Saving' : 'Removing'} a discovery${write.status === 'checking' ? ' — checking the result' : ''}…`;

export function mountDiscoveriesControl({ grid, countElement, controller, sourceId = 'local', isActive, activeKey, onOpen, toast }) {
  let urls = [], destroyed = false;
  const release = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; };
  // A write the controller refuses (`destroyed`, `unsupported`) never reached the source; any
  // other rejection is reported as the failure it is. Neither claims a committed outcome.
  const refused = verb => error => toast(writeMessage({ status: 'failed', reason: error?.message ?? String(error) }, verb));

  function card({ className = 'destination-card', number, arrow, name, description, onclick }) {
    const button = document.createElement('button');
    button.className = className;
    for (const [part, text] of [['place-number', number], ['place-arrow', arrow], ['place-name', name], ['place-description', description]]) {
      const span = document.createElement('span'); span.className = part; span.textContent = text; button.append(span);
    }
    if (onclick) button.onclick = onclick;
    return button;
  }

  function render() {
    if (destroyed) return;
    const model = discoveryCards(controller.snapshot());
    // An unknown total with further pages is a lower bound, never presented as the total.
    countElement.textContent = model.loading && !model.loaded ? '…' : `${model.total}${!model.totalKnown && model.more.length ? '+' : ''}`;
    if (!isActive()) return;
    release();
    grid.classList.add('saved-places');
    grid.replaceChildren();
    const message = (text, action) => {
      const note = document.createElement('div'); note.className = 'empty-saved discovery-status'; note.textContent = text;
      if (action) { const button = document.createElement('button'); button.className = 'mini-button'; button.textContent = action.label; button.onclick = action.run; note.append(' ', button); }
      grid.append(note);
    };
    for (const write of model.outstanding) message(outstandingMessage(write));
    for (const write of model.unknown) message(`ATLAS could not confirm a ${write.kind === 'save' ? 'save' : 'removal'}.`, { label: 'Check again', run: () => controller.reconcile(write.writeId).then(result => toast(writeMessage(result, write.kind)), error => toast(`ATLAS could not check the result (${error?.message ?? error}).`)) });
    for (const source of model.unavailable) message(`${source.label} is unavailable: ${source.reason}.`);
    if (model.empty) { message(EMPTY_MESSAGE); return; }
    model.cards.forEach((entry, index) => {
      const button = card({ number: String(index + 1).padStart(2, '0'), arrow: entry.openable ? '↗' : '·', name: entry.name, description: entry.description });
      if (entry.key === activeKey()) button.classList.add('active');
      button.dataset.discovery = entry.key;
      if (entry.thumbnail) {
        const image = document.createElement('img'); image.alt = ''; image.draggable = false;
        const url = URL.createObjectURL(entry.thumbnail); urls.push(url); image.src = url;
        image.onerror = () => { image.style.display = 'none'; };
        button.prepend(image);
      }
      if (entry.openable) button.onclick = () => controller.open(entry.sourceId, entry.id).then(record => onOpen(record, entry.key), error => { if (error?.code !== 'superseded') toast(error?.message ?? String(error)); });
      else { button.disabled = true; button.title = entry.reason; }
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper'; wrapper.append(button);
      if (entry.sourceId === sourceId) {
        const remove = document.createElement('button'); remove.className = 'delete-save'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', `Delete ${entry.name}`);
        remove.onclick = () => controller.remove(entry.sourceId, entry.id).then(observation => toast(writeMessage(observation, 'remove')), refused('remove'));
        wrapper.append(remove);
      }
      grid.append(wrapper);
    });
    for (const page of model.more) {
      const wrapper = document.createElement('div'); wrapper.className = 'saved-wrapper';
      wrapper.append(card({ className: 'destination-card discovery-more', number: '··', arrow: '→', name: 'Show more', description: `${page.loaded} OF ${page.total ?? 'MORE'} SHOWN`, onclick: () => controller.nextPage(page.sourceId) }));
      grid.append(wrapper);
    }
  }

  const unsubscribe = controller.subscribe(render);
  return Object.freeze({ render, destroy() { if (destroyed) return; destroyed = true; unsubscribe(); release(); } });
}
