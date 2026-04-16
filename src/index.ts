/**
 * Cypress Soft Assertions Plugin
 *
 * Provides soft_it() function that wraps Cypress tests to make all assertions soft.
 * Assertions don't stop execution on failure - they continue and all failures are
 * aggregated and reported at the end of the test.
 */

interface ErrorEntry {
  message: string;
  stack?: string;
}

let softAssertionErrors: ErrorEntry[] = [];
let retryAssertionFailures = new Map<string, ErrorEntry>();
let retryAttemptCount = new Map<string, number>();
let isInSoftTest = false;
let activeFailHandler: ((error: any) => false | void) | null = null;
let originalChaiAssert: ((...args: any[]) => any) | null = null;

// After this many consecutive assertion failures on the same token, stop
// rethrowing (which would cause Cypress to retry) and swallow instead.
// This gives Cypress enough retry cycles for assertions that will eventually
// pass, while bounding the time spent on definitively failing assertions.
const MAX_RETHROWS = 10;

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

function patchedAssertionAssert(this: any, ...args: any[]) {
  if (!originalChaiAssert) return;

  try {
    const result = originalChaiAssert.apply(this, args);

    // Assertion passed — clear any staged failure for this token.
    if (isInSoftTest) {
      const token = getAssertionToken(this, args);
      if (token) {
        retryAssertionFailures.delete(token);
        retryAttemptCount.delete(token);
      }
    }

    return result;
  } catch (error) {
    if (!isInSoftTest) throw error;

    const token = getAssertionToken(this, args);

    if (token) {
      // Stage the failure under a stable token so it can be cleared if
      // a later retry succeeds.
      retryAssertionFailures.set(token, {
        message: String((error as any)?.message || error),
        stack: (error as any)?.stack,
      });

      const attempts = (retryAttemptCount.get(token) || 0) + 1;
      retryAttemptCount.set(token, attempts);

      if (attempts <= MAX_RETHROWS) {
        // Rethrow to let Cypress retry the assertion. This gives retriable
        // commands (should/and, retried from get/contains/etc.) a window
        // to eventually pass.
        throw error;
      }

      // Past the retry budget — swallow so the command "succeeds" and Cypress
      // moves on to the next queued command. The token stays in the Map and
      // will be promoted to softAssertionErrors at finalization.
      return;
    }

    // No identifiable subject — capture directly (e.g. bare expect() calls
    // in .then() callbacks).
    captureSoftAssertion(error);
  }
}

function setupSoftAssertions() {
  patchChaiAssertions();

  if (!activeFailHandler) {
    activeFailHandler = (error: any) => {
      if (!isInSoftTest) throw error;

      // Final aggregated error must propagate to fail the test.
      if (String(error?.name || '') === 'SoftAssertionError') throw error;

      // Non-assertion command failures (e.g. element not found timeouts)
      // are captured as soft failures.
      captureSoftAssertion(error);
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
  // Promote any remaining retry-tracked failures.
  for (const entry of retryAssertionFailures.values()) {
    captureSoftAssertion(entry);
  }
  retryAssertionFailures.clear();
  retryAttemptCount.clear();

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
  retryAttemptCount.clear();
}

function createSoftIt(baseIt: typeof it) {
  return function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
    return baseIt(title, function (this: Mocha.Context) {
      isInSoftTest = true;
      softAssertionErrors = [];
      retryAssertionFailures.clear();
      retryAttemptCount.clear();
      setupSoftAssertions();

      let result: unknown;

      try {
        result = (fn as any).call(this);
      } catch (error) {
        abortSoftTest();
        throw error;
      }

      // Finalize from inside the test chain (not from hooks) so Cypress counts
      // the failure on the test itself.
      return cy.then(() => {
        return Cypress.Promise.resolve(result)
          .catch((error: any) => {
            if (isInSoftTest) {
              abortSoftTest();
            }
            throw error;
          })
          .then(() => {
            const finalError = finalizeSoftTest();
            if (finalError) {
              throw finalError;
            }
          });
      });
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
