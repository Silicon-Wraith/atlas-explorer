// node scripts/audit-gates.mjs <base> <implementationHead>
// Audits every commit in base..implementationHead against its own gate evidence, writes
// docs/reports/project1a/gate-ledger.json, and exits 0 only if every commit is accepted.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditLedger, parseLedger, requiredIdsFromManifest } from './gate/ledger.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const [base, head] = process.argv.slice(2);
if (!base || !head) { console.error('usage: node scripts/audit-gates.mjs <base> <implementationHead>'); process.exit(1); }
// Match the gate's bounded Git calls (scripts/plane-gate.mjs, GIT_MS).
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL' }).trim();
const implementationHead = git('rev-parse', head);
const commits = git('rev-list', '--reverse', `${base}..${implementationHead}`).split('\n').filter(Boolean);
let entries = [];
try { entries = parseLedger(await readFile(resolve(root, 'artifacts/gates/ledger.jsonl'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const records = {};
for (const entry of entries) {
  if (!entry?.record || entry.record in records) continue;
  try { records[entry.record] = JSON.parse(await readFile(resolve(root, entry.record), 'utf8')); }
  catch (error) { records[entry.record] = error.code === 'ENOENT' ? undefined : { unreadable: error.message }; }
}
const requiredIdsFor = commit => { try { return requiredIdsFromManifest(JSON.parse(git('show', `${commit}:tests/suites.manifest.json`))); } catch { return null; } };
const exceptionPath = 'docs/reports/project1a/gate-exceptions.json';
let exceptions;
try { exceptions = JSON.parse(await readFile(resolve(root, exceptionPath), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') exceptions = { unreadable: error.message }; }
const ancestry = [];
for (const entry of Array.isArray(exceptions?.exceptions) ? exceptions.exceptions : []) {
  if (!commits.includes(entry?.commit) || !commits.includes(entry?.supersededBy)) continue;
  try {
    git('merge-base', '--is-ancestor', entry.commit, entry.supersededBy);
    ancestry.push({ commit: entry.commit, supersededBy: entry.supersededBy });
  } catch { /* Missing or failed ancestry evidence cannot authorise an exception. */ }
}
const { exceptions: exceptionSummary, ...audit } = auditLedger({ commits, entries, records, requiredIdsFor, exceptions, ancestry });
for (const row of audit.rows) console.log(`${row.commit.slice(0, 12)} ${row.state.padEnd(16)} ${row.record ?? ''} ${row.state === 'accepted' ? '' : row.reason}`);
if (audit.corruptLedgerLines) console.log(`CORRUPT LEDGER: ${audit.corruptLedgerLines} invalid lines`);
if (exceptionSummary.state === 'invalid') console.log(`EXCEPTIONS INVALID: ${exceptionSummary.reason}`);
for (const exception of exceptionSummary.entries) {
  console.log(`EXCEPTION ${exception.verdict.toUpperCase()}: ${JSON.stringify(exception.entry)}; ${exception.reason}; original record: ${exception.record ?? 'none'}; superseding record: ${exception.supersedingRecord ?? 'none'}`);
}
console.log(`EXCEPTIONS: ${exceptionSummary.counts.listed} listed, ${exceptionSummary.counts.applied} applied, ${exceptionSummary.counts.refused} refused`);
console.log(`COUNTS: ${JSON.stringify(audit.counts)}`);
await mkdir(resolve(root, 'docs/reports/project1a'), { recursive: true });
await writeFile(resolve(root, 'docs/reports/project1a/gate-ledger.json'), `${JSON.stringify({ base: git('rev-parse', base), implementationHead, audit, exceptions: { file: exceptionPath, ...exceptionSummary } }, null, 2)}\n`);
console.log(audit.accepted ? `ACCEPTED: ${audit.counts.accepted} commits passed their own gate; ${audit.counts['accepted-by-exception']} accepted by recorded exception` : 'NOT ACCEPTED: an empty range, corrupt ledger, invalid/refused exception or unaccepted commit remains');
process.exitCode = audit.accepted ? 0 : 1;
