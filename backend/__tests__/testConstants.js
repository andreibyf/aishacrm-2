/**
 * Test constants — valid UUIDs from Dev Playground (tenant b62b764d-4f27-4e20-a8ad-8eb9b2e1055c).
 * Use these in tests instead of fake IDs like 'tenant-123' so DB/RLS and FK checks behave correctly.
 *
 * Override tenant via: TEST_TENANT_ID or STAGING_TENANT_ID
 */

// ─── Tenant ─────────────────────────────────────────────────────────────────

/** Dev Playground tenant; override with process.env.TEST_TENANT_ID */
const DEV_PLAYGROUND_TENANT_ID = 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c';

export const TENANT_ID =
  process.env.TEST_TENANT_ID || process.env.STAGING_TENANT_ID || DEV_PLAYGROUND_TENANT_ID;

/** Valid UUID for a different tenant (for cross-tenant / wrong-tenant tests). */
export const OTHER_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// ─── Users / Employees (Dev Playground) ─────────────────────────────────────

/** Admin user (Andre) — 04d1b289-... */
export const ADMIN_USER_ANDRE = '04d1b289-0000-0000-0000-000000000001';

/** Director — Sarah */
export const EMP_SARAH = 'aa000001-0000-0000-0000-000000000001';
/** Managers — Mike, Jane */
export const EMP_MIKE = 'aa000001-0000-0000-0000-000000000002';
export const EMP_JANE = 'aa000001-0000-0000-0000-000000000003';
/** Employees — Tom, Amy, Bob */
export const EMP_TOM = 'aa000001-0000-0000-0000-000000000004';
export const EMP_AMY = 'aa000001-0000-0000-0000-000000000005';
export const EMP_BOB = 'aa000001-0000-0000-0000-000000000006';

export const EMPLOYEE_IDS = {
  sarah: EMP_SARAH,
  mike: EMP_MIKE,
  jane: EMP_JANE,
  tom: EMP_TOM,
  amy: EMP_AMY,
  bob: EMP_BOB,
};

// ─── Teams (Dev Playground) ─────────────────────────────────────────────────

/** Team One */
export const TEAM_ONE_ID = 'bb000001-0000-0000-0000-000000000001';
/** Team Two */
export const TEAM_TWO_ID = 'bb000001-0000-0000-0000-000000000002';

export const TEAM_IDS = {
  teamOne: TEAM_ONE_ID,
  teamTwo: TEAM_TWO_ID,
};

// ─── Sentinels for “not found” tests ────────────────────────────────────────

/** Use in GET/PUT/DELETE by id when expecting 404. Valid UUID format, not present in DB. */
export const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/** Alias for NONEXISTENT_ID where tests use “fakeId” for 404 checks. */
export const FAKE_ID = NONEXISTENT_ID;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Namespace for test-generated UUIDs so they don't collide with real Dev Playground data. */
const TEST_UUID_PREFIX = 'cc000001-0000-0000-0000-';

let _testUuidCounter = 0;

/**
 * Generate a consistent, unique UUID for test-created entities (leads, contacts, etc.).
 * Uses a fixed prefix + incrementing hex suffix so IDs are valid UUIDs and deterministic per run.
 *
 * @param {string} [entity] - Optional entity hint (e.g. 'lead', 'contact') for readability in logs.
 * @returns {string} Valid UUID string (8-4-4-4-12 hex)
 *
 * @example
 *   const leadId = generateTestUUID('lead');
 *   const contactId = generateTestUUID('contact');
 */
export function generateTestUUID(entity = '') {
  const n = ++_testUuidCounter;
  const suffix = n.toString(16).padStart(12, '0');
  if (suffix.length > 12) {
    throw new Error('generateTestUUID: counter overflow');
  }
  return `${TEST_UUID_PREFIX}${suffix}`;
}

/**
 * Reset the test UUID counter (e.g. in before() for predictable IDs per describe).
 */
export function resetTestUUIDCounter() {
  _testUuidCounter = 0;
}

export default {
  TENANT_ID,
  DEV_PLAYGROUND_TENANT_ID: DEV_PLAYGROUND_TENANT_ID,
  OTHER_TENANT_ID,
  ADMIN_USER_ANDRE,
  EMP_SARAH,
  EMP_MIKE,
  EMP_JANE,
  EMP_TOM,
  EMP_AMY,
  EMP_BOB,
  EMPLOYEE_IDS,
  TEAM_ONE_ID,
  TEAM_TWO_ID,
  TEAM_IDS,
  NONEXISTENT_ID,
  FAKE_ID,
  generateTestUUID,
  resetTestUUIDCounter,
};
