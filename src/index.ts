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

import {
  ErrorEntry,
  getAssertionToken,
  appendUniqueError,
  mergeRetryFailures,
  resolveToken,
  formatSoftAssertionErrors,
} from './utils';

let softAssertionErrors: ErrorEntry[] = [];
let retryAssertionFailures = new Map<string, ErrorEntry>();
let retryFirstSeen = new Map<string, number>();
let isInSoftTest = false;
let expectSoftFailureCurrentSoftTest = false;
let activeFailHandler: ((error: any) => false | void) | null = null;
let originalChaiAssert: ((...args: any[]) => any) | null = null;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal helpers (Cypress-dependent — not unit-testable in isolation)
// ---------------------------------------------------------------------------

function captureSoftAssertion(error: any) {
  const message = error?.message || String(error);
  const stack = error?.stack;
  appendUniqueError(softAssertionErrors, message, stack);
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

function patchChaiAssertions() {
  const assertionProto = (chai as any)?.Assertion?.prototype;
  if (!assertionProto || typeof assertionProto.assert !== 'function') return;
  if (!originalChaiAssert) originalChaiAssert = assertionProto.assert;
  if (assertionProto.assert === patchedAssertionAssert) return;
  assertionProto.assert = patchedAssertionAssert;
}

function resolveStableToken(assertionContext: any, args: any[]): string {
  const assertionToken = getAssertionToken(assertionContext, args);
  if (assertionToken) return assertionToken;

  const commandId = getRetryableCommandId();
  if (commandId) return resolveToken('', commandId, args);

  return '';
}

function isRunningHookContext(): boolean {
  try {
    const runnable = (cy as any).state('runnable');
    const type = runnable?.type ?? runnable?._type;
    return type === 'hook';
  } catch {
    return false;
  }
}

function patchedAssertionAssert(this: any, ...args: any[]) {
  if (!originalChaiAssert) return;

  // Fast path for non-soft tests: avoid try/catch and token logic entirely.
  if (!isInSoftTest) {
    return originalChaiAssert.apply(this, args);
  }

  try {
    const result = originalChaiAssert.apply(this, args);

    // Assertion passed — clear any staged failure for this token.
    const token = resolveStableToken(this, args);
    if (token) {
      retryAssertionFailures.delete(token);
      retryFirstSeen.delete(token);
    }

    return result;
  } catch (error) {
    if (isRunningHookContext()) throw error;

    const errorEntry: ErrorEntry = {
      message: String((error as any)?.message || error),
      stack: (error as any)?.stack,
    };

    const token = resolveStableToken(this, args);

    if (token) {
      // Stage the failure so it can be cleared if a later retry succeeds.
      retryAssertionFailures.set(token, errorEntry);

      const current = (cy as any).state('current');
      const wallClockStartedAt = current?.get?.('wallClockStartedAt');
      const timeout = getEffectiveTimeout();

      if (typeof wallClockStartedAt === 'number') {
        const totalElapsed = Date.now() - wallClockStartedAt;
        // Swallow only when very close to the actual command timeout.
        // A 20ms buffer maximizes retry attempts while still preventing
        // Cypress's global fail handler from aborting the test queue.
        if (totalElapsed < timeout - 20) {
          throw error;
        }
      } else {
        // Fallback for cases where wallClockStartedAt is missing.
        if (!retryFirstSeen.has(token)) {
          retryFirstSeen.set(token, Date.now());
        }
        const elapsed = Date.now() - retryFirstSeen.get(token)!;
        const swallowAt = Math.max(timeout - 100, timeout * 0.9);
        if (elapsed < swallowAt) {
          throw error;
        }
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
      if (isRunningHookContext()) throw error;

      // Final aggregated error must propagate to fail the test.
      if (String(error?.name || '') === 'SoftAssertionError') throw error;

      const runnable = (cy as any).state('runnable');
      const retryStatusInfo = getRetryStatusInfo(runnable);

      if (retryStatusInfo.shouldAttemptsContinue) {
        abortSoftTest();
        throw error;
      }

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
  softAssertionErrors = mergeRetryFailures(softAssertionErrors, retryAssertionFailures);
  retryAssertionFailures.clear();
  retryFirstSeen.clear();

  const finalMessage = formatSoftAssertionErrors(softAssertionErrors);
  if (finalMessage !== null) {
    softAssertionErrors = [];
    const error = new Error(finalMessage);
    error.name = 'SoftAssertionError';
    return error;
  }

  return null;
}

function finalizeSoftTest() {
  isInSoftTest = false;
  expectSoftFailureCurrentSoftTest = false;
  restoreAssertions();
  return buildSoftAssertionError();
}

function abortSoftTest() {
  isInSoftTest = false;
  expectSoftFailureCurrentSoftTest = false;
  restoreAssertions();
  retryAssertionFailures.clear();
  retryFirstSeen.clear();
}

function getRetryStatusInfo(test: any) {
  const currentRetry = typeof test?.currentRetry === 'function'
    ? test.currentRetry()
    : typeof Cypress.currentRetry === 'number'
      ? Cypress.currentRetry
      : 0;

  const maxRetries = typeof test?.retries === 'function'
    ? test.retries()
    : typeof test?._retries === 'number'
      ? test._retries
      : typeof Cypress.getTestRetries === 'function'
        ? Cypress.getTestRetries() ?? 0
        : 0;

  return {
    attempts: currentRetry + 1,
    shouldAttemptsContinue: currentRetry < maxRetries,
  };
}

function finalizeSoftTestInQueue(expectsSoftFailure: boolean) {
  return cy.then(() => {
    if (!isInSoftTest) return;

    const finalError = finalizeSoftTest();

    if (expectsSoftFailure) {
      if (!finalError) {
        throw new Error('Expected SoftAssertionError but soft_it.expectFailure test completed without one.');
      }

      return;
    }

    if (finalError) {
      throw finalError;
    }
  });
}

function createSoftIt(baseIt: typeof it, options?: { expectFailure?: boolean }) {
  return function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
    return baseIt(title, function (this: Mocha.Context) {
      isInSoftTest = true;
      expectSoftFailureCurrentSoftTest = Boolean(options?.expectFailure);
      softAssertionErrors = [];
      retryAssertionFailures.clear();
      retryFirstSeen.clear();
      setupSoftAssertions();

      try {
        const result = (fn as any).call(this);

        if (result && typeof (result as PromiseLike<unknown>).then === 'function' && !Cypress.isCy(result)) {
          return Cypress.Promise.resolve(result).then(() => {
            finalizeSoftTestInQueue(expectSoftFailureCurrentSoftTest);
          });
        }

        finalizeSoftTestInQueue(expectSoftFailureCurrentSoftTest);
        return result;
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
 * soft_it.expectFailure - Run a soft test that is expected to aggregate
 * into a final SoftAssertionError without failing the enclosing behavior spec.
 */
(globalThis as any).soft_it.expectFailure = createSoftIt(it, { expectFailure: true });

/**
 * soft_it.expectFailure.only - Run only this expected-failure soft test.
 */
(globalThis as any).soft_it.expectFailure.only = createSoftIt(it.only as typeof it, { expectFailure: true });

/**
 * soft_it.skip - Skip this soft test
 */
(globalThis as any).soft_it.skip = it.skip;

// Global afterEach hook: finalize soft assertions after each test.
// Registered at the root level so it applies to all suites.
// For non-soft tests (isInSoftTest === false), this is a no-op.
afterEach(function () {
  if (!isInSoftTest) return;
  const expectsSoftFailure = expectSoftFailureCurrentSoftTest;
  const finalError = finalizeSoftTest();
  if (expectsSoftFailure) {
    if (!finalError) {
      throw new Error('Expected SoftAssertionError but soft_it.expectFailure test completed without one.');
    }
    return;
  }
  if (finalError) {
    const test = (this as any).currentTest;
    if (test) {
      const retryStatusInfo = getRetryStatusInfo(test);

      if (retryStatusInfo.shouldAttemptsContinue) {
        throw finalError;
      }

      test.err = finalError;
      test._cypressTestStatusInfo = {
        outerStatus: 'failed',
        shouldAttemptsContinue: retryStatusInfo.shouldAttemptsContinue,
        attempts: retryStatusInfo.attempts,
        strategy: 'detect-flake-and-pass-on-threshold',
      };

      const prevAttempts = Array.isArray(test.prevAttempts) ? test.prevAttempts : [];

      if (!prevAttempts.some((attempt: any) => attempt?.state === 'failed' && attempt?.err)) {
        prevAttempts.unshift({
          state: 'failed',
          err: finalError,
        });
      }

      test.prevAttempts = prevAttempts;
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
     * Run a soft test that is expected to finish with a SoftAssertionError.
     */
    function expectFailure(title: string, fn: Mocha.Func | Mocha.AsyncFunc): Mocha.Test;

    namespace expectFailure {
      /** Run only this expected-failure soft test */
      function only(title: string, fn: Mocha.Func | Mocha.AsyncFunc): Mocha.Test;
    }

    /**
     * Skip this test (like it.skip)
     */
    function skip(title: string, fn: Mocha.Func | Mocha.AsyncFunc): void;
  }
}

export { };
