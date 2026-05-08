# Cypress Soft Assertions

A Cypress plugin that provides `soft_it()` — a drop-in replacement for `it()` that makes all assertions soft. Assertions continue execution on failure, and all failures are aggregated and reported together at the end of the test.

## Why?

Standard Cypress assertions stop test execution at the first failure. With `soft_it()`:

- **All assertions run** even if some fail
- **See all failures at once** — no need to fix one issue and rerun to find the next
- **Drop-in replacement** — just change `it()` to `soft_it()`
- **No manual tracking** — failures are automatically aggregated and reported

## Installation

```bash
npm install @koenvanbelle/cypress-soft-assertions --save-dev
```

## Setup

### 1. Import the plugin

Add the import to your Cypress support file (`cypress/support/e2e.ts` or `cypress/support/e2e.js`):

```typescript
import '@koenvanbelle/cypress-soft-assertions';
```

Or for JavaScript:

```javascript
require('@koenvanbelle/cypress-soft-assertions');
```

### 2. Add type definitions (TypeScript only)

Add a reference directive at the top of your test files:

```typescript
/// <reference types="@koenvanbelle/cypress-soft-assertions" />
```

Or include the types in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["cypress", "@koenvanbelle/cypress-soft-assertions"]
  }
}
```

## Usage

Replace `it()` with `soft_it()` in any test where you want soft assertion behavior:

```typescript
describe('Product Page', () => {
  soft_it('validates all product details', () => {
    cy.visit('/product/123');

    // All assertions run even if some fail
    cy.get('.product-name').should('have.text', 'Awesome Product');
    cy.get('.product-price').should('have.text', '$99.99');
    cy.get('.stock-status').should('have.text', 'In Stock');
    cy.get('.rating').should('have.attr', 'data-stars', '5');
  });
});
```

### Supported assertion styles

`soft_it()` works with all Cypress assertion styles:

```typescript
soft_it('supports all assertion types', () => {
  // .should() assertions
  cy.get('.title').should('be.visible');
  cy.get('.title').should('have.text', 'Welcome');

  // expect() in .then()
  cy.get('.price').then(($el) => {
    expect($el.text()).to.equal('$99.99');
  });

  // Chained assertions with .and()
  cy.get('.button')
    .should('be.visible')
    .and('have.class', 'active')
    .and('contain', 'Submit');
});
```

### Mixing `soft_it()` with regular `it()`

You can use both in the same suite. Regular `it()` tests are unaffected:

```typescript
describe('User Profile', () => {
  // Regular test — stops on first failure
  it('loads the page', () => {
    cy.visit('/profile');
    cy.get('h1').should('be.visible');
  });

  // Soft test — all assertions run
  soft_it('validates profile fields', () => {
    cy.get('.username').should('have.text', 'john_doe');
    cy.get('.email').should('have.text', 'john@example.com');
    cy.get('.member-since').should('contain', '2023');
    cy.get('.posts-count').should('have.text', '42');
  });
});
```

### `soft_it.only` and `soft_it.skip`

Works just like regular `it()`:

```typescript
describe('Test Suite', () => {
  soft_it.only('run only this test', () => {
    cy.get('.field1').should('exist');
  });

  soft_it.skip('skip this test', () => {
    cy.get('.optional').should('exist');
  });
});
```

## How it works

1. `soft_it()` patches Chai's assertion mechanism for the duration of the test.
2. When an assertion fails inside a retriable command (`.should()`, `.and()`), the error is staged under a stable token and rethrown so Cypress can retry. If the assertion eventually passes, the staged failure is cleared.
3. After a bounded number of retries, the assertion is swallowed and the failure is recorded so the test can continue to the next command.
4. Non-retriable assertion failures (`expect()` in `.then()` callbacks) are captured immediately.
5. Command-level failures (e.g. element-not-found timeouts) are caught by a `Cypress.on('fail')` handler and recorded as soft failures.
6. At the end of the test, all recorded failures are aggregated into a single `SoftAssertionError`.

## Error output

When soft assertions fail, you get a single formatted report:

```
================================================================================
SOFT ASSERTION FAILURES (3 failed):
================================================================================
  1. expected '<h1.title>' to have text 'Wrong Title', but the text was 'Products'
  2. expected '<div.count>' to have text '999', but the text was '42'
  3. expected '<div.missing>' to exist in the DOM
================================================================================
```

## Important notes

- **Retriable assertions are retried**: `.should()` and `.and()` assertions are retried by Cypress before being captured as soft failures. Assertions that eventually pass are not reported.
- **Non-assertion errors still stop execution**: Network errors, visit timeouts, and other command errors are captured as soft failures but may prevent subsequent commands from running.
- **State resets between tests**: Each `soft_it()` test starts with a clean slate — failures from one test never leak into another.
- **Timeout-aware retries**: The plugin respects Cypress's `defaultCommandTimeout` and per-command `{ timeout }` overrides. Retriable assertions (`.should()`, `.and()`) are retried for up to 75% of the effective timeout before being captured as soft failures. For slow applications, increase the timeout to give assertions more time to pass:
  ```typescript
  // Global: set in cypress.config.ts
  e2e: { defaultCommandTimeout: 10000 }

  // Per-command: override on individual commands
  cy.get('.slow-element', { timeout: 15000 }).should('be.visible');
  ```
- **Cypress Studio / Command Log**: When a soft assertion fails definitively, the plugin swallows the error so the test can continue. Cypress treats the command as resolved, which means it may not appear as a failed step in the Cypress Studio command log or may look like the assertion was skipped. The assertions **do** execute and failures **are** captured — they just don't show visually in the command log. Check the final `SoftAssertionError` report for the complete list of failures.

## Compatibility: cypress-translation-checker

`@koenvanbelle/cypress-soft-assertions` is compatible with `cypress-translation-checker` (verified with `cypress-translation-checker@1.3.4` and Cypress 15).

### Install

```bash
npm install --save-dev @koenvanbelle/cypress-soft-assertions cypress-translation-checker
```

### 1. Register translation-checker tasks in Cypress config

`cypress-translation-checker` uses Cypress tasks to persist collected page results. Add these in `setupNodeEvents`.

```typescript
import { defineConfig } from 'cypress';

const translationResults = new Map<string, { url: string; errors: any[]; testContext: string }>();

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('task', {
        storeTranslationResult({
          url,
          errors,
          testContext,
        }: {
          url: string;
          errors: any[];
          testContext: string;
        }) {
          translationResults.set(url, { url, errors, testContext });
          return null;
        },
        getTranslationResults() {
          return Array.from(translationResults.values());
        },
        clearTranslationResults() {
          translationResults.clear();
          return null;
        },
      });

      return config;
    },
  },
});
```

### 2. Import both plugins in support file

Enable soft assertions and then enable automatic translation checks.

```typescript
import '@koenvanbelle/cypress-soft-assertions';
import { enableAutoTranslationCheck } from 'cypress-translation-checker/commands';

enableAutoTranslationCheck({
  waitTime: 500,
});
```

### 3. Write tests normally with `soft_it`

Soft assertion failures are still aggregated into one `SoftAssertionError` at test end.

```typescript
soft_it('works with automatic translation checks', () => {
  cy.visit('/');
  cy.get('h1').should('have.text', 'Expected title');
  cy.get('#status').should('have.text', 'Ready');
});
```

### Notes

- If translation-checker tasks are missing, Cypress will fail with unknown task errors.
- Both plugins register hooks/events, but they can run together safely with the setup above.
- Keep translation-checker in non-invasive mode (`failOnError: false` in auto mode) so functional assertions remain the source of test pass/fail behavior.

## License

MIT
