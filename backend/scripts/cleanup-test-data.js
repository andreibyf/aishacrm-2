import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exit } from 'node:process';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Patterns used by E2E tests for contacts/leads
const CONTACT_PATTERNS = [
  "contact-%@example.com",
  "tag-test-%@example.com",
];

const LEAD_PATTERNS = [
  "lead-%@example.com",
];

async function hasColumn(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table.replace('public.', ''), column]
  );
  return rows.length > 0;
}

// Whitelist identifiers to avoid SQL injection via template identifiers
const ALLOWED_TABLES = new Set(['public.contacts', 'public.leads']);
const ALLOWED_COLUMNS = new Set(['email']);

async function cleanupTable(table, column, patterns, tenantId) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Disallowed table identifier: ${table}`);
  }
  if (!ALLOWED_COLUMNS.has(column)) {
    throw new Error(`Disallowed column identifier: ${column}`);
  }
  const likeClauses = patterns.map((p, i) => `${column} LIKE $${i + 2}`).join(' OR ');
  // No-op replacements can hide issues; pass patterns directly
  const params = [tenantId, ...patterns];

  // Count matches
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE tenant_id = $1 AND (${likeClauses})`,
    params
  );
  const count = countRows[0]?.count ?? 0;
  if (count === 0) {
    console.log(`✅ No test data found in ${table}.`);
    return 0;
  }

  console.log(`🧹 Deleting ${count} records from ${table} matching test patterns...`);
  const { rowCount } = await pool.query(
    `DELETE FROM ${table} WHERE tenant_id = $1 AND (${likeClauses})`,
    params
  );
  console.log(`✅ Deleted ${rowCount} ${table} records.`);
  return rowCount;
}

async function removeTestTagsFromContacts(tenantId) {
  if (!(await hasColumn('public.contacts', 'tags'))) {
    console.log('ℹ️  contacts.tags column not found — skipping tag scrubbing.');
    return;
  }
  // If tags are stored as JSONB arrays in contacts.tags, scrub common test tag values
  // only for rows that match known test email patterns within the tenant.
  const TEST_TAGS = ['test', 'e2e', 'playwright', 'demo'];
  console.log('🧽 Scrubbing common test tags from contacts.tags...');

  // Build an OR clause for email patterns
  const emailClauses = CONTACT_PATTERNS.map((_, idx) => `email LIKE $${idx + 3}`).join(' OR ');
  const statements = TEST_TAGS.map((tag) => ({
    sql: `
      UPDATE public.contacts
      SET tags = (
        SELECT COALESCE(jsonb_agg(val) FILTER (WHERE val IS NOT NULL), '[]'::jsonb)
        FROM jsonb_array_elements_text(tags) AS val
        WHERE val <> $1
      )
      WHERE tenant_id = $2 AND jsonb_typeof(tags) = 'array' AND tags ? $1 AND (${emailClauses})
    `,
    params: [tag, tenantId, ...CONTACT_PATTERNS],
  }));

  let total = 0;
  for (const { sql, params } of statements) {
    const res = await pool.query(sql, params);
    total += res.rowCount || 0;
  }
  console.log(`✅ Scrubbed tags on ${total} contact rows (some rows may be updated multiple times).`);
}

async function main() {
  try {
    console.log('🔧 Test data cleanup starting...');

    // Resolve tenant scope
    let tenantId = process.env.STAGING_TENANT_ID;
    const tenantSlug = process.env.STAGING_TENANT_SLUG;
    if (!tenantId && tenantSlug) {
      const { rows } = await pool.query(
        'SELECT id FROM public.tenants WHERE slug = $1 LIMIT 1',
        [tenantSlug]
      );
      tenantId = rows[0]?.id;
    }
    if (!tenantId) {
      console.error('❌ Missing STAGING_TENANT_ID (or set STAGING_TENANT_SLUG to resolve it). Aborting to protect other tenants.');
      await pool.end();
      exit(1);
    }
    console.log(`🏷️  Limiting cleanup to tenant_id: ${tenantId}`);

    // 1) Preferentially delete records explicitly marked as test data (if column exists)
    let delContactsFlag = 0;
    let delLeadsFlag = 0;
    if (await hasColumn('public.contacts', 'is_test_data')) {
      const resC = await pool.query(
        'DELETE FROM public.contacts WHERE tenant_id = $1 AND is_test_data = true',
        [tenantId]
      );
      delContactsFlag = resC.rowCount || 0;
    } else {
      console.log('ℹ️  contacts.is_test_data column not found — skipping flagged contact deletion.');
    }
    if (await hasColumn('public.leads', 'is_test_data')) {
      const resL = await pool.query(
        'DELETE FROM public.leads WHERE tenant_id = $1 AND is_test_data = true',
        [tenantId]
      );
      delLeadsFlag = resL.rowCount || 0;
    } else {
      console.log('ℹ️  leads.is_test_data column not found — skipping flagged lead deletion.');
    }
    console.log(`🧹 Deleted contacts by is_test_data flag: ${delContactsFlag}`);
    console.log(`🧹 Deleted leads by is_test_data flag: ${delLeadsFlag}`);

    // 2) Fallback: delete by known email patterns (in case older test data lacks the flag)
    const deletedContacts = await cleanupTable('public.contacts', 'email', CONTACT_PATTERNS, tenantId);
    const deletedLeads = await cleanupTable('public.leads', 'email', LEAD_PATTERNS, tenantId);

    // 3) Scrub test tags only on test-marked contacts
    await removeTestTagsFromContacts(tenantId);
    console.log(`\n🎉 Cleanup complete. Deleted contacts: ${deletedContacts}, deleted leads: ${deletedLeads}.`);
    await pool.end();
    exit(0);
  } catch (err) {
    console.error('❌ Cleanup failed:', err);
    await pool.end();
    exit(1);
  }
}

main();
