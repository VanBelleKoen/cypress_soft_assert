/**
 * Cypress Soft Assertions Plugin
 *
 * Provides soft_it() function that wraps Cypress tests to make all assertions soft.
 * Assertions don't stop execution on failure - they continue and all failures are
 * aggregated and reported at the end of the test.
 *
 * Architecture:
 * - Chai's Assertion.prototype.assert is patched to intercept assertion failures.
 * - During retries, failures are rethrown so Cypress can retry.
 * - Once the retry window expires, the error is swallowed (not rethrown).
 *   This lets Cypress consider the command "passed" and continue the queue.
 * - A fail handler catches non-assertion errors (e.g. element-not-found timeouts).
 * - An afterEach hook finalizes: aggregates all failures and reports them.
 */

interface ErrorEntry {
  message: string;
  stack?: string;
}

let softAssertionErrors: ErrorEntry[] = [];
let retryAssertionFailures = new Map<string, ErrorEntry>();
let retryFirstSeen = new Map<string, number>();
let isInSoftTest = false;
let activeFailHandler: ((error: any) => false | void) | null = null;
let originalChaiAssert: ((...args: any[]) => any) | null = null;

function getEffectiveTimeout(): number {
  try {
    const current = (cy as any).state('current');
    const perCommand = current?.get?.('timeout');
    if (typeof perCommand === 'number') return perCommand;
  } catch { /* ignore */ }
  try {
    return Cypress.config('defaultCommandTimeout') as number || 4000;
  } catch { return 4000; }
}

function captureSoftAssertion(error: any) {
  const message = error?.message || String(error);
  const stack = error?.stack;

  const lastEntry = softAssertionErrors[softAssertionErrors.length - 1];
  if (!lastEntry || lastEntry.message !== message || lastEntry.stack !== stack) {
    softAssertionErrors.push({ message, stack });
  }
}

function getSubjectKey(assertionContext: any) {
  const obj = assertionContext?._obj;
  const first = Array.isArray(obj) ? obj[0] : obj?.[0];
  if (first && typeof first.id === 'string' && first.id.length > 0) {
    return `#${first.id}`;
  }
  const selector = obj?.selector;
  if (typeof selector === 'string' && selector.length > 0) {
    return selector;
  }
  return '';
}

function toTokenPart(value: any) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function getRetryableCommandId(): string {
  try {
    const current = (cy as any).state('current');
    if (!current) return '';
    const assertionCmd = current.get?.('currentAssertionCommand');
    if (assertionCmd) {
      const id = assertionCmd.get?.('id') ?? assertionCmd.id ?? '';
      return id ? String(id) : '';
    }
    if (current.get?.('followedByShouldCallback')) {
      const id = current.get?.('id') ?? '';
      return id ? String(id) : '';
    }
  } catch { /* ignore */ }
  return '';
}

function getAssertionToken(assertionContext: any, args: any[]) {
  const subjectKey = getSubjectKey(assertionContext);
  if (!subjectKey) return '';
  const expected = args?.[3];
  return `${subjectKey}|${toTokenPart(expected)}`;
}

function patchChaiAssertions() {
  const assertionProto = (chai as any)?.Assertion?.prototype;
  if (!assertionProto || typeof assertionProto.assert !== 'function') return;
  if (!originalChaiAssert) originalChaiAssert = assertionProto.assert;
  if (assertionProto.assert === patchedAssertionAssert) return;
  assertionProto.assert = patchedAssertionAssert;
}

function resolveStableToken(assertionContext: any, args: any[]): string {
  const token = getAssertionToken(assertionContext, args);
  if (token) return token;

  const retryableCid = getRetryableCommandId();
  if (retryableCid) return `__cmd__|${retryableCid}|${toTokenPart(args?.[3])}`;

  return '';
}

