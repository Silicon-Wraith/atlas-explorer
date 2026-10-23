// Disposition-aware audit; full-gate records retain judgeRecord's exact-commit
// semantics. The live manifest and final audit belong outside the described commits.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { auditLedger, parseLedger, requiredIdsFromManifest } from './gate/ledger.mjs';
import { readContemporaneousFast } from './gate/fast-evidence.mjs';
import { auditAcceptance, joinStrata } from './gate/acceptance.mjs';

export const OUTPUT_PATH = 'docs/reports/project1b/gate-ledger-1b1.json';
const POLICY_PATH = 'scripts/gate/acceptance-policy-1b1.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Pinned exception inputs are read in place, never copied into an evidence root
// or routed through the legacy full-gate exception validator.
export async function readHistoricalFailureEvidence(policy, read = readFile) {
  const evidence = {};
  for (const known of policy?.knownFailures ?? []) {
    if (!known.exception) continue;
    for (const ref of [known.record, known.unitLog, known.firstPassingDescendant.record, known.containment.gate].filter(Boolean)) {
      try {
        const bytes = await read(ref.file), text = bytes.toString('utf8');
        evidence[ref.file] = { sha256: hash(bytes), ...(ref === known.unitLog ? { text } : { json: JSON.parse(text) }) };
      } catch (error) { evidence[ref.file] = { error: String(error) }; }
    }
  }
  return evidence;
}
export function parseArgs(argv) {
  const [base, head, ...args] = argv;
  if (!base || !head) throw new Error('usage: node scripts/audit-gates-1b1.mjs <base> <head> [--manifest file] [--evidence-root directory] [--output file]');
  const options = { base, head, manifest: 'artifacts/gates/acceptance-1b1.json', roots: [], output: OUTPUT_PATH };
  for (let i = 0; i < args.length; i++) {
    if (!args[i + 1]) throw new Error(`missing value for ${args[i]}`);
    if (args[i] === '--manifest') options.manifest = args[++i];
    else if (args[i] === '--evidence-root') options.roots.push(args[++i]);
    else if (args[i] === '--output') options.output = args[++i];
    else throw new Error(`unknown argument ${args[i]}`);
  }
  return options;
}

