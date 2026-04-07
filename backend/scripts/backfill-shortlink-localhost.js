/**
 * Idempotent backfill: rewrite any aisha_booking_shortlinks rows whose
 * destination_url starts with a localhost origin to the canonical public
 * scheduler URL.
 *
 * Usage (from repo root):
 *   doppler run -- node backend/scripts/backfill-shortlink-localhost.js
 *
 * Or with a direct connection string:
 *   CALCOM_DB_URL=postgresql://calcom:calcom_local@calcom-db:5432/calcom \
 *   PUBLIC_SCHEDULER_URL=https://scheduler.aishacrm.com \
 *   node backend/scripts/backfill-shortlink-localhost.js
 *
 * Safe to run multiple times — rows that already have a production URL are
 * left untouched.  Expired rows are not explicitly removed (they will be
 * pruned by normal TTL).
 *
 * Exit codes:
 *   0 — success (0 or more rows updated)
 *   1 — configuration error or database failure
 */

 
import pg from 'pg';
import { URL } from 'node:url';

const TABLE = 'aisha_booking_shortlinks';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const calcomDbUrl =
  process.env.CALCOM_DB_URL ||
  process.env.CALCOM_DATABASE_URL ||
  'postgresql://calcom:calcom_local@calcom-db:5432/calcom';

const publicSchedulerUrl =
  process.env.PUBLIC_SCHEDULER_URL || process.env.VITE_CALCOM_URL || process.env.CALCOM_PUBLIC_URL;

if (!publicSchedulerUrl || !/^https:\/\/.+/.test(publicSchedulerUrl)) {
  console.error(
    '[backfill] PUBLIC_SCHEDULER_URL (or VITE_CALCOM_URL/CALCOM_PUBLIC_URL) must be a valid ' +
      'https:// URL. Set it and re-run.',
  );
  process.exit(1);
}

let schedulerOrigin;
try {
  schedulerOrigin = new URL(publicSchedulerUrl).origin;
} catch {
  console.error('[backfill] Could not parse PUBLIC_SCHEDULER_URL:', publicSchedulerUrl);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: calcomDbUrl, ssl: false, max: 2 });

async function rewriteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null; // malformed — skip
  }

  // Strip brackets from IPv6 host ('::1' vs '[::1]')
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  if (!LOCAL_HOSTS.has(host)) return null; // not localhost — nothing to do

  const schedulerParsed = new URL(schedulerOrigin);
  parsed.protocol = schedulerParsed.protocol;
  parsed.hostname = schedulerParsed.hostname;
  parsed.port = schedulerParsed.port;

  return parsed.toString();
}

async function run() {
  let updated = 0;
  let skipped = 0;

  console.log(`[backfill] Connecting to: ${calcomDbUrl.replace(/\/\/.+@/, '//***@')}`);
  console.log(`[backfill] Rewriting localhost origins → ${schedulerOrigin}`);

  const { rows } = await pool.query(
    `SELECT token, destination_url FROM ${TABLE}
      WHERE destination_url LIKE 'http://localhost%'
         OR destination_url LIKE 'http://127.0.0.1%'
         OR destination_url LIKE 'http://[::1]%'
         OR destination_url LIKE 'http://::1%'`,
  );

  console.log(`[backfill] Found ${rows.length} candidate row(s)`);

  for (const row of rows) {
    const newUrl = await rewriteUrl(row.destination_url);
    if (!newUrl) {
      console.warn(`[backfill] Could not rewrite token=${row.token} url=${row.destination_url}`);
      skipped++;
      continue;
    }

    if (newUrl === row.destination_url) {
      skipped++;
      continue;
    }

    await pool.query(`UPDATE ${TABLE} SET destination_url = $1 WHERE token = $2`, [
      newUrl,
      row.token,
    ]);
    console.log(`[backfill] Updated token=${row.token}: ${row.destination_url} → ${newUrl}`);
    updated++;
  }

  console.log(`[backfill] Done. Updated: ${updated}, Skipped: ${skipped}`);
}

run()
  .catch((err) => {
    console.error('[backfill] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end().catch(() => {}));
