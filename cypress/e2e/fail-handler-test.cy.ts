/// <reference types="cypress" />

describe('fail handler + afterEach finalize', () => {
  const captured: string[] = [];
  let handler: ((err: any) => false | void) | null = null;

  afterEach(function () {
    if (handler) {
      Cypress.off('fail', handler);
      handler = null;
    }
    if (captured.length > 0) {
      const msg = `SoftAssertionError: ${captured.length} failures captured`;
      captured.length = 0;
      throw new Error(msg);
    }
  });

  // EXPECTED: FAIL — the afterEach hook throws after capturing a suppressed assertion failure
  it('afterEach throw after suppressed failure', () => {
    handler = (err: any) => {
      captured.push(err.message.slice(0, 40));
      return false;
    };
    Cypress.on('fail', handler);

    cy.visit('/');
    cy.document().then((doc) => {
      doc.open();
      doc.write('<div id="a">A</div>');
      doc.close();
    });

    cy.get('#a').should('have.text', 'WRONG'); // timeout → suppressed
    cy.get('#a').should('have.text', 'A');     // should still pass
  });
});
