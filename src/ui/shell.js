// The application shell: element lookup, icons, notices and dialogs shared by workspaces.
import { installIcons } from './icons.js';
import { createNotifier } from './notifications.js';
import { installDialogs, showDialog } from './dialogs.js';

export function createShell(root = document) {
  installIcons(root);
  installDialogs(root);
  const $ = selector => root.querySelector(selector);
  return Object.freeze({ $, toast: createNotifier($('#toast')), showDialog: selector => showDialog(root, selector) });
}
