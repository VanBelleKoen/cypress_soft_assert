/// <reference types="cypress" />
/// <reference types="../../../dist/index.d.ts" />

function mountRetriesFixture() {
  const html = `<!doctype html><html><body>
    <h1 id="title">Retry Fixture</h1>
    <div id="status">ready</div>
    <main id="container"></main>
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
    mountRetriesFixture();
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

  soft_it('clears captured soft errors when a failed attempt is retried', () => {
    const attempt = typeof Cypress.currentRetry === 'number' ? Cypress.currentRetry : 0;

    if (attempt === 0) {
      cy.get('#title').then(($title) => {
        expect($title.text()).to.equal('Wrong Retry Title');
      });

      cy.get('#missing-on-first-attempt', { timeout: 100 }).should('exist');
      return;
    }

    cy.get('#title').should('have.text', 'Retry Fixture');
    cy.get('#status').should('have.text', 'ready');
  });

  soft_it('does not leak selector-only soft failures across Cypress test retries', () => {
    const attempt = typeof Cypress.currentRetry === 'number' ? Cypress.currentRetry : 0;

    if (attempt === 0) {
      cy.get('[data-token$="-next"]', { timeout: 100 }).should('exist');
      return;
    }

    cy.document().then((doc) => {
      const button = doc.createElement('button');
      button.className = 'vl-button';
      button.setAttribute('data-token', 'workflow-next');
      button.textContent = 'Volgende';
      doc.getElementById('container')?.appendChild(button);
    });

    cy.get('[data-token$="-next"]', { timeout: 1500 })
      .should('be.visible')
      .and('contain.text', 'Volgende');

    cy.get('#status').should('have.text', 'ready');
  });
});