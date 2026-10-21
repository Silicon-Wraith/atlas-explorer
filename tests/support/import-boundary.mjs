// Source-level import-boundary checker (spec §4.1). It never executes the files it
// scans: each file is tokenized (comments, strings, templates and regular
// expressions recognized), every static import and re-export specifier is resolved
// to a canonical repository-relative path and checked against `allowed`, every
// dynamic import is a violation, and the permitted dependencies are walked
// transitively. Every scanned source is also checked for the browser and GPU global
// names in FORBIDDEN_GLOBALS, as identifiers or inside decoded string literals. A
// source the tokenizer cannot classify is a violation ('unparsed'): the check fails
// closed. It does not evaluate expressions, so computed names built at run time
// (for example by string concatenation) are outside what a source scan can prove.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FORBIDDEN_GLOBALS = Object.freeze(['document', 'navigator', 'window', 'GPUDevice']);
const SOURCE = /\.(?:js|mjs)$/;
const REGEX_PRECEDING_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await', 'else', 'do']);

// Minimal ECMAScript tokenizer: enough to separate code from comments and literals.
// It fails closed (SyntaxError) on constructs it cannot classify: a "/" after a
// block-closing "}", a backslash outside a literal (identifier escapes), and
// unterminated literals. String and template contents are decoded (cooked).
const NAME_START = /[\p{ID_Start}$_]/u, NAME_PART = /[\p{ID_Continue}$‌‍]/u;
const CONTROL_KEYWORDS = new Set(['if', 'while', 'for', 'with']);
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' };

// text[i] is a backslash inside a string or template; returns [decoded, next index].
function decodeEscape(text, i) {
  const char = text[i + 1];
  if (char === undefined) throw new SyntaxError('unterminated escape');
  const hex = (from, length) => {
    const digits = text.slice(from, from + length);
    if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(digits)) throw new SyntaxError('malformed escape');
    return parseInt(digits, 16);
  };
  if (char === 'x') return [String.fromCharCode(hex(i + 2, 2)), i + 4];
  if (char === 'u' && text[i + 2] === '{') {
    const close = text.indexOf('}', i + 3);
    if (close < 0 || !/^[0-9a-fA-F]{1,6}$/.test(text.slice(i + 3, close))) throw new SyntaxError('malformed escape');
    return [String.fromCodePoint(parseInt(text.slice(i + 3, close), 16)), close + 1];
  }
  if (char === 'u') return [String.fromCharCode(hex(i + 2, 4)), i + 6];
  if (char === '\r' && text[i + 2] === '\n') return ['', i + 3];
  if (char === '\n' || char === '\r' || char === ' ' || char === ' ') return ['', i + 2];
  if (char === '0' && !/[0-9]/.test(text[i + 2] || '')) return ['\0', i + 2];
  if (/[0-9]/.test(char)) throw new SyntaxError('legacy octal escapes are not supported');
  return [SIMPLE_ESCAPES[char] ?? char, i + 2];
}

export function tokenize(text) {
  const tokens = [], templateDepths = [], parens = [];
  let i = 0, braceDepth = 0;
  const previous = () => tokens[tokens.length - 1];
  const regexAllowed = () => {
    const token = previous();
    if (!token) return true;
    if (token.type === 'name') return REGEX_PRECEDING_KEYWORDS.has(token.value);
    if (token.type !== 'punct') return false;
    if (token.value === ')') return token.control === true;
    if (token.value === '}') throw new SyntaxError('a "/" after "}" is ambiguous (block or expression)');
    // A postfix increment or decrement ends an operand; prefix ++/-- before a regex is invalid.
    return !(token.value === ']' || token.value === '++' || token.value === '--');
  };
  function scanTemplate() { // i is just after ` or after the } closing ${...}
    let value = '';
    while (i < text.length) {
      const char = text[i];
      if (char === '\\') { const [decoded, next] = decodeEscape(text, i); value += decoded; i = next; continue; }
      if (char === '`') { i++; tokens.push({ type: 'template', value }); return; }
      if (char === '$' && text[i + 1] === '{') { i += 2; tokens.push({ type: 'template', value }); templateDepths.push(braceDepth); braceDepth++; return; }
      value += char; i++;
    }
    throw new SyntaxError('unterminated template literal');
  }
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) { i++; continue; }
    if (char === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new SyntaxError('unterminated comment');
      i = end + 2; continue;
    }
    if (char === '"' || char === "'") {
      let value = ''; i++;
      while (i < text.length && text[i] !== char) {
        if (text[i] === '\n') throw new SyntaxError('unterminated string');
        if (text[i] === '\\') { const [decoded, next] = decodeEscape(text, i); value += decoded; i = next; } else value += text[i++];
      }
      if (i >= text.length) throw new SyntaxError('unterminated string');
      i++; tokens.push({ type: 'string', value }); continue;
    }
    if (char === '`') { i++; scanTemplate(); continue; }
    if (char === '}' && templateDepths.length && templateDepths[templateDepths.length - 1] === braceDepth - 1) {
      templateDepths.pop(); braceDepth--; i++; scanTemplate(); continue;
    }
    if (char === '/' && regexAllowed()) {
      let value = '/', inClass = false; i++;
      while (true) {
        const c = text[i];
        if (c === undefined || c === '\n') throw new SyntaxError('unterminated regular expression');
        if (c === '\\') { value += text.slice(i, i + 2); i += 2; continue; }
        value += c; i++;
        if (c === '[') inClass = true; else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
      }
      while (/[a-z]/i.test(text[i] || '')) value += text[i++];
      tokens.push({ type: 'regex', value }); continue;
    }
    if (char === '\\') throw new SyntaxError('escapes outside string literals (identifier escapes) are not supported');
    if (NAME_START.test(char)) {
      let value = '';
      while (i < text.length && NAME_PART.test(text[i])) value += text[i++];
      tokens.push({ type: 'name', value }); continue;
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      let value = '';
      while (i < text.length && /[\w.]/.test(text[i])) {
        value += text[i++];
        if (/[eE]$/.test(value) && /[+-]/.test(text[i] || '') && !/^0[xX]/.test(value)) value += text[i++];
      }
      tokens.push({ type: 'number', value }); continue;
    }
    if ((char === '+' || char === '-') && text[i + 1] === char) { tokens.push({ type: 'punct', value: char + char }); i += 2; continue; }
    if (char === '{') braceDepth++;
    if (char === '}') braceDepth--;
    if (char === '(') { const before = previous(); parens.push(before?.type === 'name' && CONTROL_KEYWORDS.has(before.value)); }
    if (char === ')') { tokens.push({ type: 'punct', value: ')', control: parens.pop() === true }); i++; continue; }
    tokens.push({ type: 'punct', value: char }); i++;
  }
  if (templateDepths.length) throw new SyntaxError('unterminated template expression');
  return tokens;
}

