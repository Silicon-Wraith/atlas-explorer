// Own only the pages in this launcher's context, not arbitrary Chrome windows.
export function ownPreviewPages({ context, browser, onEmpty }) {
  const pages = new Map(); let finished = false, disposed = false;
  const finish = () => { if (!finished && !disposed) { finished = true; onEmpty(); } };
  function add(page) {
    if (disposed || pages.has(page) || page.isClosed()) return;
    const close = () => { pages.delete(page); if (pages.size === 0) finish(); };
    pages.set(page, close); page.once('close', close);
  }
  context.on('page', add); browser.once('disconnected', finish);
  for (const page of context.pages()) add(page);
  return Object.freeze({
    snapshot: () => ({ pages: pages.size, finished }),
    dispose() {
      if (disposed) return; disposed = true; context.off('page', add); browser.off('disconnected', finish);
      for (const [page, close] of pages) page.off('close', close); pages.clear();
    },
  });
}
