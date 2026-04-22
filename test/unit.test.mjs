/**
 * Unit tests for pure helper functions in src/utils.ts (compiled to dist/utils.js).
 *
 * These tests run in Node.js without a Cypress instance, so they execute fast
 * and can catch logic regressions in the token-resolution and error-formatting
 * paths without the overhead of a full browser run.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const {
  toTokenPart,
  getSubjectKey,
  getAssertionToken,
  appendUniqueError,
  mergeRetryFailures,
  resolveToken,
  formatSoftAssertionErrors,
} = require(path.resolve(__dirname, '../dist/utils.js'));

// ---------------------------------------------------------------------------
// toTokenPart
// ---------------------------------------------------------------------------

describe('toTokenPart', () => {
  it('returns "undefined" for undefined', () => {
    assert.equal(toTokenPart(undefined), 'undefined');
  });

  it('returns "null" for null', () => {
    assert.equal(toTokenPart(null), 'null');
  });

  it('returns the string unchanged', () => {
    assert.equal(toTokenPart('hello'), 'hello');
  });

  it('returns an empty string unchanged', () => {
    assert.equal(toTokenPart(''), '');
  });

  it('converts an integer to its string representation', () => {
    assert.equal(toTokenPart(42), '42');
  });

  it('converts zero to "0"', () => {
    assert.equal(toTokenPart(0), '0');
  });

  it('converts a negative number', () => {
    assert.equal(toTokenPart(-1), '-1');
  });

  it('converts a float', () => {
    assert.equal(toTokenPart(3.14), '3.14');
  });

  it('converts true to "true"', () => {
    assert.equal(toTokenPart(true), 'true');
  });

  it('converts false to "false"', () => {
    assert.equal(toTokenPart(false), 'false');
  });

  it('JSON-serialises a plain object', () => {
    assert.equal(toTokenPart({ key: 'val' }), '{"key":"val"}');
  });

  it('JSON-serialises an array', () => {
    assert.equal(toTokenPart([1, 2, 3]), '[1,2,3]');
  });

  it('falls back to String() for a circular reference', () => {
    const obj = {};
    obj.self = obj;
    assert.equal(toTokenPart(obj), '[object Object]');
  });
});

// ---------------------------------------------------------------------------
// getSubjectKey
// ---------------------------------------------------------------------------

describe('getSubjectKey', () => {
  it('returns "" for null', () => {
    assert.equal(getSubjectKey(null), '');
  });

  it('returns "" for undefined', () => {
    assert.equal(getSubjectKey(undefined), '');
  });

  it('returns "" for a context without _obj', () => {
    assert.equal(getSubjectKey({}), '');
  });

  it('returns #id when _obj is an array with an element that has an id', () => {
    assert.equal(getSubjectKey({ _obj: [{ id: 'title' }] }), '#title');
  });

  it('returns #id when _obj is an array-like object (index 0) with an id', () => {
    assert.equal(getSubjectKey({ _obj: { 0: { id: 'primary-btn' } } }), '#primary-btn');
  });

  it('returns #id for the first element even when more elements exist', () => {
    assert.equal(
      getSubjectKey({ _obj: [{ id: 'first' }, { id: 'second' }] }),
      '#first'
    );
  });

  it('falls through to selector when element id is an empty string', () => {
    const jqLike = Object.assign([{ id: '' }], { selector: '.fallback' });
    assert.equal(getSubjectKey({ _obj: jqLike }), '.fallback');
  });

  it('returns the selector when _obj has no indexed elements but has a selector property', () => {
    assert.equal(getSubjectKey({ _obj: { selector: '.my-items' } }), '.my-items');
  });

  it('returns "" when element has no id and _obj has no selector', () => {
    assert.equal(getSubjectKey({ _obj: [{}] }), '');
  });

  it('returns "" when id is not a string (e.g. a number)', () => {
    assert.equal(getSubjectKey({ _obj: [{ id: 99 }] }), '');
  });

  it('returns "" when both element id and selector are empty strings', () => {
    const jqLike = Object.assign([{ id: '' }], { selector: '' });
    assert.equal(getSubjectKey({ _obj: jqLike }), '');
  });

  it('returns "" when the selector is not a string', () => {
    assert.equal(getSubjectKey({ _obj: { selector: 42 } }), '');
  });
});

// ---------------------------------------------------------------------------
// getAssertionToken
// ---------------------------------------------------------------------------

describe('getAssertionToken', () => {
  it('returns "" when no stable subject key can be derived', () => {
    assert.equal(getAssertionToken({}, []), '');
  });

  it('returns "" for a null context', () => {
    assert.equal(getAssertionToken(null, []), '');
  });

  it('combines #id and a string expected value', () => {
    assert.equal(
      getAssertionToken({ _obj: [{ id: 'title' }] }, [null, null, null, 'Fixture']),
      '#title|Fixture'
    );
  });

  it('combines a selector and a numeric expected value', () => {
    assert.equal(
      getAssertionToken({ _obj: { selector: '.items' } }, [null, null, null, 3]),
      '.items|3'
    );
  });

  it('uses "undefined" token part when args[3] is absent', () => {
    assert.equal(
      getAssertionToken({ _obj: [{ id: 'el' }] }, []),
      '#el|undefined'
    );
  });

  it('uses "undefined" token part when args[3] is explicitly undefined', () => {
    assert.equal(
      getAssertionToken({ _obj: [{ id: 'el' }] }, [null, null, null, undefined]),
      '#el|undefined'
    );
  });

  it('uses "null" token part when args[3] is null', () => {
    assert.equal(
      getAssertionToken({ _obj: [{ id: 'el' }] }, [null, null, null, null]),
      '#el|null'
    );
  });

  it('uses "true" token part when args[3] is true', () => {
    assert.equal(
      getAssertionToken({ _obj: [{ id: 'chk' }] }, [null, null, null, true]),
      '#chk|true'
    );
  });

  it('JSON-serialises an object expected value in the token', () => {
    assert.equal(
      getAssertionToken(
        { _obj: [{ id: 'el' }] },
        [null, null, null, { count: 2 }]
      ),
      '#el|{"count":2}'
    );
  });
});

// ---------------------------------------------------------------------------
// formatSoftAssertionErrors
// ---------------------------------------------------------------------------

describe('formatSoftAssertionErrors', () => {
  it('returns null for an empty list', () => {
    assert.equal(formatSoftAssertionErrors([]), null);
  });

  it('returns a non-null string for a single error', () => {
    const result = formatSoftAssertionErrors([{ message: 'Expected X to equal Y' }]);
    assert.ok(result !== null);
  });

  it('includes the failure count in the header', () => {
    const result = formatSoftAssertionErrors([{ message: 'Err 1' }, { message: 'Err 2' }]);
    assert.ok(result.includes('SOFT ASSERTION FAILURES (2 failed):'));
  });

  it('numbers each error entry starting at 1', () => {
    const result = formatSoftAssertionErrors([
      { message: 'First' },
      { message: 'Second' },
      { message: 'Third' },
    ]);
    assert.ok(result.includes('  1. First'));
    assert.ok(result.includes('  2. Second'));
    assert.ok(result.includes('  3. Third'));
  });

  it('uses separator lines of exactly 80 characters', () => {
    const result = formatSoftAssertionErrors([{ message: 'Err' }]);
    const separatorLine = result.split('\n').find((l) => l.startsWith('='));
    assert.equal(separatorLine.length, 80);
  });

  it('includes three separator lines in the output', () => {
    const result = formatSoftAssertionErrors([{ message: 'Err' }]);
    const separatorCount = result.split('\n').filter((l) => l === '='.repeat(80)).length;
    assert.equal(separatorCount, 3);
  });

  it('produces the exact formatted string for a single error', () => {
    const sep = '='.repeat(80);
    const expected = [
      '',
      sep,
      'SOFT ASSERTION FAILURES (1 failed):',
      sep,
      '  1. Only error',
      sep,
      '',
    ].join('\n');
    assert.equal(formatSoftAssertionErrors([{ message: 'Only error' }]), expected);
  });

  it('produces the exact formatted string for multiple errors', () => {
    const sep = '='.repeat(80);
    const expected = [
      '',
      sep,
      'SOFT ASSERTION FAILURES (2 failed):',
      sep,
      '  1. Alpha',
      '  2. Beta',
      sep,
      '',
    ].join('\n');
    assert.equal(
      formatSoftAssertionErrors([{ message: 'Alpha' }, { message: 'Beta' }]),
      expected
    );
  });

  it('does not include stack traces in the formatted output', () => {
    const result = formatSoftAssertionErrors([
      { message: 'Visible error', stack: 'at Object.<anonymous> (test.js:1:1)' },
    ]);
    assert.ok(result.includes('Visible error'));
    assert.ok(!result.includes('at Object.<anonymous>'));
  });
});

// ---------------------------------------------------------------------------
// appendUniqueError
// ---------------------------------------------------------------------------

describe('appendUniqueError', () => {
  it('appends to an empty array', () => {
    const errors = [];
    appendUniqueError(errors, 'First error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'First error');
    assert.equal(errors[0].stack, undefined);
  });

  it('appends when the last entry has a different message', () => {
    const errors = [{ message: 'Old error' }];
    appendUniqueError(errors, 'New error');
    assert.equal(errors.length, 2);
    assert.equal(errors[1].message, 'New error');
  });

  it('does NOT append a consecutive duplicate (same message, same stack)', () => {
    const errors = [{ message: 'Dup', stack: 'at foo' }];
    appendUniqueError(errors, 'Dup', 'at foo');
    assert.equal(errors.length, 1);
  });

  it('does NOT append a consecutive duplicate when both stack are undefined', () => {
    const errors = [{ message: 'Dup', stack: undefined }];
    appendUniqueError(errors, 'Dup', undefined);
    assert.equal(errors.length, 1);
  });

  it('DOES append when message matches but stack differs', () => {
    const errors = [{ message: 'Same', stack: 'at a' }];
    appendUniqueError(errors, 'Same', 'at b');
    assert.equal(errors.length, 2);
  });

  it('DOES append when stack matches but message differs', () => {
    const errors = [{ message: 'A', stack: 'at x' }];
    appendUniqueError(errors, 'B', 'at x');
    assert.equal(errors.length, 2);
  });

  it('DOES append a non-consecutive duplicate (same message seen earlier but not last)', () => {
    const errors = [{ message: 'Dup' }, { message: 'Other' }];
    appendUniqueError(errors, 'Dup');
    assert.equal(errors.length, 3);
    assert.equal(errors[2].message, 'Dup');
  });

  it('stores the provided stack on the new entry', () => {
    const errors = [];
    appendUniqueError(errors, 'Err', 'at myFunc (file.js:10:5)');
    assert.equal(errors[0].stack, 'at myFunc (file.js:10:5)');
  });

  it('stores undefined stack when none is provided', () => {
    const errors = [];
    appendUniqueError(errors, 'Err');
    assert.equal(errors[0].stack, undefined);
  });

  it('mutates the original array rather than returning a new one', () => {
    const errors = [];
    const returned = appendUniqueError(errors, 'Err');
    assert.equal(returned, undefined);
    assert.equal(errors.length, 1);
  });
});

// ---------------------------------------------------------------------------
// mergeRetryFailures
// ---------------------------------------------------------------------------

describe('mergeRetryFailures', () => {
  it('returns a copy of softErrors when retryFailures is empty', () => {
    const softErrors = [{ message: 'Existing' }];
    const result = mergeRetryFailures(softErrors, new Map());
    assert.deepEqual(result, [{ message: 'Existing' }]);
  });

  it('returns an empty array when both inputs are empty', () => {
    const result = mergeRetryFailures([], new Map());
    assert.deepEqual(result, []);
  });

  it('appends retry failures when softErrors is empty', () => {
    const retryMap = new Map([
      ['tok1', { message: 'Retry A', stack: 'at a' }],
      ['tok2', { message: 'Retry B' }],
    ]);
    const result = mergeRetryFailures([], retryMap);
    assert.equal(result.length, 2);
    assert.ok(result.some(e => e.message === 'Retry A'));
    assert.ok(result.some(e => e.message === 'Retry B'));
  });

  it('skips a retry failure whose message already exists in softErrors', () => {
    const softErrors = [{ message: 'Already captured' }];
    const retryMap = new Map([['tok1', { message: 'Already captured', stack: 'different stack' }]]);
    const result = mergeRetryFailures(softErrors, retryMap);
    // Message matches → skip; result should only have the original one
    assert.equal(result.length, 1);
    assert.equal(result[0].message, 'Already captured');
  });

  it('includes a retry failure whose message is different even if stack matches', () => {
    const softErrors = [{ message: 'A', stack: 'shared stack' }];
    const retryMap = new Map([['tok1', { message: 'B', stack: 'shared stack' }]]);
    const result = mergeRetryFailures(softErrors, retryMap);
    assert.equal(result.length, 2);
  });

  it('does not mutate the softErrors input array', () => {
    const softErrors = [{ message: 'Original' }];
    const retryMap = new Map([['tok1', { message: 'New' }]]);
    mergeRetryFailures(softErrors, retryMap);
    assert.equal(softErrors.length, 1);
  });

  it('does not mutate the retryFailures map', () => {
    const retryMap = new Map([['tok1', { message: 'Retry' }]]);
    mergeRetryFailures([], retryMap);
    assert.equal(retryMap.size, 1);
  });

  it('handles multiple retry failures where some are duplicates', () => {
    const softErrors = [{ message: 'Keep' }];
    const retryMap = new Map([
      ['t1', { message: 'Keep' }],    // duplicate — skip
      ['t2', { message: 'New 1' }],   // unique — add
      ['t3', { message: 'New 2' }],   // unique — add
    ]);
    const result = mergeRetryFailures(softErrors, retryMap);
    assert.equal(result.length, 3);
    assert.ok(result.some(e => e.message === 'New 1'));
    assert.ok(result.some(e => e.message === 'New 2'));
  });
});

// ---------------------------------------------------------------------------
// resolveToken
// ---------------------------------------------------------------------------

describe('resolveToken', () => {
  it('returns the assertionToken when it is non-empty', () => {
    assert.equal(resolveToken('#title|Fixture', 'cmd-42', []), '#title|Fixture');
  });

  it('ignores commandId when assertionToken is present', () => {
    assert.equal(resolveToken('#title|Fixture', 'cmd-99', [null, null, null, 'other']), '#title|Fixture');
  });

  it('builds a __cmd__ token when assertionToken is empty and commandId is provided', () => {
    assert.equal(
      resolveToken('', 'cmd-42', [null, null, null, 'expected']),
      '__cmd__|cmd-42|expected'
    );
  });

  it('uses toTokenPart on args[3] in the __cmd__ token — undefined when absent', () => {
    assert.equal(resolveToken('', 'cmd-1', []), '__cmd__|cmd-1|undefined');
  });

  it('uses toTokenPart on args[3] in the __cmd__ token — null', () => {
    assert.equal(resolveToken('', 'cmd-1', [null, null, null, null]), '__cmd__|cmd-1|null');
  });

  it('uses toTokenPart on args[3] in the __cmd__ token — number', () => {
    assert.equal(resolveToken('', 'cmd-1', [null, null, null, 3]), '__cmd__|cmd-1|3');
  });

  it('uses toTokenPart on args[3] in the __cmd__ token — object', () => {
    assert.equal(
      resolveToken('', 'cmd-1', [null, null, null, { x: 1 }]),
      '__cmd__|cmd-1|{"x":1}'
    );
  });

  it('returns "" when both assertionToken and commandId are empty', () => {
    assert.equal(resolveToken('', '', []), '');
  });

  it('returns "" when assertionToken is empty and commandId is empty string', () => {
    assert.equal(resolveToken('', '', [null, null, null, 'val']), '');
  });
});