function patchedAssertionAssert(this: any, ...args: any[]) {
  if (!originalChaiAssert) return;

  try {
    const result = originalChaiAssert.apply(this, args);

    // Assertion passed — clear any staged failure for this token.
    if (isInSoftTest) {
      const token = resolveStableToken(this, args);
      if (token) {
        retryAssertionFailures.delete(token);
        retryFirstSeen.delete(token);
      }
    }

    return result;
  } catch (error) {
    if (!isInSoftTest) throw error;

    const errorEntry: ErrorEntry = {
      message: String((error as any)?.message || error),
      stack: (error as any)?.stack,
    };

    const token = resolveStableToken(this, args);

    if (token) {
      // Track when we first saw this failure.
      if (!retryFirstSeen.has(token)) {
        retryFirstSeen.set(token, Date.now());
      }

      // Stage the failure so it can be cleared if a later retry succeeds.
      retryAssertionFailures.set(token, errorEntry);

      // Check if the retry window has expired. Swallow slightly before
      // Cypress's own timeout to prevent it from firing the fail event.
      // Cypress retries every ~50ms, so subtracting 100ms ensures we
      // catch at least 1-2 more retries before the deadline.
      const elapsed = Date.now() - retryFirstSeen.get(token)!;
      const timeout = getEffectiveTimeout();
      const swallowAt = Math.max(timeout - 100, timeout * 0.9);

      if (elapsed < swallowAt) {
        // Still within the retry window — rethrow so Cypress retries.
        throw error;
      }

      // Retry window expired. Swallow the error: Cypress considers the
      // assertion "passed", the command resolves, and the queue continues.
      // The failure is already staged in retryAssertionFailures and will
      // be promoted to softAssertionErrors during finalization.
      return;
    }

    // No stable token (e.g. bare expect() in .then() callbacks).
    // Capture directly and swallow so the queue continues.
    captureSoftAssertion(error);
  }
}

function setupSoftAssertions() {
  patchChaiAssertions();

  // Fail handler for non-assertion errors (e.g. element-not-found after
  // cy.get timeout). These don't go through Chai's assert at all.
  if (!activeFailHandler) {
    activeFailHandler = (error: any) => {
      if (!isInSoftTest) throw error;

      // Final aggregated error must propagate to fail the test.
      if (String(error?.name || '') === 'SoftAssertionError') throw error;

      // Check if this is an assertion error that was already handled by
      // patchedAssertionAssert (swallowed after timeout). In that case
      // the fail handler should NOT fire. But for non-assertion command
      // failures (e.g. cy.get can't find element), capture as soft failure.
      captureSoftAssertion(error);

      // Clear any matching retry-tracked entry to prevent double-counting.
      const errorMsg = error?.message || String(error);
      for (const [token, entry] of retryAssertionFailures.entries()) {
        if (entry.message === errorMsg) {
          retryAssertionFailures.delete(token);
          retryFirstSeen.delete(token);
          break;
        }
      }

      return false;
    };

    Cypress.on('fail', activeFailHandler);
  }
}

function restoreAssertions() {
  if (activeFailHandler) {
    Cypress.off('fail', activeFailHandler);
    activeFailHandler = null;
  }

  if (originalChaiAssert) {
    const assertionProto = (chai as any)?.Assertion?.prototype;
    if (assertionProto) assertionProto.assert = originalChaiAssert;
  }
}

function buildSoftAssertionError() {
  // Promote any remaining retry-tracked failures that weren't already
  // captured by the fail handler (dedup by message).
  for (const entry of retryAssertionFailures.values()) {
    const isDuplicate = softAssertionErrors.some(e => e.message === entry.message);
    if (!isDuplicate) {
      softAssertionErrors.push(entry);
    }
  }
  retryAssertionFailures.clear();
  retryFirstSeen.clear();

  if (softAssertionErrors.length > 0) {
    const errorMessages = softAssertionErrors
      .map((entry, index) => `  ${index + 1}. ${entry.message}`)
      .join('\n');

    const finalMessage = [
      '',
      '='.repeat(80),
      `SOFT ASSERTION FAILURES (${softAssertionErrors.length} failed):`,
      '='.repeat(80),
      errorMessages,
      '='.repeat(80),
      '',
    ].join('\n');

    softAssertionErrors = [];

    const error = new Error(finalMessage);
    error.name = 'SoftAssertionError';
    return error;
  }

  return null;
}

