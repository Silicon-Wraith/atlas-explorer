// Shared dialog behaviour: close buttons and light dismissal outside the dialog box.
export function installDialogs(root = document) {
  root.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
  root.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  }));
}

export function showDialog(root, selector) { root.querySelector(selector).showModal(); }
