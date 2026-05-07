/**
 * docuseal-webhook-collapse.test.js
 *
 * Tests for the 4VD-33 createActivity refactor — collapses 4 separate
 * activity rows (sent/viewed/signed/completed) into ONE status-tracking
 * row that webhook events update in place.
 *
 * Pins:
 *   - activityStatusFor maps each event to the right activity status
 *   - metadataTimestampFieldFor maps each event to the right metadata key
 *
 * Note: the createActivity function itself is internal (not exported).
 * The exported helpers are sufficient to lock the contract — they're the
 * pure data-shape decisions; the supabase plumbing around them is mostly
 * boilerplate that the integration test in docuseal-events.test.js
 * already exercises.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-webhook-collapse.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  activityStatusFor,
  metadataTimestampFieldFor,
} from '../../routes/docuseal-webhook.js';

describe('activityStatusFor — webhook event → activity row status', () => {
  test('document_viewed keeps row at pending (waiting on signature)', () => {
    assert.equal(activityStatusFor('document_viewed'), 'pending');
  });

  test('document_signed marks the row completed', () => {
    assert.equal(activityStatusFor('document_signed'), 'completed');
  });

  test('document_completed marks the row completed (signed PDF finalized)', () => {
    assert.equal(activityStatusFor('document_completed'), 'completed');
  });

  test('document_declined marks the row cancelled', () => {
    assert.equal(activityStatusFor('document_declined'), 'cancelled');
  });

  test('document_expired marks the row cancelled', () => {
    assert.equal(activityStatusFor('document_expired'), 'cancelled');
  });

  test('document_failed marks the row cancelled', () => {
    assert.equal(activityStatusFor('document_failed'), 'cancelled');
  });

  test('unknown activity type defaults to pending (conservative, not lost)', () => {
    assert.equal(activityStatusFor('document_unknown'), 'pending');
    assert.equal(activityStatusFor(''), 'pending');
    assert.equal(activityStatusFor(undefined), 'pending');
  });
});

describe('metadataTimestampFieldFor — webhook event → metadata.<key>', () => {
  test('viewed → viewed_at', () => {
    assert.equal(metadataTimestampFieldFor('document_viewed'), 'viewed_at');
  });

  test('signed → signed_at', () => {
    assert.equal(metadataTimestampFieldFor('document_signed'), 'signed_at');
  });

  test('completed → completed_at', () => {
    assert.equal(metadataTimestampFieldFor('document_completed'), 'completed_at');
  });

  test('declined → declined_at', () => {
    assert.equal(metadataTimestampFieldFor('document_declined'), 'declined_at');
  });

  test('expired → expired_at', () => {
    assert.equal(metadataTimestampFieldFor('document_expired'), 'expired_at');
  });

  test('failed → failed_at', () => {
    assert.equal(metadataTimestampFieldFor('document_failed'), 'failed_at');
  });

  test('unknown event has no timestamp slot (returns null)', () => {
    assert.equal(metadataTimestampFieldFor('document_unknown'), null);
    assert.equal(metadataTimestampFieldFor(''), null);
  });
});

describe('eventTimestamp passthrough (PR #566 P2 fix)', () => {
  // The webhook handler now passes payload.timestamp into createActivity,
  // and createActivity uses it as eventTs instead of new Date(). This locks
  // the expected behavior at the contract level:
  //
  //   const eventTs = eventTimestamp || new Date().toISOString();
  //
  // Direct unit testing of createActivity (which is non-exported and supabase-
  // bound) would require a heavy mock harness; the integration check is via
  // the webhook handler. What this suite pins is the data-shape decisions —
  // the actual time-source fix is reviewed in code (the eventTs assignment).

  test('metadataTimestampFieldFor still returns the correct slot regardless of source', () => {
    // The slot mapping is unchanged by the timestamp-source fix — what changed
    // is WHICH timestamp value is written into the slot. Re-pin to make sure
    // the fix didn't accidentally drop the mapping.
    assert.equal(metadataTimestampFieldFor('document_viewed'), 'viewed_at');
    assert.equal(metadataTimestampFieldFor('document_signed'), 'signed_at');
    assert.equal(metadataTimestampFieldFor('document_completed'), 'completed_at');
    assert.equal(metadataTimestampFieldFor('document_declined'), 'declined_at');
  });
});

describe('lifecycle status progression — pending → completed/cancelled', () => {
  // The status field on the SINGLE activity row should monotonically progress
  // through the lifecycle. These tests document the intended state machine.
  test('pending (sent) → pending (viewed) → completed (signed)', () => {
    assert.equal(activityStatusFor('document_viewed'), 'pending');
    assert.equal(activityStatusFor('document_signed'), 'completed');
  });

  test('pending (sent) → cancelled (declined)', () => {
    assert.equal(activityStatusFor('document_declined'), 'cancelled');
  });

  test('all "completing" events resolve to terminal completed/cancelled', () => {
    const completing = ['document_signed', 'document_completed'];
    const cancelling = ['document_declined', 'document_expired', 'document_failed'];
    for (const e of completing) assert.equal(activityStatusFor(e), 'completed');
    for (const e of cancelling) assert.equal(activityStatusFor(e), 'cancelled');
  });
});