function finalizeSoftTest() {
  isInSoftTest = false;
  restoreAssertions();
  return buildSoftAssertionError();
}

function abortSoftTest() {
  isInSoftTest = false;
  restoreAssertions();
  retryAssertionFailures.clear();
  retryFirstSeen.clear();
}

function createSoftIt(baseIt: typeof it) {
  return function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
    return baseIt(title, function (this: Mocha.Context) {
      isInSoftTest = true;
      softAssertionErrors = [];
      retryAssertionFailures.clear();
      retryFirstSeen.clear();
      setupSoftAssertions();

      try {
        return (fn as any).call(this);
      } catch (error) {
        abortSoftTest();
        throw error;
      }
    });
  };
}

/**
 * soft_it - Define a test where all assertions are soft (non-blocking)
 *
 * All Cypress assertions (.should(), expect(), assert()) within this test
 * will continue execution on failure. At the end, all failures are reported together.
 *
 * @param title - Test title
 * @param fn - Test function
 *
 * @example
 * soft_it('validates multiple fields', () => {
 *   cy.visit('/page');
 *   cy.get('.name').should('have.text', 'John');  // Won't stop if fails
 *   cy.get('.age').should('have.text', '25');     // Won't stop if fails
 *   cy.get('.city').should('have.text', 'NYC');   // Won't stop if fails
 * });
 */
(globalThis as any).soft_it = createSoftIt(it);

/**
 * soft_it.only - Run only this soft test
 */
(globalThis as any).soft_it.only = createSoftIt(it.only as typeof it);

/**
 * soft_it.skip - Skip this soft test
 */
(globalThis as any).soft_it.skip = it.skip;

// Global afterEach hook: finalize soft assertions after each test.
// Registered at the root level so it applies to all suites.
// For non-soft tests (isInSoftTest === false), this is a no-op.
afterEach(function () {
  if (!isInSoftTest) return;
  const finalError = finalizeSoftTest();
  if (finalError) {
    // Use runner.fail() to mark the TEST as failed rather than the hook.
    // Throwing from afterEach would skip remaining tests in the suite.
    const runner = (Cypress as any).mocha?.getRunner();
    const test = this.currentTest;
    if (runner && test) {
      runner.fail(test, finalError);
    } else {
      throw finalError;
    }
  }
});

// Type declarations for TypeScript
declare global {
  /**
   * soft_it - Define a test where all assertions are soft (non-blocking)
   *
   * All Cypress assertions (.should(), expect(), assert()) within this test block
   * will continue execution even when they fail. At the end of the test, all failures
   * are collected and reported together in a single error.
   *
   * @param title - Test title
   * @param fn - Test function
   *
   * @example
   * soft_it('validates product page', () => {
   *   cy.visit('/product/123');
   *   cy.get('.title').should('have.text', 'Product Name');
   *   cy.get('.price').should('have.text', '$99.99');
   *   cy.get('.stock').should('contain', 'In Stock');
   *   // All assertions run, failures reported together at the end
   * });
   */
  function soft_it(title: string, fn: Mocha.Func | Mocha.AsyncFunc): Mocha.Test;

  namespace soft_it {
    /**
     * Run only this test (like it.only)
     */
    function only(title: string, fn: Mocha.Func | Mocha.AsyncFunc): Mocha.Test;

    /**
     * Skip this test (like it.skip)
     */
    function skip(title: string, fn: Mocha.Func | Mocha.AsyncFunc): void;
  }
}

export { };
