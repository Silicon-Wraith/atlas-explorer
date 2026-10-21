// The shell's transient notice (the #toast element).
export function createNotifier(element, { durationMs = 3500 } = {}) {
  let timer;
  return function toast(message) {
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove('visible'), durationMs);
  };
}
