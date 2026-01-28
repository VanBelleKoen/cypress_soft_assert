# Cypress Soft Assertions

A Cypress plugin that provides `soft_it()` - a drop-in replacement for `it()` that makes all assertions soft. Assertions continue execution on failure, and all failures are aggregated and reported at the end of the test.

## Overview

Standard Cypress assertions stop test execution at the first failure. With `soft_it()`:

- All assertions run even if some fail
- See all failures at once - no need to fix one issue and rerun to find the next
- Drop-in replacement - just change `it()` to `soft_it()`
- No manual tracking - failures automatically aggregated and reported

## Installation

Install the plugin as a development dependency:

```bash
npm install cypress-soft-assertions --save-dev
```

or using Yarn:

```bash
yarn add cypress-soft-assertions --dev
```

## Integration

### Step 1: Import the Plugin

Add the import to your Cypress support file. This registers the `soft_it()` function globally.

**For TypeScript projects** - Edit `cypress/support/e2e.ts` (or `cypress/support/commands.ts`):

```typescript
import 'cypress-soft-assertions';
```

**For JavaScript projects** - Edit `cypress/support/e2e.js` (or `cypress/support/commands.js`):

```javascript
require('cypress-soft-assertions');
```

### Step 2: Add Type Definitions (TypeScript only)

If you're using TypeScript, ensure your `tsconfig.json` includes the plugin types:

```json
{
  "compilerOptions": {
    "types": ["cypress", "cypress-soft-assertions"]
  }
}
```

Alternatively, add a reference directive at the top of your test files:

```typescript
/// <reference types="cypress-soft-assertions" />
```

### Step 3: Use in Tests

Replace `it()` with `soft_it()` in any test where you want soft assertion behavior:

