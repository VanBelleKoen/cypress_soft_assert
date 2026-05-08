/// <reference types="cypress" />
/// <reference types="../../../dist/index.d.ts" />

/**
 * Fixture spec for strict soft assertions.
 *
 * This validates per-test strict mode via soft_it.strict.
 * Strict mode should force a hard fail from afterEach on final soft failures.
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

describe('fixture: strict soft assertions', () => {
  beforeEach(() => {
    mountFixture();
  });

  // Should PASS — strict mode with no failures behaves like normal pass.
  soft_it.strict('strict passing test', () => {
    cy.get('#title').should('have.text', 'Strict Fixture');
    cy.get('#a').should('have.text', 'A');
  });

  // Should FAIL hard — strict mode with soft failures should not be recoverable.
  soft_it.strict('strict mode forces final soft failure to fail test', () => {
    cy.get('#title').should('have.text', 'Wrong Title');
    cy.get('#a').should('have.text', 'Wrong A');
    cy.get('#b').should('have.text', 'B');
  });

  // Should PASS — regular soft_it still works in same suite.
  soft_it('regular soft_it in strict suite still passes when assertions pass', () => {
    cy.get('#title').should('have.text', 'Strict Fixture');
    cy.get('#b').should('have.text', 'B');
  });
});
