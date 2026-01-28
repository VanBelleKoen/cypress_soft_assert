/// <reference types="cypress" />

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
 * 
 * @example
 * soft_it('validates form fields', () => {
 *   cy.get('#name').should('have.value', 'John');
 *   cy.get('#email').should('have.value', 'john@example.com');
 *   cy.get('#age').should('have.value', '25');
 * });
 */
declare function soft_it(title: string, fn: Mocha.TestFunction): Mocha.Test;

declare namespace soft_it {
  /**
   * Run only this test (like it.only)
   */
  function only(title: string, fn: Mocha.TestFunction): Mocha.Test;

  /**
   * Skip this test (like it.skip)
   */
  function skip(title: string, fn: Mocha.TestFunction): void;
}

export { };
