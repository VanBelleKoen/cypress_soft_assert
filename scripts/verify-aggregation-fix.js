#!/usr/bin/env node
/**
 * Verify that soft_it correctly reports aggregated failures in Cypress summary counters.
 *
 * The repro spec contains one soft_it with two intentionally wrong assertions and
 * one correct assertion. The expected Cypress CLI summary is:
 *   - 1 failing test  (the soft_it that has assertion failures)
 *   - 1 passing test  (the regular it that follows)
 *   - The SoftAssertionError message must appear in the output
 *
 * Run: node scripts/verify-aggregation-fix.js
 */

const { execSync } = require('child_process');

const SPEC = 'cypress/e2e/soft-aggregation-bug-repro.cy.ts';
const EXPECTED_PASSING = 1;
const EXPECTED_FAILING = 1;

console.log(`\nRunning spec: ${SPEC}\n`);

let rawOutput = '';
try {
  rawOutput = execSync(`npx cypress run --spec ${SPEC}`, { encoding: 'utf8' });
} catch (err) {
  // Cypress exits non-zero when tests fail — that is expected here.
  rawOutput = (err.stdout || '') + (err.stderr || '');
}

// The Cypress summary TABLE uses "│ Passing: N" and "│ Failing: N".
// This is the authoritative counter used by CI / exit code.
// (The mocha spec reporter "N passing / N failing" text in the middle of
//  the output is different and can disagree with the table in the buggy version.)
const tablePassing = rawOutput.match(/│\s+Passing:\s+(\d+)/);
const tableFailing = rawOutput.match(/│\s+Failing:\s+(\d+)/);
const passing = tablePassing ? parseInt(tablePassing[1], 10) : 0;
const failing = tableFailing ? parseInt(tableFailing[1], 10) : 0;

// The SoftAssertionError must appear in the output when the bug is fixed.
const hasSoftAssertionError = rawOutput.includes('SoftAssertionError') ||
  rawOutput.includes('SOFT ASSERTION FAILURES');

console.log('─'.repeat(60));
console.log(`Summary table: ${passing} passing / ${failing} failing`);
console.log(`Expected:      ${EXPECTED_PASSING} passing / ${EXPECTED_FAILING} failing`);
console.log(`SoftAssertionError present: ${hasSoftAssertionError}`);
console.log('─'.repeat(60));

const passOk = passing === EXPECTED_PASSING;
const failOk = failing === EXPECTED_FAILING;
const errorOk = hasSoftAssertionError;

if (passOk && failOk && errorOk) {
  console.log('\n✅  PASS – soft_it correctly reports 1 failing test with SoftAssertionError.\n');
  process.exit(0);
} else {
  const issues = [];
  if (!passOk) issues.push(`  passing count: got ${passing}, expected ${EXPECTED_PASSING}`);
  if (!failOk) issues.push(`  failing count: got ${failing}, expected ${EXPECTED_FAILING} — soft failures silently swallowed (BUG)`);
  if (!errorOk) issues.push(`  SoftAssertionError missing from output — failures not surfaced (BUG)`);
  console.error('\n❌  FAIL – aggregation is broken:');
  issues.forEach((l) => console.error(l));
  console.error();
  process.exit(1);
}
