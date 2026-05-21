import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import cypress from 'cypress';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/**
 * Runs a Cypress spec programmatically via the cypress.run() API
 * and returns the structured result object.
 */
async function runSpec(specPath) {
  const fullPath = path.resolve(root, specPath);
  const result = await cypress.run({
    spec: fullPath,
    config: {
      specPattern: fullPath,
      video: false,
    },
    quiet: true,
  });

  if ('status' in result && result.status === 'failed') {
    throw new Error(`Cypress failed to run: ${result.message}`);
  }

  return result;
}

function findTest(run, title) {
  for (const test of run.tests || []) {
    if (Array.isArray(test.title)
      ? test.title.some(t => t.includes(title))
      : test.title?.includes(title)) {
      return test;
    }
  }
  return null;
}

function hasSoftAssertionError(test) {
  return (test.displayError || '').includes('SoftAssertionError');
}

describe('programmatic runner: expected-failures fixture', () => {
  let runs;

  it('runs the fixture spec', async () => {
    const result = await runSpec('cypress/e2e/fixtures/expected-failures.cy.ts');
    assert.ok(result.runs?.length > 0, 'Should have at least one run');
    runs = result.runs[0];
    assert.ok(runs.tests?.length > 0, 'Should have tests');
  });

  it('has the expected number of tests', () => {
    assert.equal(runs.tests.length, 5);
  });

  it('has exactly 3 clean passing tests', () => {
    const clean = runs.tests.filter(t => t.state === 'passed' && !hasSoftAssertionError(t));
    assert.equal(clean.length, 3, `Clean tests: ${clean.map(t => t.title).join(', ')}`);
  });

  it('has exactly 2 tests with SoftAssertionError', () => {
    const softFailed = runs.tests.filter(t => hasSoftAssertionError(t));
    assert.equal(softFailed.length, 2, `Soft-failed tests: ${softFailed.map(t => t.title).join(', ')}`);
    // Verify that soft-failed tests are reported with state 'failed' in cypress.run() API
    for (const t of softFailed) {
      assert.equal(t.state, 'failed', `Expected state 'failed' for "${t.title}", got '${t.state}'`);
    }
  });

  it('"two soft failures aggregated" has SoftAssertionError with 2 failures', () => {
    const test = findTest(runs, 'two soft failures aggregated');
    assert.ok(test, 'Test should exist');
    assert.ok(hasSoftAssertionError(test), 'Should have SoftAssertionError');
    assert.ok(
      test.displayError.includes('2 failed'),
      `Expected "2 failed" in displayError, got: ${test.displayError.slice(0, 200)}`
    );
  });

  it('"missing element captured as soft failure" has SoftAssertionError with 1 failure', () => {
    const test = findTest(runs, 'missing element captured as soft failure');
    assert.ok(test, 'Test should exist');
    assert.ok(hasSoftAssertionError(test), 'Should have SoftAssertionError');
    assert.ok(
      test.displayError.includes('1 failed'),
      `Expected "1 failed" in displayError, got: ${test.displayError.slice(0, 200)}`
    );
  });

  it('"all passing" has no errors', () => {
    const test = findTest(runs, 'all passing');
    assert.ok(test, 'Test should exist');
    assert.equal(test.state, 'passed');
    assert.ok(!hasSoftAssertionError(test), 'Should not have SoftAssertionError');
  });

  it('"no leaked state from previous tests" has no errors', () => {
    const test = findTest(runs, 'no leaked state');
    assert.ok(test, 'Test should exist');
    assert.equal(test.state, 'passed');
    assert.ok(!hasSoftAssertionError(test), 'Should not have SoftAssertionError');
  });
});