export async function runAudit(options, { root = resolve(fileURLToPath(new URL('..', import.meta.url))), git: injectedGit } = {}) {
  const git = injectedGit ?? ((...args) => {
    const output = execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024, killSignal: 'SIGKILL' });
    return args.includes('-z') ? output : output.trim();
  });
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  const base = git('rev-parse', options.base), head = git('rev-parse', options.head);
  const commits = git('rev-list', '--reverse', '--topo-order', `${base}..${head}`).split('\n').filter(Boolean);
  const manifest = await json(resolve(root, options.manifest));
  // This approval travels with the auditor, never with a commit seeking exemption.
  const policyBytes = await readFile(new URL('./gate/acceptance-policy-1b1.json', import.meta.url));
  const { historicalDocsOnly: historicalDocsPolicy, wipEvidence: wipEvidencePolicy } = JSON.parse(policyBytes);
  const historicalFailureEvidence = await readHistoricalFailureEvidence(wipEvidencePolicy);
  const roots = options.roots.length ? options.roots.map(path => resolve(root, path)) : [root];
  const errors = [], entries = [], records = {}, facts = {}, evidenceHashes = {};
  const readEvidence = async path => {
    let found;
    for (const evidenceRoot of roots) {
      try {
        const bytes = await readFile(resolve(evidenceRoot, path)), value = JSON.parse(bytes), digest = hash(bytes);
        if (evidenceHashes[path] && evidenceHashes[path] !== digest) throw new Error(`conflicting evidence bytes: ${path}`);
        evidenceHashes[path] = digest;
        if (found && JSON.stringify(value) !== JSON.stringify(found)) throw new Error(`conflicting evidence roots: ${path}`);
        found = value;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return found;
  };
  for (const evidenceRoot of roots) {
    try { entries.push(...parseLedger(await readFile(resolve(evidenceRoot, 'artifacts/gates/ledger.jsonl'), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const path of new Set([...entries.map(e => e?.record), ...manifest.commits.flatMap(e => [e.gate, e.fast]), ...(manifest.stratumEvidence ?? []).map(e => e.file)].filter(Boolean))) records[path] = await readEvidence(path);
  const isAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  for (const commit of commits) {
    const [tree, time, ...parents] = git('show', '-s', '--format=%T %ct %P', commit).split(' ');
    // NUL framing preserves unusual filenames. Disable rename detection so a
    // move into docs still exposes its old path outside docs. Retain all parent
    // facts for other dispositions; historical-docs-only checks just parent 1.
    const changed = parent => git('diff-tree', '--no-commit-id', '--name-only', '--no-renames', '--ignore-submodules=none', '-z', '-r', '--root', ...(parent ? [parent, commit] : [commit])).split('\0').filter(Boolean);
    const pathsByParent = parents.map(parent => ({ parent, paths: changed(parent) }));
    const paths = parents.length ? [...new Set(pathsByParent.flatMap(diff => diff.paths))] : changed(null);
    facts[commit] = { tree, committedAt: Number(time), parents, paths, pathsByParent };
  }
  const requiredIdsFor = commit => { try { return requiredIdsFromManifest(JSON.parse(git('show', `${commit}:tests/suites.manifest.json`))); } catch { return null; } };
  const manifestsFor = commit => { try { return { unit: hash(git('show', `${commit}:tests/unit.manifest.json`)), suites: hash(git('show', `${commit}:tests/suites.manifest.json`)) }; } catch { return null; } };
  // Each input is explicitly scoped to an ancestry range. No hard-coded project1a exception path.
  const exceptions = { schema: 'atlas.gate-exceptions', schemaVersion: 1, exceptions: [] };
  for (const input of manifest.exceptionInputs ?? []) {
    if (!input.file || !/^[0-9a-f]{40}$/.test(input.base ?? '') || !/^[0-9a-f]{40}$/.test(input.head ?? '')) { errors.push('exception input lacks an explicit full-SHA range'); continue; }
    const document = await json(resolve(root, input.file));
    if (document.schema !== exceptions.schema || document.schemaVersion !== 1 || !Array.isArray(document.exceptions)) { errors.push(`invalid exception input: ${input.file}`); continue; }
    const scoped = new Set(git('rev-list', `${input.base}..${input.head}`).split('\n'));
    for (const entry of document.exceptions) {
      if (![entry.commit, entry.supersededBy].every(commit => scoped.has(commit) && commits.includes(commit))) errors.push(`exception outside its explicit scope or audited range: ${entry.commit}`);
      else exceptions.exceptions.push(entry);
    }
  }
  const ancestry = exceptions.exceptions.filter(e => isAncestor(e.commit, e.supersededBy)).map(({ commit, supersededBy }) => ({ commit, supersededBy }));
  const legacy = auditLedger({ commits, entries, records, requiredIdsFor, exceptions, ancestry });
  if (legacy.exceptions.state === 'invalid' || legacy.exceptions.counts.refused) errors.push('invalid or refused scoped exception');
  // Read mandatory rows and hashes from the audited commit, not this checkout.
  const index = JSON.parse(git('show', `${head}:tests/reference/space-matrix.json`));
  const mandatory = [];
  for (const shard of index.shards) {
    const data = git('show', `${head}:tests/reference/${shard.path}`);
    // git() trims for protocol fields; JSON shard hashes include their final newline.
    if (![hash(data), hash(`${data}\n`)].includes(shard.sha256)) { errors.push(`matrix shard hash mismatch: ${shard.path}`); continue; }
    const parsed = JSON.parse(data);
    for (const row of parsed.strata ?? parsed) if (row.role === 'mandatory') mandatory.push({ matrixSha256: index.matrixSha256, id: row.id });
  }
  const stratumRows = [];
  for (const input of manifest.stratumEvidence ?? []) {
    const source = records[input.file];
    if (!/^[0-9a-f]{64}$/.test(input.sha256 ?? '') || evidenceHashes[input.file] !== input.sha256) { errors.push(`stratum evidence hash mismatch: ${input.file}`); continue; }
    // Evidence captures and diagnostic groups never qualify numerical acceptance.
    if (!Array.isArray(source) || input.diagnostic || input.file.includes('b11c-cap') || !isAncestor(input.commit, head) || source.some(e => e.name === 'FAIL' || e.name?.startsWith('FAILED '))) { errors.push(`non-qualifying stratum source: ${input.file}`); continue; }
    const environment = source.find(e => e.name === 'environment');
    if (!/^[0-9a-f]{40}$/.test(input.commit ?? '') || environment?.source?.commit !== input.commit || environment.headed !== true || environment.source.dirty !== false) { errors.push(`unverified stratum source identity: ${input.file}`); continue; }
    for (const entry of source) if (entry.matrixSha256) for (const row of entry.rows ?? []) stratumRows.push({ ...row, matrixSha256: entry.matrixSha256 });
  }
  const evidenceJoin = joinStrata(mandatory, stratumRows);
  const contemporaneous = await readContemporaneousFast(manifest.contemporaneousFastInputs, { root, wipEvidencePolicy,
    resolveCommit: value => git('rev-parse', `${value}^{commit}`), commitTimeFor: commit => Number(git('show', '-s', '--format=%ct', commit)) });
  const audit = auditAcceptance({ commits, manifest, facts, records, requiredIdsFor, isAncestor, manifestsFor, historicalDocsPolicy, wipEvidencePolicy, historicalFailureEvidence, legacyRows: legacy.rows,
    corruptLedgerLines: legacy.corruptLedgerLines, evidenceJoin, contemporaneousFastFor: commit => contemporaneous.get(commit),
    approvedPolicyFor: commit => { try { return JSON.parse(git('show', `${facts[commit].parents[0]}:${POLICY_PATH}`)); } catch { return null; } },
    // Summary exemption is deliberately unavailable until the caller supplies a
    // reproducible evidence comparison. No output summary may self-certify.
  });
  if (manifest.base !== base || manifest.head !== head) errors.push('manifest range differs from CLI range');
  if (!isAncestor(base, head)) errors.push('base is not an ancestor of head');
  audit.errors.push(...errors); if (errors.length) audit.accepted = false;
  const output = { schema: 'atlas.acceptance-audit', schemaVersion: 1, base, implementationHead: head,
    manifest: { file: options.manifest, sha256: hash(await readFile(resolve(root, options.manifest))) },
    policy: { file: POLICY_PATH, sha256: hash(policyBytes) }, evidenceRoots: roots, audit, exceptions: legacy.exceptions };
  await mkdir(dirname(resolve(root, options.output)), { recursive: true });
  await writeFile(resolve(root, options.output), `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runAudit(parseArgs(process.argv.slice(2)));
    for (const row of result.audit.rows) console.log(`${row.commit} ${row.disposition} ${row.state} ${row.reason ?? ''}`);
    console.log(JSON.stringify({ accepted: result.audit.accepted, counts: result.audit.counts, errors: result.audit.errors }));
    process.exitCode = result.audit.accepted ? 0 : 1;
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
