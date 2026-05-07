/**
 * registry-policy-inference.test.js
 *
 * Locks the contract that the @policy(...) annotation in a .braid file is
 * the source of truth for the tool registry's policy field — NOT a name-prefix
 * heuristic.
 *
 * The original bug (4VD-10):
 *   - sync-registry.js had its own inline heuristic that classified write
 *     operations by function name prefix (create/update/delete/mark/...)
 *   - "send", "draft", "invite", "call", "initiate", "process", "analyze",
 *     "instantiate", "clear", "full" were NOT in the heuristic
 *   - 10 tools that explicitly declared @policy(WRITE_OPERATIONS) were
 *     silently downgraded to READ_ONLY in the registry
 *   - That defeats the runtime capability gate for those tools
 *
 * The fix: inferPolicy now reads the annotations array and uses the explicit
 * declaration when present. Heuristic only fires for legacy files without
 * @policy annotations.
 *
 * Run:
 *   cd braid-llm-kit && node --test tools/__tests__/registry-policy-inference.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { inferPolicy } from '../generate-registry.js';

describe('inferPolicy — explicit @policy annotation is the source of truth', () => {
  test('explicit @policy(WRITE_OPERATIONS) wins over heuristic', () => {
    // sendDocumentForSigning would be misclassified as READ_ONLY by the
    // legacy heuristic (no "send" in writePatterns at the time of the bug).
    // The annotation must override.
    const out = inferPolicy('sendDocumentForSigning', [], [
      { name: 'policy', args: ['WRITE_OPERATIONS'] },
    ]);
    assert.equal(out, 'WRITE_OPERATIONS');
  });

  test('explicit @policy(READ_ONLY) is honored even if name looks write-y', () => {
    // markActivityAsViewed starts with "mark" (heuristic says WRITE) but
    // could conceivably be a read operation. Annotation wins.
    const out = inferPolicy('markActivityAsViewed', [], [
      { name: 'policy', args: ['READ_ONLY'] },
    ]);
    assert.equal(out, 'READ_ONLY');
  });

  test('@policy(DELETE_OPERATIONS) coerces to WRITE_OPERATIONS for registry', () => {
    // The registry's policy field is { READ_ONLY | WRITE_OPERATIONS } only.
    // DELETE_OPERATIONS in the .braid file is a finer-grained capability
    // that the runtime engine handles separately; the registry stores it
    // as the broader WRITE_OPERATIONS bucket.
    const out = inferPolicy('deleteAccount', [], [
      { name: 'policy', args: ['DELETE_OPERATIONS'] },
    ]);
    assert.equal(out, 'WRITE_OPERATIONS');
  });

  test('unknown @policy value falls through to heuristic', () => {
    // Defensive: if a typo or future policy name appears, don't emit it
    // verbatim into the registry (would break runtime capability lookup).
    const out = inferPolicy('createSomething', [], [
      { name: 'policy', args: ['WHATEVER'] },
    ]);
    assert.equal(out, 'WRITE_OPERATIONS', 'falls back to heuristic; "create" is a write verb');
  });

  test('multiple annotations: only the @policy one is consulted', () => {
    const out = inferPolicy('sendDocumentForSigning', [], [
      { name: 'rateLimit', args: ['10'] },
      { name: 'policy', args: ['WRITE_OPERATIONS'] },
      { name: 'audit', args: ['true'] },
    ]);
    assert.equal(out, 'WRITE_OPERATIONS');
  });
});

describe('inferPolicy — heuristic fallback (legacy files without @policy)', () => {
  test('write verb prefix → WRITE_OPERATIONS', () => {
    assert.equal(inferPolicy('createAccount', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('updateContact', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('deleteOpp', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('markComplete', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('convertLead', [], []), 'WRITE_OPERATIONS');
  });

  test('expanded heuristic includes "send", "publish", "archive", "promote"', () => {
    // These were missing from the original heuristic.
    assert.equal(inferPolicy('sendNewsletter', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('publishArticle', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('archiveRecord', [], []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('promoteUser', [], []), 'WRITE_OPERATIONS');
  });

  test('read verb prefix → READ_ONLY', () => {
    assert.equal(inferPolicy('listAccounts', [], []), 'READ_ONLY');
    assert.equal(inferPolicy('getAccount', [], []), 'READ_ONLY');
    assert.equal(inferPolicy('searchContacts', [], []), 'READ_ONLY');
    assert.equal(inferPolicy('fetchSnapshot', [], []), 'READ_ONLY');
  });

  test('no @policy + name not in writePatterns → defaults to READ_ONLY', () => {
    // Conservative default — better to under-grant than over-grant. The
    // explicit @policy annotation is how authors opt up to write.
    assert.equal(inferPolicy('analyzeDocument', [], []), 'READ_ONLY');
    assert.equal(inferPolicy('initiateCall', [], []), 'READ_ONLY');
  });

  test('annotations argument is optional (backward compat)', () => {
    // Legacy callers may not pass annotations — the function should still
    // work and use the heuristic.
    assert.equal(inferPolicy('createX', []), 'WRITE_OPERATIONS');
    assert.equal(inferPolicy('listX', []), 'READ_ONLY');
  });
});

describe('inferPolicy — annotation edge cases', () => {
  test('null annotations entry does not crash', () => {
    const out = inferPolicy('createX', [], [null, undefined, { name: 'policy', args: ['READ_ONLY'] }]);
    assert.equal(out, 'READ_ONLY');
  });

  test('@policy with no args falls through to heuristic', () => {
    const out = inferPolicy('createX', [], [{ name: 'policy', args: [] }]);
    assert.equal(out, 'WRITE_OPERATIONS', 'falls back to heuristic; "create" is a write verb');
  });

  test('@policy with non-array args falls through to heuristic', () => {
    const out = inferPolicy('createX', [], [{ name: 'policy', args: 'WRITE_OPERATIONS' }]);
    assert.equal(out, 'WRITE_OPERATIONS', 'still WRITE via heuristic, not because annotation parsed');
  });
});
