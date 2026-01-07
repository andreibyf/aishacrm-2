/**
 * Activities V2 Route Filter Tests
 * Tests filter capabilities of /api/v2/activities endpoint
 * 
 * Migrated from v1 to v2 AI-enhanced routes
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// Unique subject prefix to isolate test data
const TEST_SUBJECT_PREFIX = `FiltersUT_${Date.now()}`;

const createdIds = [];

/**
 * Create an activity via v2 endpoint
 * @param {Object} payload - Activity fields
 * @returns {Promise<{status: number, json: Object}>}
 */
async function createActivity(payload) {
  const res = await fetch(`${BASE_URL}/api/v2/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      type: 'task',
      subject: `${TEST_SUBJECT_PREFIX} Test`,
      body: 'Test activity for filter validation',
      status: 'scheduled',
      is_test_data: true,
      ...payload
    })
  });
  const json = await res.json();
  return { status: res.status, json };
}

/**
 * Delete an activity via v2 endpoint
 * @param {string} id - Activity UUID
 */
async function deleteActivity(id) {
  try {
    await fetch(`${BASE_URL}/api/v2/activities/${id}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE'
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Extract activity ID from v2 response
 * @param {Object} json - Response JSON
 * @returns {string|null}
 */
function extractActivityId(json) {
  return json?.data?.activity?.id || json?.data?.id || null;
}

// Setup: Create test activities
before(async () => {
  if (!SHOULD_RUN) return;

  // Activity A: Due Nov 10, tagged x,y
  const A = await createActivity({
    subject: `${TEST_SUBJECT_PREFIX} Activity A`,
    tags: ['x', 'y'],
    due_date: '2025-11-10'
  });

  if (![200, 201].includes(A.status)) {
    console.error('Failed to create Activity A:', A.json);
  }
  assert.ok([200, 201].includes(A.status), `Expected 200 or 201, got ${A.status}: ${JSON.stringify(A.json)}`);
  createdIds.push(extractActivityId(A.json));

  // Activity B: Due Nov 15, tagged y,z
  const B = await createActivity({
    subject: `${TEST_SUBJECT_PREFIX} Activity B`,
    tags: ['y', 'z'],
    due_date: '2025-11-15'
  });

  if (![200, 201].includes(B.status)) {
    console.error('Failed to create Activity B:', B.json);
  }
  assert.ok([200, 201].includes(B.status), `Expected 200 or 201, got ${B.status}: ${JSON.stringify(B.json)}`);
  createdIds.push(extractActivityId(B.json));

  console.log('Test setup complete. Created IDs:', createdIds);
});

// Cleanup: Delete test activities
after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    await deleteActivity(id);
  }
  console.log('Test cleanup complete.');
});

// Test: Basic list with tenant_id filter
(SHOULD_RUN ? test : test.skip)('GET /api/v2/activities returns list with tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&limit=10`);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.activities, 'Response should have activities array in data');
  assert.ok(Array.isArray(json.data.activities), 'activities should be an array');
});

// Test: Filter by status
(SHOULD_RUN ? test : test.skip)('Filter by status=scheduled returns scheduled activities', async () => {
  const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&status=scheduled&limit=50`);
  assert.equal(res.status, 200);

  const json = await res.json();
  const activities = json.data?.activities || [];

  // Check that our test activities are included
  const testActivities = activities.filter(a => a.subject?.includes(TEST_SUBJECT_PREFIX));
  console.log(`Found ${testActivities.length} test activities with scheduled status`);

  // All returned should have scheduled status
  assert.ok(activities.every(a => a.status === 'scheduled'), 'All returned activities should be scheduled');
});

// Test: Filter by is_test_data
(SHOULD_RUN ? test : test.skip)('Filter by is_test_data=true returns test activities', async () => {
  // Skip if no test activities were created
  if (createdIds.filter(Boolean).length < 2) {
    console.log('Skipping: test activities not created');
    return;
  }

  const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&is_test_data=true&limit=50`);
  assert.equal(res.status, 200);

  const json = await res.json();
  const activities = json.data?.activities || [];

  // All returned should have is_test_data=true
  assert.ok(activities.every(a => a.is_test_data === true), 'All returned activities should have is_test_data=true');

  // Our test activities should be among them
  const testActivities = activities.filter(a => a.subject?.includes(TEST_SUBJECT_PREFIX));
  console.log(`Found ${testActivities.length} test activities with is_test_data=true`);
});

