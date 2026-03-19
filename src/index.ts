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
let activeFailHandler: ((error: any) => false | void) | null = null;
let activeSoftTestTitle: string | null = null;
let finalizerInstalled = false;

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

function getCurrentCommandName() {
  const state = (cy as any)?.state;
  if (typeof state !== 'function') {
    return '';
  }

  const current = state('current');
  if (!current) {
    return '';
  }

  if (typeof current.get === 'function') {
    return String(current.get('name') || '');
  }

  return String(current.name || current.attributes?.name || '');
}

function isRetryTimeoutError(error: any) {
  const message = String(error?.message || '');
  return /Timed out retrying after/i.test(message);
}

function isRetriableAssertionCommand(commandName: string) {
  return commandName === 'should' || commandName === 'and';
}

/**
 * Intercept Cypress failures and make assertion failures soft in soft_it() tests.
 */
function setupSoftAssertions() {
  if (!activeFailHandler) {
    activeFailHandler = (error: any) => {
      if (!isInSoftTest) {
        throw error;
      }

      const commandName = getCurrentCommandName();
      if (isRetriableAssertionCommand(commandName) && !isRetryTimeoutError(error)) {
        // Let Cypress continue polling/retrying for retriable assertions.
        throw error;
      }

      captureSoftAssertion(error);
      return false;
    };

    Cypress.on('fail', activeFailHandler);
  }
}

function getTestTitle(test: any) {
  if (test && typeof test.fullTitle === 'function') {
    return test.fullTitle();
  }

  return String(test?.title || '');
}

function installFinalizer() {
  if (finalizerInstalled) {
    return;
  }

  afterEach(function (this: Mocha.Context) {
    if (!isInSoftTest) {
      return;
    }

    const currentTest = (this.currentTest || this.test) as Mocha.Test & { err?: Error; state?: string };
    if (!currentTest || getTestTitle(currentTest) !== activeSoftTestTitle) {
      return;
    }

    const finalError = finalizeSoftTest();
    if (!finalError) {
      return;
    }

    currentTest.err = finalError;
    currentTest.state = 'failed';

    const runner = (Cypress as any)?.mocha?.getRunner?.();
    if (runner && typeof runner.fail === 'function') {
      runner.fail(currentTest, finalError);
      return;
    }

    throw finalError;
  });

  finalizerInstalled = true;
}

/**
 * Restore original Chai assertion behavior.
 */
function restoreAssertions() {
  if (activeFailHandler) {
    Cypress.off('fail', activeFailHandler);
    activeFailHandler = null;
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
  activeSoftTestTitle = null;
  return buildSoftAssertionError();
}

/**
 * Cleanup soft assertion state without reporting (used on hard failures).
 */
function abortSoftTest() {
  isInSoftTest = false;
  restoreAssertions();
  activeSoftTestTitle = null;
}

/**
 * Create a soft_it variant from a Mocha it function.
 */
function createSoftIt(baseIt: typeof it) {
  installFinalizer();

  return function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
    return baseIt(title, function (this: Mocha.Context) {
      isInSoftTest = true;
      softAssertionErrors = [];
      activeSoftTestTitle = getTestTitle(this.currentTest || this.test);
      setupSoftAssertions();

      try {
        const result = (fn as any).call(this);

        if (result && typeof (result as any).then === 'function') {
          return (result as any)
            .catch((error: any) => {
              abortSoftTest();
              throw error;
            });
        }

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
