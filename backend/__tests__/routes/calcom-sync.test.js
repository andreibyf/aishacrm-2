/**
 * calcom-sync.test.js
 *
 * Integration tests for the Cal.com direct-DB sync service:
 *   - pushActivityToCalcom   → writes Booking + Attendee to calcom-db
 *   - removeActivityFromCalcom → cancels Booking in calcom-db
 *   - pullCalcomBookings       → reads Booking from calcom-db → upserts booking_sessions
 *
 * Requires:
 *   - aishacrm-backend running (BACKEND_URL || http://localhost:3001)
 *   - calcom-db container running (CALCOM_DB_URL env)
 *   - tenant_integrations row for TEST_TENANT_ID with integration_type='calcom'
 *
 * Uses Node.js native test runner. No Jest/Vitest.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getSupabaseClient } from '../../lib/supabase-db.js';
import {
  pushActivityToCalcom,
  removeActivityFromCalcom,
  pullCalcomBookings,
} from '../../lib/calcomSyncService.js';

const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const CALCOM_DB_URL =
  process.env.CALCOM_DB_URL || 'postgresql://calcom:calcom_local@calcom-db:5432/calcom';

const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

let pool;
let resolvedCalcomUserId = 1;
let resolvedEventTypeId = 1;

function getCalcomPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: CALCOM_DB_URL, ssl: false, max: 2 });
  }
  return pool;
}

async function resolveExistingCalcomMapping() {
  const { rows } = await getCalcomPool().query(
    `SELECT et.id AS event_type_id, et."userId" AS calcom_user_id
       FROM "EventType" et
      ORDER BY et.id ASC
      LIMIT 1`,
  );

  if (!rows.length) {
    throw new Error('No Cal.com EventType rows found; scheduling fixtures are not initialized');
  }

  return {
    calcomUserId: Number(rows[0].calcom_user_id),
    eventTypeId: Number(rows[0].event_type_id),
  };
}

async function ensureTenantIntegrationCalcomConfig() {
  const mapping = await resolveExistingCalcomMapping();
  resolvedCalcomUserId = mapping.calcomUserId;
  resolvedEventTypeId = mapping.eventTypeId;

  const sb = getSupabaseClient();
  const { data: rows, error } = await sb
    .from('tenant_integrations')
    .select('id,config')
    .eq('tenant_id', TENANT_ID)
    .eq('integration_type', 'calcom')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to read tenant integration: ${error.message}`);
  if (!rows?.length) {
    throw new Error('Missing active Cal.com tenant integration for test tenant');
  }

  const current = rows[0].config || {};
  const { rows: validRows } = await getCalcomPool().query(
    `SELECT 1
       FROM "EventType"
      WHERE id = $1 AND "userId" = $2
      LIMIT 1`,
    [Number(current.event_type_id || 0), Number(current.calcom_user_id || 0)],
  );

  if (validRows.length > 0) return;

  const nextConfig = {
    ...current,
    calcom_user_id: resolvedCalcomUserId,
    event_type_id: resolvedEventTypeId,
  };

  const { error: updateError } = await sb
    .from('tenant_integrations')
    .update({ config: nextConfig })
    .eq('id', rows[0].id)
    .eq('tenant_id', TENANT_ID);

  if (updateError) {
    throw new Error(`Failed to update tenant integration config: ${updateError.message}`);
  }
}

async function resolveEmployeeWithoutCalcomMapping() {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('employees')
    .select('id, metadata')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to query employees for fixture setup: ${error.message}`);
  }

  for (const row of data || []) {
    const meta = row.metadata || {};
    if (!meta.calcom_user_id && !meta.calcom_event_type_id) {
      return row.id;
    }
  }

  throw new Error('No employee without Cal.com mapping found for assigned activity test');
}

async function getCalcomBookingByUid(uid) {
  const { rows } = await getCalcomPool().query(
    `SELECT id, uid, status, "startTime", "endTime", metadata FROM "Booking" WHERE uid = $1`,
    [uid],
  );
  return rows[0] || null;
}

async function getAttendeesByBookingId(bookingId) {
  const { rows } = await getCalcomPool().query(
    `SELECT id, email, name FROM "Attendee" WHERE "bookingId" = $1`,
    [bookingId],
  );
  return rows;
}

async function deleteCalcomBookingByUid(uid) {
  // Delete attendees first (FK), then booking
  const { rows } = await getCalcomPool().query(`SELECT id FROM "Booking" WHERE uid = $1`, [uid]);
  const bookingId = rows[0]?.id;
  if (bookingId) {
    await getCalcomPool().query(`DELETE FROM "Attendee" WHERE "bookingId" = $1`, [bookingId]);
    await getCalcomPool().query(`DELETE FROM "Booking" WHERE id = $1`, [bookingId]);
  }
}

async function deleteBookingSession(calcomBookingId) {
  const sb = getSupabaseClient();
  await sb
    .from('booking_sessions')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('calcom_booking_id', calcomBookingId);
}

async function createTestActivity(overrides = {}) {
  const sb = getSupabaseClient();
  const activity = {
    tenant_id: TENANT_ID,
    type: 'meeting',
    subject: `Test Meeting ${Date.now()}`,
    due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
    due_time: '14:00',
    duration_minutes: 30,
    status: 'scheduled',
    metadata: {},
    ...overrides,
  };
  const { data, error } = await sb.from('activities').insert([activity]).select('*').single();
  if (error) throw new Error(`Failed to create test activity: ${error.message}`);
  return data;
}

async function deleteTestActivity(id) {
  const sb = getSupabaseClient();
  await sb.from('activities').delete().eq('id', id).eq('tenant_id', TENANT_ID);
}

// ---------------------------------------------------------------------------
// pushActivityToCalcom
// ---------------------------------------------------------------------------

describe('pushActivityToCalcom — creates Booking in calcom-db', { skip: !SHOULD_RUN }, () => {
  let activity;
  let createdUid;

  before(async () => {
    await ensureTenantIntegrationCalcomConfig();
    activity = await createTestActivity({ subject: 'Push Test Meeting' });
  });

  test('creates a Booking row in calcom-db for a syncable activity', async () => {
    await pushActivityToCalcom(TENANT_ID, activity);

    // Reload activity to get the calcom_block_uid stored in metadata
    const sb = getSupabaseClient();
    const { data: updated } = await sb
      .from('activities')
      .select('metadata')
      .eq('id', activity.id)
      .single();

    createdUid = updated?.metadata?.calcom_block_uid;
    assert.ok(createdUid, 'calcom_block_uid should be written to activity metadata');

    const booking = await getCalcomBookingByUid(createdUid);
    assert.ok(booking, 'Booking row should exist in calcom-db');
    assert.equal(booking.status, 'accepted');
    assert.ok(booking.metadata?.crm_activity_id, 'Booking metadata should link to CRM activity');
    assert.equal(booking.metadata.crm_activity_id, activity.id);
  });

  test('creates an Attendee row linked to the Booking', async () => {
    if (!createdUid) return;
    const booking = await getCalcomBookingByUid(createdUid);
    const attendees = await getAttendeesByBookingId(booking.id);
    assert.ok(attendees.length > 0, 'At least one Attendee should be created');
  });

  test('skips push for non-syncable activity type (task)', async () => {
    const taskActivity = await createTestActivity({
      type: 'task',
      subject: 'Should not sync',
    });
    await pushActivityToCalcom(TENANT_ID, taskActivity);

    const sb = getSupabaseClient();
    const { data: reloaded } = await sb
      .from('activities')
      .select('metadata')
      .eq('id', taskActivity.id)
      .single();

    assert.ok(
      !reloaded?.metadata?.calcom_block_uid,
      'Non-syncable activity should not get calcom_block_uid',
    );
    await deleteTestActivity(taskActivity.id);
  });

  test('skips push when due_time is missing', async () => {
    const noTimeActivity = await createTestActivity({
      type: 'meeting',
      due_time: null,
      subject: 'No time activity',
    });
    await pushActivityToCalcom(TENANT_ID, noTimeActivity);

    const sb = getSupabaseClient();
    const { data: reloaded } = await sb
      .from('activities')
      .select('metadata')
      .eq('id', noTimeActivity.id)
      .single();

    assert.ok(
      !reloaded?.metadata?.calcom_block_uid,
      'Activity without due_time should not get calcom_block_uid',
    );
    await deleteTestActivity(noTimeActivity.id);
  });

  test('skips push for assigned activity when assignee has no employee Cal.com mapping', async () => {
    const unmappedEmployeeId = await resolveEmployeeWithoutCalcomMapping();

    const unmappedAssignedActivity = await createTestActivity({
      type: 'meeting',
      subject: 'Assigned without Cal.com mapping',
      assigned_to: unmappedEmployeeId,
    });

    await pushActivityToCalcom(TENANT_ID, unmappedAssignedActivity);

    const sb = getSupabaseClient();
    const { data: reloaded } = await sb
      .from('activities')
      .select('metadata')
      .eq('id', unmappedAssignedActivity.id)
      .single();

    assert.ok(
      !reloaded?.metadata?.calcom_block_uid,
      'Assigned activity without employee mapping should not get calcom_block_uid',
    );

    await deleteTestActivity(unmappedAssignedActivity.id);
  });

  test('reschedules existing booking when calcom_block_uid already set', async () => {
    if (!createdUid) return;

    // Move the activity 2 hours later and push again
    const newDueTime = '16:00';
    const rescheduledActivity = {
      ...activity,
      due_time: newDueTime,
      metadata: { calcom_block_uid: createdUid },
    };

    await pushActivityToCalcom(TENANT_ID, rescheduledActivity);

    const booking = await getCalcomBookingByUid(createdUid);
    assert.ok(booking, 'Booking should still exist after reschedule');
    const bookingHour = new Date(booking.startTime).getUTCHours();
    assert.equal(bookingHour, 16, 'startTime should reflect the new 16:00 due_time');
  });

  after(async () => {
    if (createdUid) await deleteCalcomBookingByUid(createdUid);
    if (activity?.id) await deleteTestActivity(activity.id);
  });
});

// ---------------------------------------------------------------------------
// removeActivityFromCalcom
// ---------------------------------------------------------------------------

describe('removeActivityFromCalcom — cancels Booking in calcom-db', { skip: !SHOULD_RUN }, () => {
  let activity;
  let blockUid;

  before(async () => {
    await ensureTenantIntegrationCalcomConfig();
    activity = await createTestActivity({ subject: 'Remove Test Meeting' });
    await pushActivityToCalcom(TENANT_ID, activity);

    const sb = getSupabaseClient();
    const { data: updated } = await sb
      .from('activities')
      .select('metadata')
      .eq('id', activity.id)
      .single();
    blockUid = updated?.metadata?.calcom_block_uid;
    // Reflect the stored uid in our local activity object
    activity = { ...activity, metadata: { calcom_block_uid: blockUid } };
  });

  test('sets Booking status to cancelled in calcom-db', async () => {
    assert.ok(blockUid, 'Test setup: calcom_block_uid must be set');
    await removeActivityFromCalcom(TENANT_ID, activity);

    const booking = await getCalcomBookingByUid(blockUid);
    assert.ok(booking, 'Booking row should still exist (soft cancel)');
    assert.equal(booking.status, 'cancelled');
  });

  test('is a no-op when calcom_block_uid is not set', async () => {
    // Should not throw
    await assert.doesNotReject(() =>
      removeActivityFromCalcom(TENANT_ID, { id: 'fake', metadata: {} }),
    );
  });

  after(async () => {
    if (blockUid) await deleteCalcomBookingByUid(blockUid);
    if (activity?.id) await deleteTestActivity(activity.id);
  });
});

// ---------------------------------------------------------------------------
// pullCalcomBookings
// ---------------------------------------------------------------------------

describe(
  'pullCalcomBookings — syncs calcom-db Bookings to booking_sessions',
  { skip: !SHOULD_RUN },
  () => {
    const testUid = `test-pull-${Date.now()}`;
    let calcomUserId = 1;
    let eventTypeId = 1;

    before(async () => {
      await ensureTenantIntegrationCalcomConfig();
      calcomUserId = resolvedCalcomUserId;
      eventTypeId = resolvedEventTypeId;

      // Insert a future booking directly into calcom-db (simulates a client booking)
      const start = new Date(Date.now() + 3600 * 1000 * 2); // 2 hours from now
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      await getCalcomPool().query(
        `INSERT INTO "Booking" (uid, "userId", "eventTypeId", title, "startTime", "endTime",
         status, metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'accepted'::"BookingStatus", '{}'::jsonb, NOW(), NOW())`,
        [testUid, calcomUserId, eventTypeId, 'Client Pull Test', start, end],
      );

      // Insert attendee
      const { rows } = await getCalcomPool().query(`SELECT id FROM "Booking" WHERE uid = $1`, [
        testUid,
      ]);
      const bookingId = rows[0]?.id;
      if (bookingId) {
        await getCalcomPool().query(
          `INSERT INTO "Attendee" (email, name, "timeZone", locale, "bookingId") VALUES ($1,$2,'UTC','en',$3)`,
          ['client@example.com', 'Test Client', bookingId],
        );
      }
    });

    test('upserts upcoming bookings into booking_sessions', async () => {
      const result = await pullCalcomBookings(TENANT_ID);

      assert.equal(typeof result.synced, 'number');
      assert.ok(result.errors.length === 0, `Pull errors: ${JSON.stringify(result.errors)}`);
      assert.ok(result.synced >= 1, 'Should have synced at least the test booking');

      const sb = getSupabaseClient();
      const { data } = await sb
        .from('booking_sessions')
        .select('id, status, calcom_booking_id')
        .eq('tenant_id', TENANT_ID)
        .eq('calcom_booking_id', testUid)
        .maybeSingle();

      assert.ok(data, 'booking_sessions row should exist for the pulled booking');
      assert.equal(data.status, 'confirmed');
    });

    test('does not double-import CRM-created blocker bookings', async () => {
      // Blockers have crm_activity_id in metadata — they should be excluded
      const blockerUid = `blocker-${Date.now()}`;
      const start = new Date(Date.now() + 3600 * 1000 * 3);
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      await getCalcomPool().query(
        `INSERT INTO "Booking" (uid, "userId", "eventTypeId", title, "startTime", "endTime",
         status, metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'accepted'::"BookingStatus", $7::jsonb, NOW(), NOW())`,
        [
          blockerUid,
          calcomUserId,
          eventTypeId,
          'CRM Blocker',
          start,
          end,
          JSON.stringify({ crm_activity_id: 'some-crm-id', crm_tenant_id: TENANT_ID }),
        ],
      );

      const before = await pullCalcomBookings(TENANT_ID);
      const sb = getSupabaseClient();
      const { data } = await sb
        .from('booking_sessions')
        .select('id')
        .eq('tenant_id', TENANT_ID)
        .eq('calcom_booking_id', blockerUid)
        .maybeSingle();

      assert.ok(!data, 'CRM blocker bookings should NOT be imported into booking_sessions');
      assert.equal(before.errors.length, 0);

      await deleteCalcomBookingByUid(blockerUid);
    });

    test('returns synced:0 and an error when calcom-db is unreachable', async () => {
      // Temporarily point to a bad URL by passing a tenant with no config
      const result = await pullCalcomBookings('00000000-0000-0000-0000-000000000000');
      assert.equal(result.synced, 0);
      assert.ok(result.errors.length > 0, 'Should have an error for unconfigured tenant');
    });

    after(async () => {
      await deleteCalcomBookingByUid(testUid);
      await deleteBookingSession(testUid);
      if (pool) {
        await pool.end();
        pool = null;
      }
    });
  },
);