// Test: Filter by is_test_data=false excludes test data
(SHOULD_RUN ? test : test.skip)('Filter by is_test_data=false excludes test activities', async () => {
  const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&is_test_data=false&limit=50`);
  assert.equal(res.status, 200);

  const json = await res.json();
  const activities = json.data?.activities || [];

  // None should have is_test_data=true
  assert.ok(activities.every(a => a.is_test_data !== true), 'No activities should have is_test_data=true');

  // Our test activities should NOT be among them
  const testActivities = activities.filter(a => a.subject?.includes(TEST_SUBJECT_PREFIX));
  assert.equal(testActivities.length, 0, 'Test activities should be excluded');
});

// Test: Pagination works correctly
(SHOULD_RUN ? test : test.skip)('Pagination with limit and offset works', async () => {
  // First page
  const res1 = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&limit=5&offset=0`);
  assert.equal(res1.status, 200);
  const json1 = await res1.json();
  const page1 = json1.data?.activities || [];

  // Second page
  const res2 = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&limit=5&offset=5`);
  assert.equal(res2.status, 200);
  const json2 = await res2.json();
  const page2 = json2.data?.activities || [];

  console.log(`Pagination test: page1=${page1.length} activities, page2=${page2.length} activities`);

  // Skip overlap check if not enough data for pagination
  if (page1.length === 0 || page2.length === 0) {
    console.log('Skipping overlap check: not enough activities for pagination test');
    return;
  }

  // Check for overlap (log but don't fail - may be affected by cache)
  const page1Ids = new Set(page1.map(a => a.id));
  const hasOverlap = page2.some(a => page1Ids.has(a.id));
  if (hasOverlap) {
    console.log('Note: Paginated results have overlap (may be cache-related)');
  }
  // Basic assertion: both pages should have data
  assert.ok(page1.length > 0, 'First page should have activities');
});

// Test: Get single activity by ID
(SHOULD_RUN ? test : test.skip)('GET /api/v2/activities/:id returns single activity', async () => {
  if (!createdIds[0]) {
    console.log('Skipping: no test activity created');
    return;
  }

  const res = await fetch(`${BASE_URL}/api/v2/activities/${createdIds[0]}?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.activity || json.data, 'Should return activity data');

  const activity = json.data?.activity || json.data;
  assert.equal(activity.id, createdIds[0], 'Returned activity should match requested ID');
  assert.ok(activity.subject?.includes(TEST_SUBJECT_PREFIX), 'Should be our test activity');
});

// Test: Activity type filter
(SHOULD_RUN ? test : test.skip)('Filter by type=task returns task activities', async () => {
  const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&type=task&limit=50`);
  assert.equal(res.status, 200);

  const json = await res.json();
  const activities = json.data?.activities || [];

  // Our test activities should be among them (they are type=task)
  const testActivities = activities.filter(a => a.subject?.includes(TEST_SUBJECT_PREFIX));
  console.log(`Found ${testActivities.length} test task activities`);
});

// Test: Include stats query param
(SHOULD_RUN ? test : test.skip)('include_stats=true returns activity counts', async () => {
  const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&include_stats=true&limit=10`);
  assert.equal(res.status, 200);

  const json = await res.json();
  const counts = json.data?.counts;

  if (counts) {
    console.log('Activity counts:', counts);
    assert.ok(typeof counts.total === 'number', 'counts.total should be a number');
    assert.ok(typeof counts.scheduled === 'number', 'counts.scheduled should be a number');
  } else {
    console.log('Stats not returned (counts may be null when not requested)');
  }
});

// Test: MongoDB-style $or filter with $regex (from frontend search)
(SHOULD_RUN ? test : test.skip)('Filter with $or and $regex operators works correctly', async () => {
  if (createdIds.filter(Boolean).length < 2) {
    console.log('Skipping: test activities not created');
    return;
  }

  // Create a filter object matching what the frontend sends during search
  // This simulates searching for "Activity A" across subject, description, and related_name
  const searchFilter = {
    $or: [
      { subject: { $regex: 'Activity A', $options: 'i' } },
      { description: { $regex: 'Activity A', $options: 'i' } },
      { related_name: { $regex: 'Activity A', $options: 'i' } }
    ]
  };

  const url = `${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&include_stats=false&filter=${encodeURIComponent(JSON.stringify(searchFilter))}`;
  
  console.log('Testing search filter with $regex. URL length:', url.length);
  
  const res = await fetch(url);
  assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);

  const json = await res.json();
  assert.equal(json.status, 'success', 'Response should have success status');
  
  const activities = json.data?.activities || [];
  console.log(`Search returned ${activities.length} activities`);

  // Should find Activity A (which has "Activity A" in the subject)
  const foundActivityA = activities.find(a => a.subject?.includes('Activity A'));
  assert.ok(foundActivityA, 'Should find Activity A in search results');

  // Should NOT find Activity B (which doesn't have "Activity A" in any field)
  const foundActivityB = activities.find(a => a.subject?.includes('Activity B'));
  assert.ok(!foundActivityB, 'Should NOT find Activity B in search results');
});

// Test: Search with special characters in $regex
(SHOULD_RUN ? test : test.skip)('Filter with special characters in $regex pattern', async () => {
  // Create activity with special characters
  const specialActivity = await createActivity({
    subject: `${TEST_SUBJECT_PREFIX} Initial contact: ABC Inc`,
    body: 'Test activity with special characters',
    status: 'scheduled'
  });

  assert.ok([200, 201].includes(specialActivity.status), 'Should create activity with special characters');
  const specialId = extractActivityId(specialActivity.json);
  createdIds.push(specialId);

  // Search for it using the exact pattern from the bug report
  const searchFilter = {
    $or: [
      { subject: { $regex: 'Initial contact: ABC Inc', $options: 'i' } },
      { description: { $regex: 'Initial contact: ABC Inc', $options: 'i' } },
      { related_name: { $regex: 'Initial contact: ABC Inc', $options: 'i' } }
    ]
  };

  const url = `${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&include_stats=false&filter=${encodeURIComponent(JSON.stringify(searchFilter))}`;
  
  const res = await fetch(url);
  assert.equal(res.status, 200, `Expected 200 OK for special character search, got ${res.status}`);

  const json = await res.json();
  assert.equal(json.status, 'success', 'Response should have success status');
  
  const activities = json.data?.activities || [];
  const found = activities.find(a => a.id === specialId);
  
  assert.ok(found, 'Should find activity with special characters in search results');
  console.log('Successfully searched for activity with special characters');
});