describe('programmatic runner: translation-checker interplay fixture', () => {
  let runs;

  it('runs the interplay fixture spec', async () => {
    const result = await runSpec('cypress/e2e/fixtures/soft-translation-interplay.cy.ts');
    assert.ok(result.runs?.length > 0, 'Should have at least one run');
    runs = result.runs[0];
    assert.ok(runs.tests?.length > 0, 'Should have tests');
  });

  it('has the expected number of tests', () => {
    assert.equal(runs.tests.length, 3);
  });

  it('has exactly 1 clean passing test', () => {
    const clean = runs.tests.filter(t => t.state === 'passed' && !hasSoftAssertionError(t));
    assert.equal(clean.length, 1, `Clean tests: ${clean.map(t => t.title).join(', ')}`);
  });

  it('has exactly 2 tests with SoftAssertionError', () => {
    const softFailed = runs.tests.filter(t => hasSoftAssertionError(t));
    assert.equal(softFailed.length, 2, `Soft-failed tests: ${softFailed.map(t => t.title).join(', ')}`);
    // Verify that soft-failed tests are reported with state 'failed' in cypress.run() API
    for (const t of softFailed) {
      assert.equal(t.state, 'failed', `Expected state 'failed' for "${t.title}", got '${t.state}'`);
    }
  });

  it('"soft failure still aggregates with translation checker enabled" has SoftAssertionError', () => {
    const test = findTest(runs, 'soft failure still aggregates with translation checker enabled');
    assert.ok(test, 'Test should exist');
    assert.ok(hasSoftAssertionError(test), 'Should have SoftAssertionError');
    assert.ok(
      test.displayError.includes('1 failed'),
      `Expected "1 failed" in displayError, got: ${test.displayError.slice(0, 200)}`
    );
  });

  it('"missing element remains a soft failure with translation checker enabled" has SoftAssertionError', () => {
    const test = findTest(runs, 'missing element remains a soft failure with translation checker enabled');
    assert.ok(test, 'Test should exist');
    assert.ok(hasSoftAssertionError(test), 'Should have SoftAssertionError');
    assert.ok(
      test.displayError.includes('1 failed'),
      `Expected "1 failed" in displayError, got: ${test.displayError.slice(0, 200)}`
    );
  });
});

describe('programmatic runner: final soft assertion failure fixture', () => {
  let runs;

  it('runs the final-failure fixture spec', async () => {
    const result = await runSpec('cypress/e2e/fixtures/strict-mode.behavior.cy.ts');
    assert.ok(result.runs?.length > 0, 'Should have at least one run');
    runs = result.runs[0];
    assert.ok(runs.tests?.length > 0, 'Should have tests');
  });

  it('has the expected number of tests', () => {
    assert.equal(runs.tests.length, 3);
  });

  it('has exactly 2 clean passing tests', () => {
    const clean = runs.tests.filter(t => t.state === 'passed' && !hasSoftAssertionError(t));
    assert.equal(clean.length, 2, `Clean tests: ${clean.map(t => t.title).join(', ')}`);
  });

  it('"final soft failure is reported as failed test" has failure details', () => {
    const test = findTest(runs, 'final soft failure is reported as failed test');
    assert.ok(test, 'Test should exist');
    const message = String(test.displayError || '');
    assert.ok(
      message.includes('SoftAssertionError') || message.includes('SOFT ASSERTION FAILURES'),
      `Expected SoftAssertionError content in displayError, got: ${message.slice(0, 200)}`
    );
  });

  it('final soft failure is reported with SoftAssertionError message', () => {
    const test = findTest(runs, 'final soft failure is reported as failed test');
    assert.ok(test, 'Test should exist');
    const message = String(test.displayError || '');
    assert.ok(
      message.includes('SoftAssertionError') || message.includes('SOFT ASSERTION FAILURES'),
      `Expected SoftAssertionError content in displayError, got: ${message.slice(0, 200)}`
    );
  });
});

describe('programmatic runner: Cypress retries fixture', () => {
  let runs;

  it('runs the retries fixture spec', async () => {
    const result = await runSpec('cypress/e2e/fixtures/retries.behavior.cy.ts');
    assert.ok(result.runs?.length > 0, 'Should have at least one run');
    runs = result.runs[0];
    assert.ok(runs.tests?.length > 0, 'Should have tests');
  });

  it('retries the failed soft_it and reports a passing final result', () => {
    const test = findTest(runs, 'retries the test and passes on the second attempt');
    assert.ok(test, 'Test should exist');
    assert.equal(test.state, 'passed');
    assert.ok(!hasSoftAssertionError(test), 'Should not have SoftAssertionError after retry success');
  });

  it('records more than one attempt for the retried soft_it', () => {
    const test = findTest(runs, 'retries the test and passes on the second attempt');
    assert.ok(test, 'Test should exist');
    assert.ok(Array.isArray(test.attempts), 'Expected test.attempts to be present');
    assert.equal(test.attempts.length, 2, `Expected 2 attempts, got ${test.attempts?.length}`);
    assert.equal(test.attempts[0]?.state, 'failed');
    assert.equal(test.attempts[1]?.state, 'passed');
  });
});
