// Boundary-checker fixture: a regex after a block is ambiguous to the scanner,
// which must fail closed. It is scanned as text and never executed.
export function f() {}
/document/.test(String(f));
