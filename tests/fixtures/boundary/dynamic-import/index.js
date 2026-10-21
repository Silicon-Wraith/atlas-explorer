// Boundary-checker fixture: a dynamic import, which the checker cannot resolve
// statically and therefore reports. It is scanned as text and never executed.
export async function load() {
  return import('./index.js');
}
