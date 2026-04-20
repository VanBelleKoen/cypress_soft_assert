/// <reference types="cypress" />
/// <reference types="../../dist/index.d.ts" />

function mountSoftAssertionsFixture() {
  const html = `
    <!doctype html>
    <html>
      <body>
        <main>
          <h1 id="title">Soft Assertions Fixture</h1>
          <button id="primary-btn" class="btn active" type="button">Submit</button>
          <button id="secondary-btn" class="btn" type="button">Cancel</button>
          <ul id="list">
            <li class="item">Alpha</li>
            <li class="item">Beta</li>
            <li class="item">Gamma</li>
          </ul>
          <input id="email" value="john@example.com" />
          <div id="status">pending</div>
          <div id="counter">1</div>
        </main>
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

describe('soft_it plugin behavior', () => {
  let expectsSoftFailure = false;
  let capturedSoftFailure: Error | null = null;

  beforeEach(() => {
    expectsSoftFailure = false;
    capturedSoftFailure = null;
    mountSoftAssertionsFixture();
  });

  afterEach(() => {
    if (!expectsSoftFailure) {
      expect(capturedSoftFailure, 'unexpected soft failure').to.equal(null);
      return;
    }

    expect(capturedSoftFailure, 'expected a SoftAssertionError').to.be.instanceOf(Error);
    expect(capturedSoftFailure?.name).to.equal('SoftAssertionError');
  });

  function expectSoftFailure() {
    expectsSoftFailure = true;
    Cypress.once('fail', (error) => {
      capturedSoftFailure = error as Error;
      return false;
    });
  }

  // EXPECTED: PASS — verifies soft_it, soft_it.only, and soft_it.skip are registered globally
  it('registers global soft_it helpers', () => {
    expect(soft_it).to.be.a('function');
    expect(soft_it.only).to.be.a('function');
    expect(soft_it.skip).to.be.a('function');
  });

  // EXPECTED: PASS — all assertions are correct, no soft failures
  soft_it('passes with normal assertions when all checks succeed', () => {
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
    cy.get('#primary-btn').should('have.attr', 'type', 'button');
    cy.get('#list .item').should('have.length', 3);
    cy.get('#email').should('have.value', 'john@example.com');
  });

  // EXPECTED: PASS — chained .should().and() all correct
  soft_it('supports chained should and and assertions', () => {
    cy.get('#primary-btn')
      .should('be.visible')
      .and('have.class', 'btn')
      .and('have.class', 'active')
      .and('contain.text', 'Submit');
  });

  // EXPECTED: PASS — expect() calls inside .then() all correct
  soft_it('supports expect assertions in then callbacks', () => {
    cy.get('#list .item').then(($items) => {
      expect($items).to.have.length(3);
      expect($items.eq(0).text()).to.equal('Alpha');
      expect($items.eq(2).text()).to.equal('Gamma');
    });
  });

  // EXPECTED: PASS — two wrong assertions are captured as soft failures, two correct ones still run
  soft_it('continues executing commands after soft assertion failures', () => {
    expectSoftFailure();

    cy.get('#title').should('have.text', 'Wrong Title');
    cy.get('#secondary-btn').should('contain.text', 'Not Cancel');

    cy.get('#primary-btn').should('contain.text', 'Submit');
    cy.get('#counter').should('have.text', '1');
  });

  // EXPECTED: PASS — three wrong assertions aggregated into one SoftAssertionError
  soft_it('aggregates multiple failures into one final soft error', () => {
    expectSoftFailure();

    cy.get('#title').should('have.text', 'Mismatch 1');
    cy.get('#counter').should('have.text', '999');
    cy.get('#secondary-btn').should('have.class', 'missing-class');
  });

  // EXPECTED: PASS — missing element timeout is captured as soft, remaining assertions still run
  soft_it('continues to execute assertions after one timeout-style failure', () => {
    expectSoftFailure();

    cy.get('#missing-element', { timeout: 100 }).should('exist');
    cy.get('#counter').should('have.text', '1');
    cy.get('#secondary-btn').should('contain.text', 'Cancel');
  });

  // EXPECTED: PASS — mixed expect() failure in .then() + passing .should() assertions
  soft_it('supports mixed assertion styles while still reporting a single soft failure at test end', () => {
    expectSoftFailure();

    cy.get('#title').then(($title) => {
      expect($title.text()).to.equal('Wrong Title');
    });

    cy.get('#list .item').should('have.length', 3);
    cy.get('#primary-btn').should('contain.text', 'Submit');
  });

  // EXPECTED: PASS — non-existent element timeout captured as SoftAssertionError
  soft_it('captures timeout-based should failures', () => {
    expectSoftFailure();
    cy.get('#eventual-element', { timeout: 120 }).should('exist');
  });

  // EXPECTED: PASS — DOM updates after 50ms, retry succeeds, no soft failure generated
  soft_it('does not create soft failures when retriable should eventually passes', () => {
    cy.document().then((doc) => {
      setTimeout(() => {
        const status = doc.getElementById('status');
        if (status) {
          status.textContent = 'ready';
        }
      }, 50);
    });

    cy.get('#status', { timeout: 1000 }).should('have.text', 'ready');
    cy.get('#counter').should('have.text', '1');
  });

  // EXPECTED: PASS — DOM updates after 2s, explicit timeout of 4s allows retry to succeed
  soft_it('respects per-command timeout for slow DOM updates', () => {
    cy.document().then((doc) => {
      setTimeout(() => {
        const status = doc.getElementById('status');
        if (status) {
          status.textContent = 'loaded';
        }
      }, 2000);
    });

    cy.get('#status', { timeout: 4000 }).should('have.text', 'loaded');
    cy.get('#counter').should('have.text', '1');
  });

  // EXPECTED: PASS — .within() block and outer assertions all correct
  soft_it('supports nested command groups and within blocks', () => {
    cy.get('#list').within(() => {
      cy.get('.item').should('have.length', 3);
      cy.contains('.item', 'Beta').should('be.visible');
    });

    cy.get('#primary-btn').should('have.class', 'active');
  });

  // EXPECTED: PASS — failing assertion inside .within() captured, commands after .within() still run
  soft_it('captures soft failures inside within blocks', () => {
    expectSoftFailure();

    cy.get('#list').within(() => {
      cy.get('.item').should('have.length', 99); // wrong — captured as soft failure
      cy.get('.item').first().should('have.text', 'Alpha'); // should still run
    });

    cy.get('#primary-btn').should('have.class', 'active'); // should still run
  });

  // EXPECTED: PASS — failing assertion on element without id inside .within() is captured correctly
  soft_it('captures soft failures on elements without id inside within blocks', () => {
    expectSoftFailure();

    cy.get('#list').within(() => {
      cy.get('.item').first().should('have.text', 'WRONG'); // no id on .item elements
      cy.get('.item').eq(1).should('have.text', 'Beta'); // should still run and pass
    });

    cy.get('#counter').should('have.text', '1'); // should still run
  });

  // EXPECTED: PASS — forEach loop with .should() inside .within() captures failures correctly
  soft_it('captures soft failures from forEach loops inside within blocks', () => {
    expectSoftFailure();

    const expectedClasses = ['item', 'missing-class', 'another-missing'];

    cy.get('#list').within(() => {
      expectedClasses.forEach((className) => {
        cy.get('li').first().should('have.class', className);
      });
    });

    cy.get('#counter').should('have.text', '1'); // should still run after .within()
  });

  // EXPECTED: PASS — wrong assertion produces SoftAssertionError (captured by expectSoftFailure)
  soft_it('resets state between soft_it tests (first test)', () => {
    expectSoftFailure();
    cy.get('#title').should('have.text', 'Wrong In First Test');
  });

  // EXPECTED: PASS — no inherited failures from previous test, all assertions correct
  soft_it('resets state between soft_it tests (second test should not inherit previous failures)', () => {
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
    cy.get('#counter').should('have.text', '1');
  });

  // EXPECTED: PASS — promise-returning callback with correct assertions
  soft_it('works with promise-returning test callbacks', () => {
    return Cypress.Promise.resolve().then(() => {
      cy.get('#title').should('contain.text', 'Fixture');
      cy.get('#secondary-btn').should('contain.text', 'Cancel');
    });
  });

  // EXPECTED: PASS — early expect() failure captured, later .should() assertions still run
  soft_it('keeps later assertions runnable when an expect callback fails early', () => {
    expectSoftFailure();

    cy.get('#counter').then(($counter) => {
      expect($counter.text()).to.equal('2');
    });

    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
    cy.get('#list .item').eq(1).should('have.text', 'Beta');
  });

  // EXPECTED: PASS — regular it() failure is caught by Cypress.once('fail') handler
  it('regular it remains unchanged and can still fail hard', () => {
    Cypress.once('fail', (error) => {
      expect(error.message).to.include('expected 1 to equal 2');
      return false;
    });

    cy.wrap(1).should('equal', 2);
  });

  // EXPECTED: PASS — regular it() with correct assertions
  it('regular it still executes normally when assertions pass', () => {
    cy.get('#title').should('contain.text', 'Fixture');
    cy.get('#list .item').should('have.length', 3);
  });

  // EXPECTED: PASS — non-DOM .should() that eventually passes is retried, no soft failure
  soft_it('retries non-DOM assertions in .should() until they pass', () => {
    // Simulate a window property that changes from true to false after 50ms
    // (similar to Nuxt isHydrating pattern)
    cy.window().then((win) => {
      (win as any).__testHydrating = true;
      setTimeout(() => {
        (win as any).__testHydrating = false;
      }, 50);
    });

    cy.window({ timeout: 2000 }).should((win) => {
      expect((win as any).__testHydrating).to.eq(false);
    });

    // This assertion should still run and pass
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
  });

  // EXPECTED: PASS — non-DOM .should() that never passes is captured as soft failure
  soft_it('captures non-DOM .should() failure as soft failure when retries are exhausted', () => {
    expectSoftFailure();

    cy.window().then((win) => {
      (win as any).__testHydrating = true;
      // Never changes to false
    });

    cy.window({ timeout: 500 }).should((win) => {
      expect((win as any).__testHydrating).to.eq(false);
    });

    // This assertion should still run after the soft failure
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
  });

  // EXPECTED: PASS — bare expect() in .then() still captured immediately (no regression)
  soft_it('bare expect in .then() is still captured immediately without breaking subsequent assertions', () => {
    expectSoftFailure();

    cy.get('#counter').then(($el) => {
      expect($el.text()).to.equal('999'); // wrong — captured immediately
    });

    cy.get('#title').should('have.text', 'Soft Assertions Fixture'); // should still run
    cy.get('#list .item').should('have.length', 3); // should still run
  });
});
