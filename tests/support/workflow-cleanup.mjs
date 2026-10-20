// Cleanup for tests/workflow.mjs (T05 fix round 1, Codex finding 3). Under SwiftShader the GPU draws
// are queued, so each page's backlog is drained before the bounded closes; a drain that fails is
// evidence of unfinished work and fails the suite, even when every close then succeeds. The report
// is written, carrying that failure, before any close can end the process (a close that cannot be
// confirmed exits 125 at once and stays terminal; see bounded.mjs). Workflow-local by ruling: the
// shared synchronization helper belongs to T00b.
//   → true when the suite must fail (a drain or the report write failed), else false.
export async function cleanupWorkflow({ pages, drain, report, writeReport, closeAll, log = message => console.error(message) }) {
  let failed = false;
  for (const page of pages) {
    try { await drain(page); }
    catch (error) {
      failed = true;
      report.push({ name: 'FAIL', error: `drain GPU work: ${error.stack ?? error.message}` });
      log(`drain GPU work: ${error.message}`);
    }
  }
  try { await writeReport(report); }
  catch (error) { failed = true; log(`workflow report: ${error.message}`); }
  await closeAll();
  return failed;
}