// {static: [specifier], dynamic: number, globals: [name]}
export function scanSource(text) {
  const tokens = tokenize(text), result = { static: [], dynamic: 0, globals: [] };
  const isName = (token, value) => token && token.type === 'name' && token.value === value;
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k], next = tokens[k + 1], before = tokens[k - 1];
    if (token.type === 'name' && FORBIDDEN_GLOBALS.includes(token.value)) result.globals.push(token.value);
    if ((token.type === 'string' || token.type === 'template') && FORBIDDEN_GLOBALS.some(name => new RegExp(`\\b${name}\\b`).test(token.value))) result.globals.push(token.value);
    if (before && before.type === 'punct' && before.value === '.') continue; // a member named import/export
    if (isName(token, 'import')) {
      if (next && next.type === 'punct' && next.value === '(') { result.dynamic++; continue; }
      if (next && next.type === 'punct' && next.value === '.') continue; // import.meta
      if (next && next.type === 'string') { result.static.push(next.value); continue; }
      let found = false;
      for (let j = k + 1; j < tokens.length && tokens[j].value !== ';'; j++) {
        if (isName(tokens[j], 'from') && tokens[j + 1]?.type === 'string') { result.static.push(tokens[j + 1].value); found = true; break; }
      }
      if (!found) throw new SyntaxError('an import declaration without a resolvable specifier');
    } else if (isName(token, 'export') && next && next.type === 'punct' && (next.value === '*' || next.value === '{')) {
      for (let j = k + 1; j < tokens.length && tokens[j].value !== ';'; j++) {
        if (tokens[j].type === 'punct' && tokens[j].value === '}' && !isName(tokens[j + 1], 'from')) break;
        if (isName(tokens[j], 'from') && tokens[j + 1]?.type === 'string') { result.static.push(tokens[j + 1].value); break; }
      }
    }
  }
  return result;
}

const canonical = absolute => relative(REPOSITORY_ROOT, absolute).split(sep).join('/');

async function sourcesUnder(root) {
  const absolute = resolve(REPOSITORY_ROOT, root), info = await stat(absolute);
  if (info.isFile()) return [absolute];
  const files = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...await sourcesUnder(path));
    else if (SOURCE.test(entry.name)) files.push(path);
  }
  return files.sort();
}

export async function boundaryViolations(roots, allowed) {
  const violations = [], visited = new Set(), queue = [];
  const permitted = path => allowed.some(pattern => pattern.test(path));
  for (const root of roots) queue.push(...await sourcesUnder(root));
  while (queue.length) {
    const absolute = queue.shift(), file = canonical(absolute);
    if (visited.has(file)) continue;
    visited.add(file);
    let text;
    try { text = await readFile(absolute, 'utf8'); } catch { violations.push({ file, kind: 'unreadable' }); continue; }
    let scan;
    try { scan = scanSource(text); } catch (error) { violations.push({ file, kind: 'unparsed', detail: error.message }); continue; }
    if (scan.dynamic) violations.push({ file, kind: 'dynamic-import', detail: `${scan.dynamic} dynamic import(s)` });
    for (const name of scan.globals) violations.push({ file, kind: 'global', detail: name });
    for (const specifier of scan.static) {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) { violations.push({ file, kind: 'import', specifier, resolved: specifier }); continue; }
      const target = resolve(dirname(absolute), specifier), resolved = canonical(target);
      if (!permitted(resolved)) { violations.push({ file, kind: 'import', specifier, resolved }); continue; }
      queue.push(target);
    }
  }
  return violations;
}