```typescript
describe('Product Page', () => {
  soft_it('validates all product details', () => {
    cy.visit('https://example.com/product/123');
    
    // All these assertions will run even if some fail
    cy.get('.product-name').should('have.text', 'Awesome Product');
    cy.get('.product-price').should('have.text', '$99.99');
    cy.get('.stock-status').should('have.text', 'In Stock');
    Supported Assertion Types

`soft_it()` works with all Cypress assertion styles:

```typescript
soft_it('supports all assertion types', () => {
  cy.visit('/page');
  
  // .should() assertions
  cy.get('.title').should('be.visible');
  cy.get('.title').should('have.text', 'Welcome');
  
  // .should() with callback
  cy.get('.items').should(($items) => {
    expect($items).to.have.length(5);
    expect($items.first()).to.contain('Item 1');
  });
  
  // expect() in .then()
  cy.get('.price').then($el => {
    expect($el.text()).to.equal('$99.99');
  });
  
  // Chained assertions
  cy.get('.button')
    .should('be.visible')
    .and('have.class', 'active')
    .and('contain', 'Submit');
});
```

### Mixing soft_it() with Regular it()

You can use both `soft_it()` and regular `it()` in the same test suite:

```typescript
describe('User Profile', () => {
  // Regular test - stops on first failure
  it('loads the page', () => {
    cy.visit('/profile');
    cy.get('h1').should('be.visible');
  });
  
  // Soft test - all assertions run
  soft_it('validates profile fields', () => {
    cy.get('.username').should('have.text', 'john_doe');
    cy.get('.email').should('have.text', 'john@example.com');
    cy.get('.member-since').should('contain', '2023');
    cy.get('.posts-count').should('have.text', '42');
  
  // Chained assertions
  cy.get('.button')
    .should('be.visible')
    .and('have.class', 'active')
    .and('contain', 'Submit');
});
```

### Multiple Tests

You can mix `soft_it()` with regular `it()` tests:

```typescript
describe('User Profile', () => {
  // Regular test - stops on first failure
  it('loads the page', () => {
    cy.visit('/profile');
    cy.get('h1').should('be.visible');
  });
  
  // Soft test - all assertions run
  soft_it('validates profile fields', () => {
    cy.get('.username').should('have.text', 'john_doe');
    cy.get('.email').should('have.text', 'john@example.com');
    cy.get('.member-since').should('contain', '2023');
    cy.get('.posts-count').should('have.text', '42');
  });
  
  // Another soft test
  soft_it('validates account settings', () => {
    cy.get('[data-test=notifications]').should('be.checked');
    cy.get('[data-test=newsletter]').should('not.be.checked');
    cy.get('[data-test=theme]').should('have.value', 'dark');
  });
});
```

### Using soft_it.only and soft_it.skip

Just like regular `it()`:

```typescript
describe('Test Suite', () => {
  // Run only this test
  soft_it.only('validates important fields', () => {
    cy.get('.field1').should('exist');
```

The plugin supports `.only` and `.skip` modifiers just like regular `it()`:

```typescript
describe('Test Suite', () => {
  // Run only this test
  soft_it.only('validates important fields', () => {
    cy.get('.field1').should('exist');
    cy.get('.field2').should('exist');
  });
  
  // Skip this test
  soft_it.skip('validates optional fields', () => {
    cy.get('.optional').should('exist');
  });
});
```

## How It Works

`soft_it()` intercepts Chai assertions within the test block and captures failures instead of throwing them immediately. At the end of the test, all captured failures are aggregated and reported in a single error message.

The plugin works with:
- `.should()` assertions
- `expect()` assertions
- `assert()` assertions
- Custom Cypress commands that use assertions
- Assertion chains (`.and()`)

## Important Notes

### When Assertions Are Reported

Failures are reported at the end of the test after all Cypress commands complete. The test will be marked as failed, and all assertion failures will be listed together.

### Regular vs Soft Tests

- **Regular `it()`**: Stops at first assertion failure
- **Soft `soft_it()`**: Runs all assertions, reports all failures at the end

### Non-Assertion Errors

Non-assertion errors (network errors, timeouts, command errors) will still stop test execution immediately. `soft_it()` only makes assertions soft.

```typescript
soft_it('example', () => {
  cy.visit('/page');  // If this fails (timeout, 404), test stops immediately
  cy.get('.missing').should('exist');  // This assertion is soft
  cy.get('.other').should('exist');    // This assertion is soft
});
```

## Best Practices

### Use for Validation-Heavy Tests

`soft_it()` is ideal for tests that validate many fields:

```typescript
soft_it('validates user profile completeness', () => {
  cy.get('.name').should('not.be.empty');
  cy.get('.email').should('match', /@/);
  cy.get('.phone').should('have.length.at.least', 10);
  cy.get('.address').should('not.be.empty');
  cy.get('.city').should('not.be.empty');
  cy.get('.avatar').should('be.visible');
});
```

### Use Regular it() for Critical Setup

Use regular `it()` for setup steps that must succeed:

```typescript
it('logs in successfully', () => {
  cy.visit('/login');
  cy.get('#username').type('user');
  cy.get('#password').type('pass');
  cy.get('button[type=submit]').click();
  cy.url().should('include', '/dashboard');
});

soft_it('validates dashboard widgets', () => {
  cy.get('.widget-1').should('be.visible');
  cy.get('.widget-2').should('be.visible');
  cy.get('.widget-3').should('be.visible');
});
```

### Group Related Validations

Use `soft_it()` to group validations of related elements:

```typescript
soft_it('validates navigation menu', () => {
  cy.get('nav a').eq(0).should('have.text', 'Home');
  cy.get('nav a').eq(1).should('have.text', 'Products');
  cy.get('nav a').eq(2).should('have.text', 'About');
  cy.get('nav a').eq(3).should('have.text', 'Contact');
});
```

## Error Output Format

When soft assertions fail, you receive a formatted error report:

```
================================================================================
SOFT ASSERTION FAILURES (4 failed):
================================================================================
  1. expected '<input#email>' to have value 'test@example.com', but the value was 'wrong@example.com'
  2. expected '<div.order-total>' to contain '$99.99', but it contained '$89.99'
  3. expected '<div.tax>' to contain '$8.75', but it contained '$7.50'
  4. expected '<div.grand-total>' to contain '$113.74', but it contained '$102.49'
================================================================================
```