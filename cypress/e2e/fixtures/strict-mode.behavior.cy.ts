/// <reference types="cypress" />
/// <reference types="../../../dist/index.d.ts" />

/**
 * Fixture spec for final failed soft assertions.
 *
 * This validates that a normal soft_it test still reports the final aggregated
 * SoftAssertionError as a failed test in cypress.run().
 */

function mountFixture() {
  const html = `<!doctype html><html><body>
    <h1 id="title">Strict Fixture</h1>
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

describe('fixture: final soft assertion failure reporting', () => {
  beforeEach(() => {
    mountFixture();
  });

  // Should PASS — normal soft_it with no failures behaves like a normal pass.
  soft_it('passing test', () => {
    cy.get('#title').should('have.text', 'Strict Fixture');
    cy.get('#a').should('have.text', 'A');
  });

  // Should FAIL — the final SoftAssertionError must still be reported as a failed test.
  soft_it('final soft failure is reported as failed test', () => {
    cy.get('#title').should('have.text', 'Wrong Title');
    cy.get('#a').should('have.text', 'Wrong A');
    cy.get('#b').should('have.text', 'B');
  });

  // Should PASS — a later soft_it still passes in the same suite.
  soft_it('later soft_it still passes when assertions pass', () => {
    cy.get('#title').should('have.text', 'Strict Fixture');
    cy.get('#b').should('have.text', 'B');
  });
});
