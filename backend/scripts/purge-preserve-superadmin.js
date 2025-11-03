#!/usr/bin/env node
/**
 * Purge ALL application data while preserving a single Superadmin user
 *
 * - Keeps ONLY the users row with the specified email
 * - Truncates all other public tables with CASCADE
 * - Safe to run against the local Docker Postgres (localhost:5432)
 *
 * Usage:
 *   node backend/scripts/purge-preserve-superadmin.js --email="abyfield@4bdataconsulting.com"
 *
 * Environment:
 *   DATABASE_URL (optional) - defaults to postgresql://postgres:postgres@localhost:5432/aishacrm
 */

import pkg from 'pg';

const { Pool } = pkg;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a === '--yes' || a === '-y') out.yes = true;
  }
  return out;
}

async function main() {
  const { email, yes } = parseArgs();
  if (!email) {
    console.error('\nERROR: --email is required (the superadmin to keep)');
    process.exit(1);
  }

  const connStr = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aishacrm';
  const pool = new Pool({ connectionString: connStr });

  console.log('\n⚠ Purging ALL data except user:', email);

  if (!yes) {
    process.stdout.write('\nType EXACTLY "DELETE ALL EXCEPT ME" to confirm: ');
    await new Promise((resolve) => {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', (d) => {
        const v = String(d || '').trim();
        if (v !== 'DELETE ALL EXCEPT ME') {
          console.log('Cancelled.');
          process.exit(0);
        }
        resolve();
      });
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure the superadmin row exists before we purge anything
    const sup = await client.query('SELECT id, email FROM users WHERE lower(email) = lower($1)', [email]);
    if (sup.rowCount === 0) {
      throw new Error(`Superadmin user not found in users table: ${email}`);
    }
    const keepId = sup.rows[0].id;

    // Collect all public tables except users
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('users')
      ORDER BY table_name
    `);

    const tableNames = tables.map((t) => '"' + t.table_name + '"');
    if (tableNames.length) {
      const sql = `TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`;
      console.log('\n→ Truncating tables (except users)...');
      await client.query(sql);
    } else {
      console.log('\n(i) No tables to truncate (except users).');
    }

    // Delete all users except the superadmin email
    const delRes = await client.query('DELETE FROM users WHERE id <> $1 RETURNING id, email', [keepId]);
    console.log(`→ Deleted ${delRes.rowCount} other user(s)`);

    await client.query('COMMIT');
    console.log('\n✅ Purge complete. Only the specified superadmin remains.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Purge failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
