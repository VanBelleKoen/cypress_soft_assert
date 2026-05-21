/// <reference types="cypress" />
/// <reference types="../../../dist/index.d.ts" />

function mountFixture() {
  const html = `<!doctype html><html><body>
    <h1 id="title">Retry Fixture</h1>
    <div id="status">ready</div>
  </body></html>`;

  cy.visit('/');
  cy.document().then((doc) => {
    doc.open();
    doc.write(html);
    doc.close();
  });
}

describe('fixture: soft_it with Cypress test retries', { retries: 1 }, () => {
  beforeEach(() => {
    mountFixture();
  });

  soft_it('retries the test and passes on the second attempt', () => {
    const attempt = typeof Cypress.currentRetry === 'number' ? Cypress.currentRetry : 0;

    cy.get('#title').should('have.text', 'Retry Fixture');

    if (attempt === 0) {
      cy.get('#status').should('have.text', 'wrong');
      return;
    }

    cy.get('#status').should('have.text', 'ready');
  });
});