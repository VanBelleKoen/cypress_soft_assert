/// <reference types="cypress" />
/// <reference types="../../../dist/index.d.ts" />

import { enableAutoTranslationCheck } from 'cypress-translation-checker/commands';

enableAutoTranslationCheck({
  waitTime: 0,
});

function mountFixture() {
  const html = `<!doctype html><html><body>
    <h1 id="title">Fixture</h1>
    <div id="a">A</div>
    <div id="b">B</div>
    <a id="nav" href="#other">Go</a>
  </body></html>`;

  cy.visit('/');
  cy.document().then((doc) => {
    doc.open();
    doc.write(html);
    doc.close();
  });
}

describe('fixture: soft assertions with translation checker', () => {
  beforeEach(() => {
    mountFixture();
  });

  // Should PASS — baseline sanity check.
  soft_it('all passing with translation checker enabled', () => {
    cy.get('#title').should('have.text', 'Fixture');
    cy.get('#a').should('have.text', 'A');
  });

  // Should FAIL with SoftAssertionError — verifies aggregation still works.
  soft_it('soft failure still aggregates with translation checker enabled', () => {
    cy.get('#title').should('have.text', 'Wrong 1');
    cy.get('#a').should('have.text', 'A');
    cy.get('#b').should('have.text', 'B');
  });

  // Should FAIL with SoftAssertionError — verifies timeout-style failure still captured.
  soft_it('missing element remains a soft failure with translation checker enabled', () => {
    cy.get('#missing', { timeout: 200 }).should('exist');
    cy.get('#title').should('have.text', 'Fixture');
  });
});
