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

/**
 * Intercept Chai assertions to capture failures instead of throwing
 */
function setupSoftAssertions() {
  if (!originalAssert) {
    // Store the original assert function
    originalAssert = (chai as any).Assertion.prototype.assert;
  }

  // Override the assert function to capture errors
  (chai as any).Assertion.prototype.assert = function (...args: any[]) {
    if (isInSoftTest) {
      try {
        // Call the original assert
        originalAssert.apply(this, args);
      } catch (error: any) {
        // Capture the error instead of throwing
        softAssertionErrors.push({
          message: error.message,
          stack: error.stack
        });
        // Don't throw - let the test continue
      }
    } else {
      // Normal behavior for regular tests
      originalAssert.apply(this, args);
    }
  };
}

/**
 * Restore original Chai assertion behavior
 */
function restoreAssertions() {
  if (originalAssert) {
    (chai as any).Assertion.prototype.assert = originalAssert;
  }
}

/**
 * Report all collected soft assertion failures
 */
function reportSoftAssertionFailures() {
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
    const errorCount = softAssertionErrors.length;
    softAssertionErrors = [];

    // Throw the aggregated error
    const error = new Error(finalMessage);
    error.name = 'SoftAssertionError';
    throw error;
  }
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
(globalThis as any).soft_it = function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
  return it(title, function (this: Mocha.Context) {
    // Setup soft assertion mode
    isInSoftTest = true;
    softAssertionErrors = [];
    setupSoftAssertions();

    // Wrap the test function execution
    const executeTest = () => {
      try {
        const result = (fn as any).call(this);

        // Handle async tests (Cypress tests return undefined, but we need to check after cy commands)
        if (result && typeof (result as any).then === 'function') {
          return (result as any).then(
            () => {
              // Test completed - check for errors at the end
              return cy.wrap(null).then(() => {
                isInSoftTest = false;
                reportSoftAssertionFailures();
              });
            },
            (err: any) => {
              isInSoftTest = false;
              restoreAssertions();
              throw err;
            }
          );
        }

        // For Cypress tests, we need to hook into the end of the command chain
        return cy.wrap(null).then(() => {
          isInSoftTest = false;
          reportSoftAssertionFailures();
        });
      } catch (err) {
        isInSoftTest = false;
        restoreAssertions();
        throw err;
      }
    };

    return executeTest();
  });
};

/**
 * soft_it.only - Run only this soft test
 */
(globalThis as any).soft_it.only = function (title: string, fn: Mocha.Func | Mocha.AsyncFunc) {
  return it.only(title, function (this: Mocha.Context) {
    isInSoftTest = true;
    softAssertionErrors = [];
    setupSoftAssertions();

    const executeTest = () => {
      try {
        const result = (fn as any).call(this);

        if (result && typeof (result as any).then === 'function') {
          return (result as any).then(
            () => {
              return cy.wrap(null).then(() => {
                isInSoftTest = false;
                reportSoftAssertionFailures();
              });
            },
            (err: any) => {
              isInSoftTest = false;
              restoreAssertions();
              throw err;
            }
          );
        }

        return cy.wrap(null).then(() => {
          isInSoftTest = false;
          reportSoftAssertionFailures();
        });
      } catch (err) {
        isInSoftTest = false;
        restoreAssertions();
        throw err;
      }
    };

    return executeTest();
  });
};

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
