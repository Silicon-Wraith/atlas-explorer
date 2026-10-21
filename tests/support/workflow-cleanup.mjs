// Shared page cleanup (originally T05's workflow-only fix). Each page's backlog is drained before
// the bounded closes; a drain that fails fails the suite, even when every close succeeds. The report
// is written, carrying that failure, before any close can end the process (a close that cannot be
// confirmed exits 125 at once and stays terminal; see bounded.mjs).
//   → true when the suite must fail (a drain or the report write failed), else false.
export async function cleanupPages({ pages, drain, report, writeReport, closeAll, log = message => console.error(message) }) {
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
  catch (error) { failed = true; log(`suite report: ${error.message}`); }
  await closeAll();
  return failed;
}

// Keep T05's API stable; workflow.mjs can adopt the shared drain independently.
export { cleanupPages as cleanupWorkflow };
