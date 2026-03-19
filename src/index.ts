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
let isInSoftTest = false;
let originalAssert: any = null;
const retryWindows = new Map<string, { startedAt: number; timeout: number }>();

/**
 * Track a soft assertion failure so it can be reported at test end.
 */
function captureSoftAssertion(error: any) {
  const message = error?.message || String(error);
  const stack = error?.stack;

  const lastEntry = softAssertionErrors[softAssertionErrors.length - 1];
  if (lastEntry && lastEntry.message === message && lastEntry.stack === stack) {
    return;
  }

  softAssertionErrors.push({
    message,
    stack
  });
}

/**
 * Read command metadata from Cypress internals in a defensive way.
 */
function getCurrentCommand() {
  const state = (cy as any)?.state;
  if (typeof state !== 'function') {
    return null;
  }

  return state('current') || null;
}

function getCommandProp(command: any, prop: string) {
  if (!command) {
    return undefined;
  }

  if (typeof command.get === 'function') {
    return command.get(prop);
  }

  if (command.attributes && prop in command.attributes) {
    return command.attributes[prop];
  }

  return command[prop];
}

/**
 * Build retry context for the currently running Cypress command.
 */
function getAssertionContext() {
  const command = getCurrentCommand();
  const commandId = String(getCommandProp(command, 'id') || getCommandProp(command, 'chainerId') || '');
  const commandName = String(getCommandProp(command, 'name') || '');
  const timeout = Number(getCommandProp(command, 'timeout')) || Number(Cypress.config('defaultCommandTimeout'));
  const isRetriable = commandName === 'should' || commandName === 'and';

  return {
    commandId,
    timeout,
    isRetriable,
  };
}

function formatSoftAssertionError(error: any, timeout: number, isRetriable: boolean) {
  const message = String(error?.message || error);

  if (isRetriable && !/Timed out retrying after/i.test(message)) {
    return {
      ...error,
      message: `Timed out retrying after ${timeout}ms: ${message}`,
    };
  }

  return error;
}

/**
 * Intercept Chai assertions and make them soft in soft_it() tests.
 */
function setupSoftAssertions() {
  if (!originalAssert) {
    originalAssert = (chai as any).Assertion.prototype.assert;
  }

  (chai as any).Assertion.prototype.assert = function (...args: any[]) {
    if (!isInSoftTest) {
      return originalAssert.apply(this, args);
    }

    const context = getAssertionContext();

    try {
      const result = originalAssert.apply(this, args);

      if (context.commandId) {
        retryWindows.delete(context.commandId);
      }

      return result;
    } catch (rawError: any) {
      const error = formatSoftAssertionError(rawError, context.timeout, context.isRetriable);

      if (context.isRetriable && context.commandId) {
        const currentWindow = retryWindows.get(context.commandId) || {
          startedAt: Date.now(),
          timeout: context.timeout,
        };

        retryWindows.set(context.commandId, currentWindow);
        const elapsed = Date.now() - currentWindow.startedAt;

        if (elapsed < currentWindow.timeout) {
          throw rawError;
        }

        retryWindows.delete(context.commandId);
      }

      captureSoftAssertion(error);
      return;
    }
  };
}

/**
 * Restore original Chai assertion behavior.
 */
function restoreAssertions() {
  retryWindows.clear();

  if (originalAssert) {
    (chai as any).Assertion.prototype.assert = originalAssert;
  }
}

/**
 * Report all collected soft assertion failures
 */
function buildSoftAssertionError() {
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
      ''
    ].join('\n');

    // Clear errors
    softAssertionErrors = [];

    const error = new Error(finalMessage);
    error.name = 'SoftAssertionError';
    return error;
  }

  return null;
}

/**
 * Cleanup soft assertion state and report accumulated failures.
 */
function finalizeSoftTest() {
  isInSoftTest = false;
  restoreAssertions();
  return buildSoftAssertionError();
}

/**
 * Cleanup soft assertion state without reporting (used on hard failures).
 */
function abortSoftTest() {
  isInSoftTest = false;
  restoreAssertions();
}

/**
 * Create a soft_it variant from a Mocha it function.
 */
function createSoftIt(baseIt: typeof it) {
  return function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
    return baseIt(title, function (this: Mocha.Context) {
      isInSoftTest = true;
      softAssertionErrors = [];
      setupSoftAssertions();

      try {
        const result = (fn as any).call(this);

        if (result && typeof (result as any).then === 'function') {
          return (result as any)
            .catch((error: any) => {
              if (error?.name === 'AssertionError') {
                captureSoftAssertion(error);
                return;
              }

              abortSoftTest();
              throw error;
            })
            .then(() => cy.wrap(null).then(() => {
              const finalError = finalizeSoftTest();
              if (finalError) {
                throw finalError;
              }
            }));
        }

        return cy.wrap(null).then(() => {
          const finalError = finalizeSoftTest();
          if (finalError) {
            throw finalError;
          }
        });
      } catch (error) {
        if ((error as any)?.name === 'AssertionError') {
          captureSoftAssertion(error);
          return cy.wrap(null).then(() => {
            const finalError = finalizeSoftTest();
            if (finalError) {
              throw finalError;
            }
          });
        }

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
