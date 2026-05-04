/**
 * docuseal-submission-payload.test.js
 *
 * Regression for the 422 "message must be a Object" bug surfaced on
 * 2026-05-04: the route was forwarding the user-typed `message` string from
 * the dialog into DocuSeal's POST /api/submissions, but DocuSeal's API only
 * accepts `message` as an Object ({subject, body}) and 422s on a string.
 *
 * Fix: with send_email=false, DocuSeal won't send anything anyway — message
 * is meaningless to it. The user-typed message flows into our own branded
 * email via buildDocusealSignRequestEmail. So the outbound DocuSeal payload
 * MUST NOT include `message` at all.
 *
 * These tests pin the exact payload shape so a future "let's also pass the
 * message to DocuSeal" PR can't silently re-introduce the same crash.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-submission-payload.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildDocusealSubmissionPayload } from '../../routes/docuseal.js';

describe('buildDocusealSubmissionPayload', () => {
  test('returns send_email: false (white-label flow)', () => {
    const p = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'a@example.com',
    });
    assert.equal(p.send_email, false);
  });

  test(
    'does NOT include a `message` field — DocuSeal expects an Object, ' +
      'and with send_email=false it has no effect anyway',
    () => {
      const p = buildDocusealSubmissionPayload({
        template_id: 1,
        recipient_email: 'a@example.com',
        recipient_name: 'Alice',
      });
      assert.ok(
        !('message' in p),
        'payload must not carry `message` — DocuSeal 422s on string, no-op on object with send_email=false',
      );
    },
  );

  test('serializes single submitter with email + optional name', () => {
    const withName = buildDocusealSubmissionPayload({
      template_id: 7,
      recipient_email: 'recipient@example.com',
      recipient_name: 'Recipient Person',
    });
    assert.deepEqual(withName.submitters, [
      { email: 'recipient@example.com', name: 'Recipient Person' },
    ]);

    const withoutName = buildDocusealSubmissionPayload({
      template_id: 7,
      recipient_email: 'recipient@example.com',
    });
    assert.deepEqual(withoutName.submitters, [{ email: 'recipient@example.com' }]);
    assert.ok(
      !('name' in withoutName.submitters[0]),
      'omit `name` entirely when not provided — do not send name: undefined',
    );
  });

  test('forwards template_id verbatim (number or string)', () => {
    assert.equal(
      buildDocusealSubmissionPayload({
        template_id: 42,
        recipient_email: 'a@b.com',
      }).template_id,
      42,
    );

    assert.equal(
      buildDocusealSubmissionPayload({
        template_id: '42',
        recipient_email: 'a@b.com',
      }).template_id,
      '42',
    );
  });

  test('payload shape is exactly { template_id, send_email, submitters } — no extras', () => {
    const p = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'a@b.com',
      recipient_name: 'A',
    });
    assert.deepEqual(Object.keys(p).sort(), ['send_email', 'submitters', 'template_id']);
  });

  test('JSON-serializable (no functions, no undefined)', () => {
    const p = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'a@b.com',
    });
    const round = JSON.parse(JSON.stringify(p));
    assert.deepEqual(round, p);
  });

  test('regression: a `message` string from the dialog must not reach DocuSeal', () => {
    // Even if a future caller accidentally passes message, the helper signature
    // ignores it. This is enforced by the helper not having a `message` param.
    const p = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'a@b.com',
      // @ts-expect-error — intentionally pass an extra field to verify it's dropped
      message: 'Please sign by Friday.',
    });
    assert.ok(!('message' in p));
  });
});
