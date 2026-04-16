/// <reference types="cypress" />
/// <reference types="../../dist/index.d.ts" />

function mountFixture() {
  const html = `
    <!doctype html>
    <html>
      <body>
        <h1 id="title">Fixture</h1>
        <div id="a">A</div>
        <div id="b">B</div>
      </body>
    </html>
  `;

  cy.visit('/');
  cy.document().then((doc) => {
    doc.open();
    doc.write(html);
    doc.close();
  });
}

describe('soft assertion aggregation repro', () => {
  beforeEach(() => {
    mountFixture();
  });

  // EXPECTED: FAIL — two intentionally wrong assertions aggregated into one SoftAssertionError
  soft_it('should aggregate multiple failures and fail this test', () => {
    cy.get('#title').should('have.text', 'Wrong 1');
    cy.get('#a').should('have.text', 'Wrong 2');
    cy.get('#b').should('have.text', 'B');
  });

  // EXPECTED: PASS — regular test runs independently after a failing soft_it
  it('regular test after failing soft_it should still run', () => {
    cy.get('#title').should('have.text', 'Fixture');
  });
});
