/// <reference types="cypress" />
/// <reference types="../../dist/index.d.ts" />

/**
 * Cypress Soft Assertions - Working Examples
 * 
 * This test file demonstrates the soft_it() functionality with real tests
 * that you can run to verify the plugin works correctly.
 */

describe('Soft Assertions with soft_it()', () => {

  soft_it('validates login page elements', () => {
    cy.visit('/');

    // All these assertions will run even if some fail
    cy.get('.login_logo').should('have.text', 'Swag Labs');
    cy.get('#user-name').should('be.visible');
    cy.get('#password').should('be.visible');
    cy.get('#login-button').should('have.attr', 'type', 'submit');
    cy.get('.login_credentials').should('be.visible');
  });

  soft_it('validates product page after login', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    // All product validations will run
    cy.get('.app_logo').should('have.text', 'Swag Labs');
    cy.get('.title').should('have.text', 'Products');
    cy.get('.inventory_item').should('have.length', 6);
    cy.get('.peek').should('be.visible'); // This will fail but test continues
    cy.get('.inventory_item_name').first().should('contain', 'Backpack');
  });

  soft_it('validates multiple product details', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    // Check each inventory item
    cy.get('.inventory_item').first().within(() => {
      cy.get('.inventory_item_name').should('not.be.empty');
      cy.get('.inventory_item_desc').should('not.be.empty');
      cy.get('.inventory_item_price').should('contain', '$');
      cy.get('button').should('be.visible');
    });

    // Check cart badge doesn't exist initially
    cy.get('.shopping_cart_badge').should('not.exist');
  });

  soft_it('validates cart functionality with soft assertions', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    // Add items
    cy.get('button#add-to-cart-sauce-labs-backpack').click();
    cy.get('button#add-to-cart-sauce-labs-bike-light').click();

    // All cart validations
    cy.get('.shopping_cart_badge').should('have.text', '2');
    cy.get('button#remove-sauce-labs-backpack').should('exist');
    cy.get('button#remove-sauce-labs-bike-light').should('exist');

    // Open cart
    cy.get('.shopping_cart_link').click();
    cy.get('.cart_item').should('have.length', 2);

    // Validate cart items
    cy.get('.cart_item').eq(0).find('.inventory_item_name').should('contain', 'Backpack');
    cy.get('.cart_item').eq(1).find('.inventory_item_name').should('contain', 'Bike Light');
  });
});

describe('Comparison: Regular it() vs soft_it()', () => {

  it('regular it() - stops at first failure', () => {
    cy.visit('/');

    cy.get('.login_logo').should('have.text', 'Swag Labs');
    cy.get('.non-existent').should('exist'); // This will fail and stop here
    cy.get('#user-name').should('be.visible'); // This won't run
    cy.get('#password').should('be.visible'); // This won't run
  });

  soft_it('soft_it() - runs all assertions', () => {
    cy.visit('/');

    cy.get('.login_logo').should('have.text', 'Swag Labs');
    cy.get('.non-existent').should('exist'); // This will fail but test continues
    cy.get('#user-name').should('be.visible'); // This WILL run
    cy.get('#password').should('be.visible'); // This WILL run
  });
});

describe('soft_it() with different assertion styles', () => {

  soft_it('supports .should() assertions', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    cy.get('.inventory_list').should('be.visible');
    cy.get('.inventory_item').should('have.length', 6);
    cy.get('.inventory_item').should('have.length.at.least', 1);
  });

  soft_it('supports expect() in .then()', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    cy.get('.inventory_item_name').first().then($el => {
      expect($el.text()).to.include('Sauce Labs');
      expect($el).to.be.visible;
    });

    cy.get('.inventory_item_price').first().then($el => {
      expect($el.text()).to.contain('$');
      expect($el.text()).to.match(/\$\d+\.\d{2}/);
    });
  });

  soft_it('supports chained assertions', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    cy.get('button#add-to-cart-sauce-labs-backpack')
      .should('be.visible')
      .and('have.text', 'Add to cart')
      .and('have.attr', 'type', 'button');
  });
});

describe('Testing soft_it.only and soft_it.skip', () => {

  soft_it('this test runs normally', () => {
    cy.visit('/');
    cy.get('.login_logo').should('exist');
  });

  soft_it.skip('this test is skipped', () => {
    cy.visit('/');
    cy.get('.something').should('exist');
  });

  // Uncomment to test .only functionality
  // soft_it.only('only this test runs when .only is used', () => {
  //   cy.visit('/');
  //   cy.get('#user-name').should('exist');
  // });
});

describe('Demonstrating failure aggregation', () => {

  soft_it('shows multiple failures in one report', () => {
    cy.visit('/');
    cy.get('#user-name').type('standard_user');
    cy.get('#password').type('secret_sauce');
    cy.get('#login-button').click();

    // Intentionally create multiple failures to see aggregation
    cy.get('.app_logo').should('have.text', 'Wrong Text'); // FAIL
    cy.get('.title').should('have.text', 'Products'); // PASS
    cy.get('.inventory_item').should('have.length', 99); // FAIL
    cy.get('.fake-element').should('exist'); // FAIL (element doesn't exist)
    cy.get('.inventory_item_name').first().should('contain', 'Backpack'); // PASS

    // All failures will be reported together at the end
  });
});
