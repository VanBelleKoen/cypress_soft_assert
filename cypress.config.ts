import { defineConfig } from 'cypress';

// Persist translation-checker results across specs in a single run.
const translationResults = new Map<string, { url: string; errors: any[]; testContext: string }>();

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
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
    baseUrl: 'https://www.saucedemo.com',
    specPattern: 'cypress/e2e/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
  },
});
