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
  beforeEach(() => {
    mountSoftAssertionsFixture();
  });

  // EXPECTED: PASS — verifies soft_it, soft_it.only, and soft_it.skip are registered globally
  it('registers global soft_it helpers', () => {
    expect(soft_it).to.be.a('function');
    expect(soft_it.only).to.be.a('function');
    expect(soft_it.skip).to.be.a('function');
  });

  // EXPECTED: SKIPPED — verifies soft_it.skip delegates to it.skip
  soft_it.skip('skipped test should not execute', () => {
    throw new Error('This should never run');
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
  soft_it.expectFailure('continues executing commands after soft assertion failures', () => {
    cy.get('#title').should('have.text', 'Wrong Title');
    cy.get('#secondary-btn').should('contain.text', 'Not Cancel');

    cy.get('#primary-btn').should('contain.text', 'Submit');
    cy.get('#counter').should('have.text', '1');
  });

  // EXPECTED: PASS — three wrong assertions aggregated into one SoftAssertionError
  soft_it.expectFailure('aggregates multiple failures into one final soft error', () => {
    cy.get('#title').should('have.text', 'Mismatch 1');
    cy.get('#counter').should('have.text', '999');
    cy.get('#secondary-btn').should('have.class', 'missing-class');
  });

  // EXPECTED: PASS — missing element timeout is captured as soft, remaining assertions still run
  soft_it.expectFailure('continues to execute assertions after one timeout-style failure', () => {
    cy.get('#missing-element', { timeout: 100 }).should('exist');
    cy.get('#counter').should('have.text', '1');
    cy.get('#secondary-btn').should('contain.text', 'Cancel');
  });

  // EXPECTED: PASS — mixed expect() failure in .then() + passing .should() assertions
  soft_it.expectFailure('supports mixed assertion styles while still reporting a single soft failure at test end', () => {
    cy.get('#title').then(($title) => {
      expect($title.text()).to.equal('Wrong Title');
    });

    cy.get('#list .item').should('have.length', 3);
    cy.get('#primary-btn').should('contain.text', 'Submit');
  });

  // EXPECTED: PASS — non-existent element timeout captured as SoftAssertionError
  soft_it.expectFailure('captures timeout-based should failures', () => {
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
  soft_it.expectFailure('captures soft failures inside within blocks', () => {
    cy.get('#list').within(() => {
      cy.get('.item').should('have.length', 99); // wrong — captured as soft failure
      cy.get('.item').first().should('have.text', 'Alpha'); // should still run
    });

    cy.get('#primary-btn').should('have.class', 'active'); // should still run
  });

  // EXPECTED: PASS — failing assertion on element without id inside .within() is captured correctly
  soft_it.expectFailure('captures soft failures on elements without id inside within blocks', () => {
    cy.get('#list').within(() => {
      cy.get('.item').first().should('have.text', 'WRONG'); // no id on .item elements
      cy.get('.item').eq(1).should('have.text', 'Beta'); // should still run and pass
    });

    cy.get('#counter').should('have.text', '1'); // should still run
  });

  // EXPECTED: PASS — forEach loop with .should() inside .within() captures failures correctly
  soft_it.expectFailure('captures soft failures from forEach loops inside within blocks', () => {
    const expectedClasses = ['item', 'missing-class', 'another-missing'];

    cy.get('#list').within(() => {
      expectedClasses.forEach((className) => {
        cy.get('li').first().should('have.class', className);
      });
    });

    cy.get('#counter').should('have.text', '1'); // should still run after .within()
  });

  // EXPECTED: PASS — bare expect() inside .within()/.then() is captured, later commands still run
  soft_it.expectFailure('captures bare expect failures inside within/.then without breaking flow', () => {
    cy.get('#list').within(() => {
      cy.get('.item').then(($items) => {
        expect($items).to.have.length(99); // wrong — captured immediately
      });
      cy.get('.item').first().should('have.text', 'Alpha'); // should still run
    });

    cy.get('#counter').should('have.text', '1'); // should still run after .within()
  });

  // EXPECTED: PASS — non-DOM .should() inside .within() retries and eventually passes
  soft_it('retries non-DOM .should() inside within blocks', () => {
    cy.window().then((win) => {
      (win as any).__withinReady = false;
      setTimeout(() => {
        (win as any).__withinReady = true;
      }, 50);
    });

    cy.get('#list').within(() => {
      cy.window({ timeout: 2000 }).should((win) => {
        expect((win as any).__withinReady).to.eq(true);
      });
      cy.get('.item').should('have.length', 3); // should still run
    });

    cy.get('#counter').should('have.text', '1'); // should still run after .within()
  });

  // EXPECTED: PASS — non-DOM .should() inside .within() that never passes is captured as soft failure
  soft_it.expectFailure('captures non-DOM .should() failure inside within blocks', () => {
    cy.window().then((win) => {
      (win as any).__withinNeverReady = false;
      // Never changes to true
    });

    cy.get('#list').within(() => {
      cy.window({ timeout: 500 }).should((win) => {
        expect((win as any).__withinNeverReady).to.eq(true);
      });
      cy.get('.item').should('have.length', 3); // should still run
    });

    cy.get('#counter').should('have.text', '1'); // should still run after .within()
  });

  // EXPECTED: PASS — wrong assertion produces SoftAssertionError (captured by expectSoftFailure)
  soft_it.expectFailure('resets state between soft_it tests (first test)', () => {
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
  soft_it.expectFailure('keeps later assertions runnable when an expect callback fails early', () => {
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
  soft_it.expectFailure('captures non-DOM .should() failure as soft failure when retries are exhausted', () => {
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
  soft_it.expectFailure('bare expect in .then() is still captured immediately without breaking subsequent assertions', () => {
    cy.get('#counter').then(($el) => {
      expect($el.text()).to.equal('999'); // wrong — captured immediately
    });

    cy.get('#title').should('have.text', 'Soft Assertions Fixture'); // should still run
    cy.get('#list .item').should('have.length', 3); // should still run
  });

  // EXPECTED: PASS — forEach + .within() + .should('be.visible') on all visible elements
  soft_it('forEach with .within() and be.visible works for all elements', () => {
    const VISIBLE_ELEMENTS = ['#title', '#primary-btn', '#secondary-btn', '#email', '#status', '#counter'];

    VISIBLE_ELEMENTS.forEach((element) => {
      cy.get('main', { timeout: 4000 })
        .within(() => {
          cy.get(element)
            .should('be.visible');
        });
    });
  });

  // EXPECTED: PASS — same pattern but one element appears after a short delay, retries should handle it
  soft_it('forEach with .within() retries elements that appear after a delay', () => {
    // Hide #status initially, make it visible after 50ms
    cy.get('#status').invoke('css', 'display', 'none');
    cy.document().then((doc) => {
      setTimeout(() => {
        const el = doc.getElementById('status');
        if (el) el.style.display = '';
      }, 50);
    });

    const VISIBLE_ELEMENTS = ['#title', '#primary-btn', '#status', '#counter'];

    VISIBLE_ELEMENTS.forEach((element) => {
      cy.get('main', { timeout: 4000 })
        .within(() => {
          cy.get(element)
            .should('be.visible');
        });
    });
  });

  // EXPECTED: PASS — one element is permanently hidden; captured as soft failure, rest still pass
  soft_it.expectFailure('forEach with .within() captures hidden element as soft failure and continues', () => {
    // Permanently hide #status
    cy.get('#status').invoke('css', 'display', 'none');

    const VISIBLE_ELEMENTS = ['#title', '#primary-btn', '#status', '#counter'];

    VISIBLE_ELEMENTS.forEach((element) => {
      cy.get('main', { timeout: 4000 })
        .within(() => {
          cy.get(element, { timeout: 500 })
            .should('be.visible');
        });
    });

    // Verify test continues after the soft failure
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
  });

  // EXPECTED: PASS — forEach with .within() where elements have same tag but different text
  soft_it('forEach with .within() on class-only selectors (no id)', () => {
    const VISIBLE_ELEMENTS = ['.item:first', '.item:eq(1)', '.item:last'];

    VISIBLE_ELEMENTS.forEach((element) => {
      cy.get('#list')
        .within(() => {
          cy.get(element)
            .should('be.visible');
        });
    });
  });

  // EXPECTED: PASS — forEach + .within() with one hidden no-id element, rest pass
  soft_it.expectFailure('forEach with .within() captures failure on class-only element and continues', () => {
    // Hide the second list item
    cy.get('.item').eq(1).invoke('css', 'display', 'none');

    const VISIBLE_ELEMENTS = ['.item:first', '.item:eq(1)', '.item:last'];

    VISIBLE_ELEMENTS.forEach((element) => {
      cy.get('#list')
        .within(() => {
          cy.get(element, { timeout: 500 })
            .should('be.visible');
        });
    });

    // Verify test continues
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
  });

  // EXPECTED: PASS — forEach with .within() where multiple elements share the same selector
  // This tests token collision: all use cy.get('.btn').should('be.visible')
  soft_it('forEach with .within() using same selector does not cause token collision', () => {
    // Mount a fixture with two containers, each with a .btn
    cy.document().then((doc) => {
      doc.open();
      doc.write(`
        <!doctype html>
        <html><body>
          <div id="container-a"><button class="btn">A</button></div>
          <div id="container-b"><button class="btn">B</button></div>
        </body></html>
      `);
      doc.close();
    });

    const CONTAINERS = ['#container-a', '#container-b'];

    CONTAINERS.forEach((container) => {
      cy.get(container)
        .within(() => {
          cy.get('.btn')
            .should('be.visible');
        });
    });
  });

  // EXPECTED: PASS — same as above but second container's .btn is hidden
  soft_it.expectFailure('forEach with .within() using same selector captures correct failure', () => {
    cy.document().then((doc) => {
      doc.open();
      doc.write(`
        <!doctype html>
        <html><body>
          <div id="container-a"><button class="btn">A</button></div>
          <div id="container-b"><button class="btn" style="display:none">B</button></div>
        </body></html>
      `);
      doc.close();
    });

    const CONTAINERS = ['#container-a', '#container-b'];

    CONTAINERS.forEach((container) => {
      cy.get(container)
        .within(() => {
          cy.get('.btn', { timeout: 500 })
            .should('be.visible');
        });
    });
  });

  // EXPECTED: PASS — element becomes visible at ~80% of timeout; must use full timeout, not 75%
  soft_it('uses full timeout for retry, not a reduced percentage', () => {
    // Hide element, then show it at 80% of the 2000ms timeout = 1600ms
    cy.get('#status').invoke('css', 'display', 'none');
    cy.document().then((doc) => {
      setTimeout(() => {
        const el = doc.getElementById('status');
        if (el) el.style.display = '';
      }, 1600);
    });

    cy.get('#status', { timeout: 2000 }).should('be.visible');
    cy.get('#title').should('have.text', 'Soft Assertions Fixture');
  });

  // EXPECTED: PASS — forEach + .within() where one element appears late (80% of timeout)
  soft_it('forEach with .within() uses full timeout for late-appearing elements', () => {
    // Hide #counter, show it at 80% of 2000ms = 1600ms
    cy.get('#counter').invoke('css', 'display', 'none');
    cy.document().then((doc) => {
      setTimeout(() => {
        const el = doc.getElementById('counter');
        if (el) el.style.display = '';
      }, 1600);
    });

    const VISIBLE_ELEMENTS = ['#title', '#primary-btn', '#counter'];

    VISIBLE_ELEMENTS.forEach((element) => {
      cy.get('main')
        .within(() => {
          cy.get(element, { timeout: 2000 })
            .should('be.visible');
        });
    });
  });
});
