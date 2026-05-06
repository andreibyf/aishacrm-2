/**
 * docuseal-events.test.js
 *
 * Tests for the EVENT_MAP and status-transition guard added in 4VD-9.
 *
 * These pin the DocuSeal-event → CRM-status contract so a future "let's
 * also handle template.archived" PR can't silently break the existing
 * lifecycle, and the rename of submission.declined → form.declined (which
 * happened between MVP rollout and 2026-05) stays handled in both
 * directions.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-events.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_MAP,
  STATUS_RANK,
  canTransition,
} from '../../routes/docuseal-webhook.js';

// ---------------------------------------------------------------------------
// EVENT_MAP coverage — every DocuSeal event we care about is mapped
// ---------------------------------------------------------------------------

describe('EVENT_MAP coverage', () => {
  test('handles every DocuSeal Community event the CRM cares about', () => {
    // The 7 events that drive lifecycle state. Other DocuSeal events
    // (submission.created/archived, template.*, form.started's
    // submission counterpart) intentionally aren't in EVENT_MAP — the
    // route logs them as ignored with a 200 so DocuSeal doesn't retry.
    const expected = [
      'form.viewed',
      'form.started',
      'form.completed',
      'form.declined',
      'submission.completed',
      'submission.declined',
      'submission.expired',
    ];
    for (const eventType of expected) {
      assert.ok(EVENT_MAP[eventType], `EVENT_MAP missing ${eventType}`);
    }
  });

  test('every mapping has the {status, activity, timestampField} shape', () => {
    for (const [eventType, mapping] of Object.entries(EVENT_MAP)) {
      assert.equal(typeof mapping.status, 'string', `${eventType}.status`);
      assert.equal(typeof mapping.activity, 'string', `${eventType}.activity`);
      assert.ok(
        mapping.timestampField === null || typeof mapping.timestampField === 'string',
        `${eventType}.timestampField must be string|null`,
      );
    }
  });

  test('every mapped status is a known status in STATUS_RANK', () => {
    for (const [eventType, mapping] of Object.entries(EVENT_MAP)) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(STATUS_RANK, mapping.status),
        `EVENT_MAP[${eventType}].status="${mapping.status}" not in STATUS_RANK`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Specific event semantics — pin the meaningful behaviours
// ---------------------------------------------------------------------------

describe('EVENT_MAP — view-equivalent events (dedupe collapses to one activity)', () => {
  test('form.viewed maps to status=viewed, activity=document_viewed, viewed_at timestamp', () => {
    assert.deepEqual(EVENT_MAP['form.viewed'], {
      status: 'viewed',
      activity: 'document_viewed',
      timestampField: 'viewed_at',
    });
  });

  test('form.started maps to the SAME shape as form.viewed', () => {
    // Some DocuSeal versions only fire `started` (never `viewed`); some
    // fire both. Mapping them identically + relying on the 1h dedupe in
    // createActivity collapses the duplicate-activity case.
    assert.deepEqual(EVENT_MAP['form.started'], EVENT_MAP['form.viewed']);
  });
});

describe('EVENT_MAP — decline events (DocuSeal renamed; both names kept)', () => {
  test('form.declined and submission.declined map identically', () => {
    // DocuSeal renamed submission.declined → form.declined somewhere
    // between MVP rollout and 2026-05. Keep both so the handler is
    // forward and backward compatible.
    assert.deepEqual(EVENT_MAP['form.declined'], EVENT_MAP['submission.declined']);
    assert.equal(EVENT_MAP['form.declined'].status, 'declined');
    assert.equal(EVENT_MAP['form.declined'].activity, 'document_declined');
    assert.equal(EVENT_MAP['form.declined'].timestampField, null);
  });
});

describe('EVENT_MAP — completion + expiry', () => {
  test('submission.completed sets completed_at timestamp', () => {
    assert.equal(EVENT_MAP['submission.completed'].status, 'completed');
    assert.equal(EVENT_MAP['submission.completed'].activity, 'document_completed');
    assert.equal(EVENT_MAP['submission.completed'].timestampField, 'completed_at');
  });

  test('form.completed marks per-recipient signed (multi-signer scenarios)', () => {
    // Note: this is per-submitter, not per-submission. A two-signer flow
    // gets two form.completed events followed by one submission.completed.
    assert.equal(EVENT_MAP['form.completed'].status, 'signed');
    assert.equal(EVENT_MAP['form.completed'].activity, 'document_signed');
    assert.equal(EVENT_MAP['form.completed'].timestampField, null);
  });

  test('submission.expired is terminal', () => {
    assert.equal(EVENT_MAP['submission.expired'].status, 'expired');
    assert.equal(EVENT_MAP['submission.expired'].activity, 'document_expired');
  });
});

// ---------------------------------------------------------------------------
// canTransition — guards against status regression on out-of-order events
// ---------------------------------------------------------------------------

describe('canTransition — forward progressions', () => {
  test('pending → sent → viewed → signed → completed all advance', () => {
    assert.equal(canTransition('pending', 'sent'), true);
    assert.equal(canTransition('sent', 'viewed'), true);
    assert.equal(canTransition('viewed', 'signed'), true);
    assert.equal(canTransition('signed', 'completed'), true);
  });

  test('same-rank transitions are allowed (idempotent re-application)', () => {
    // completed=4, declined=4, expired=4 — replaying the same event must
    // not be rejected as regression. canTransition uses next >= cur.
    assert.equal(canTransition('completed', 'completed'), true);
    assert.equal(canTransition('declined', 'declined'), true);
  });
});

describe('canTransition — regressions blocked', () => {
  test('completed → viewed rejected (out-of-order webhook)', () => {
    assert.equal(canTransition('completed', 'viewed'), false);
  });

  test('signed → sent rejected', () => {
    assert.equal(canTransition('signed', 'sent'), false);
  });

  test('declined → viewed rejected (terminal status protected)', () => {
    assert.equal(canTransition('declined', 'viewed'), false);
  });

  test('expired → sent rejected', () => {
    assert.equal(canTransition('expired', 'sent'), false);
  });
});

describe('canTransition — terminal cross-transitions', () => {
  test('completed → declined is allowed by rank but caller should not use it', () => {
    // rank(completed)=rank(declined)=4. The guard does not enforce
    // "can't change a final disposition" — it only enforces "can't go
    // backwards". DocuSeal would never fire submission.declined after
    // submission.completed for the same submission, so this is a
    // theoretical case. Documenting the behaviour.
    assert.equal(canTransition('completed', 'declined'), true);
  });
});

describe('canTransition — unknown statuses', () => {
  test('unknown current status is treated as rank 0 (most permissive)', () => {
    // A row with a typoed/legacy status shouldn't lock the row out of
    // accepting new events. Default is 0, so any known forward status
    // can be applied.
    assert.equal(canTransition('mystery', 'completed'), true);
    assert.equal(canTransition('mystery', 'sent'), true);
  });

  test('unknown new status is treated as rank 0 (so applying gibberish does not regress a real status)', () => {
    // If DocuSeal ever introduces a new event we haven't mapped, the
    // mapping lookup returns undefined first, so we never reach
    // canTransition with an unknown new status. Defensive check that
    // even if we did, the guard does not destructively rewrite a real
    // status to an unknown one.
    assert.equal(canTransition('completed', 'totally-new-status'), false);
  });
});
