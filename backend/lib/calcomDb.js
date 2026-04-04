/**
 * calcomDb.js
 *
 * Lazy pg Pool for the local Cal.com PostgreSQL container (calcom-db).
 * The pool is optional - if CALCOM_DB_URL / CALCOM_DATABASE_URL are not set the helper returns null
 * so calcomSyncService can degrade gracefully when Cal.com is not running.
 *
 * Connection string expected:
 *   postgresql://calcom:calcom_local@calcom-db:5432/calcom
 */

import pg from 'pg';

const { Pool } = pg;

let _pool = null;

/**
 * Return the shared pg Pool, creating it on first call.
 * Returns null when neither CALCOM_DB_URL nor CALCOM_DATABASE_URL is configured.
 */
export function getCalcomDb() {
  if (_pool) return _pool;

  const url = process.env.CALCOM_DB_URL || process.env.CALCOM_DATABASE_URL;
  if (!url) return null;

  _pool = new Pool({
    connectionString: url,
    ssl: false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on('error', (err) => {
    // Prevent unhandled rejection crash — calcom-db may not always be running
    console.warn('[calcomDb] Pool error (non-fatal):', err.message);
  });

  return _pool;
}
