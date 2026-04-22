/**
 * Pure utility functions for the soft assertions plugin.
 *
 * These are free of Cypress/Chai globals and module-level state, making them
 * suitable for fast, isolated unit testing without a running Cypress instance.
 */

export interface ErrorEntry {
  message: string;
  stack?: string;
}

/**
 * Converts any value to a stable string token component.
 * Used when building assertion identity tokens for retry-tracking.
 */
export function toTokenPart(value: any): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

/**
 * Extracts a stable key from a Chai assertion context's subject.
 * Returns '#<id>' for elements with an id, the jQuery selector string if available,
 * or '' when nothing stable can be derived.
 */
export function getSubjectKey(assertionContext: any): string {
  const obj = assertionContext?._obj;
  const first = Array.isArray(obj) ? obj[0] : obj?.[0];
  if (first && typeof first.id === 'string' && first.id.length > 0) {
    return `#${first.id}`;
  }
  const selector = obj?.selector;
  if (typeof selector === 'string' && selector.length > 0) {
    return selector;
  }
  return '';
}

/**
 * Builds a stable token that uniquely identifies a retryable assertion by
 * combining the subject key with the expected value.
 * Returns '' when no stable key can be derived (token-less assertion).
 */
export function getAssertionToken(assertionContext: any, args: any[]): string {
  const subjectKey = getSubjectKey(assertionContext);
  if (!subjectKey) return '';
  const expected = args?.[3];
  return `${subjectKey}|${toTokenPart(expected)}`;
}

/**
 * Appends an error to the list only if it is not a consecutive duplicate.
 * "Duplicate" means the immediately preceding entry has an identical message
 * AND identical stack. Non-consecutive duplicates are always appended.
 *
 * Mutates the provided array in place (matching the original behaviour of
 * captureSoftAssertion).
 */
export function appendUniqueError(errors: ErrorEntry[], message: string, stack?: string): void {
  const lastEntry = errors[errors.length - 1];
  if (!lastEntry || lastEntry.message !== message || lastEntry.stack !== stack) {
    errors.push({ message, stack });
  }
}

/**
 * Promotes entries from retryFailures into softErrors, skipping any entry
 * whose message already appears in softErrors (message-only dedup).
 *
 * Returns a new array — does not mutate either input. The retry map is also
 * left untouched; callers are responsible for clearing it afterwards.
 */
export function mergeRetryFailures(
  softErrors: ErrorEntry[],
  retryFailures: Map<string, ErrorEntry>
): ErrorEntry[] {
  const result = [...softErrors];
  for (const entry of retryFailures.values()) {
    const isDuplicate = result.some(e => e.message === entry.message);
    if (!isDuplicate) {
      result.push(entry);
    }
  }
  return result;
}

/**
 * Resolves the stable token that identifies a retryable assertion.
 *
 * Priority:
 *  1. assertionToken (derived from subject id / selector + expected value)
 *  2. commandId-based token (used when the subject has no stable id/selector)
 *  3. '' (token-less — assertion will be captured immediately instead of tracked)
 */
export function resolveToken(assertionToken: string, commandId: string, args: any[]): string {
  if (assertionToken) return assertionToken;
  if (commandId) return `__cmd__|${commandId}|${toTokenPart(args?.[3])}`;
  return '';
}

/**
 * Formats a list of captured soft assertion errors into the final
 * SoftAssertionError message string.
 * Returns null when the list is empty (no failures to report).
 */
export function formatSoftAssertionErrors(errors: ErrorEntry[]): string | null {
  if (errors.length === 0) return null;

  const errorMessages = errors
    .map((entry, index) => `  ${index + 1}. ${entry.message}`)
    .join('\n');

  return [
    '',
    '='.repeat(80),
    `SOFT ASSERTION FAILURES (${errors.length} failed):`,
    '='.repeat(80),
    errorMessages,
    '='.repeat(80),
    '',
  ].join('\n');
}
