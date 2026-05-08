/// <reference types="cypress" />

/**
 * Type declarations for Cypress Soft Assertions.
 * Kept in source for local editor/type-server visibility.
 */
declare global {
  /**
   * soft_it - Define a test where all assertions are soft (non-blocking)
   *
   * All Cypress assertions (.should(), expect(), assert()) within this test block
   * will continue execution even when they fail. At the end of the test, all failures
   * are collected and reported together in a single error.
   */
  function soft_it(title: string, fn: Mocha.Func | Mocha.AsyncFunc): Mocha.Test;

  namespace soft_it {
    /** Run only this test (like it.only) */
    function only(title: string, fn: Mocha.Func | Mocha.AsyncFunc): Mocha.Test;

    /** Skip this test (like it.skip) */
    function skip(title: string, fn: Mocha.Func | Mocha.AsyncFunc): void;
  }
}

export { };
