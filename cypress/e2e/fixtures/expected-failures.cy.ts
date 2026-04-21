/// <reference types="cypress" />
/// <reference types="../../../dist/index.d.ts" />

/**
 * Fixture spec — NOT meant to be run directly.
 * Run via test/runner.test.mjs which asserts on the programmatic results.
 *
 * Each test has a predictable pass/fail outcome used by the runner assertions.
 */

function mountFixture() {
  const html = `<!doctype html><html><body>
    <h1 id="title">Fixture</h1>
    <div id="a">A</div>
    <div id="b">B</div>
  </body></html>`;
  cy.visit('/');
  cy.document().then((doc) => {
    doc.open();
    doc.write(html);
    doc.close();
  });
}

describe('fixture: expected failures', () => {
  beforeEach(() => {
    mountFixture();
  });

  // Should PASS — all assertions correct
  soft_it('all passing', () => {
    cy.get('#title').should('have.text', 'Fixture');
    cy.get('#a').should('have.text', 'A');
    cy.get('#b').should('have.text', 'B');
  });

  // Should FAIL with SoftAssertionError — two wrong assertions aggregated
  soft_it('two soft failures aggregated', () => {
    cy.get('#title').should('have.text', 'Wrong 1');
    cy.get('#a').should('have.text', 'Wrong 2');
    cy.get('#b').should('have.text', 'B');
  });

  // Should FAIL with SoftAssertionError — missing element
  soft_it('missing element captured as soft failure', () => {
    cy.get('#nonexistent', { timeout: 200 }).should('exist');
    cy.get('#title').should('have.text', 'Fixture');
  });

  // Should PASS — regular it() is not affected by soft assertion machinery
  it('regular it passes normally', () => {
    cy.get('#title').should('have.text', 'Fixture');
  });

  // Should PASS — state from previous soft_it failures does not leak
  soft_it('no leaked state from previous tests', () => {
    cy.get('#title').should('have.text', 'Fixture');
    cy.get('#a').should('have.text', 'A');
  });
});
