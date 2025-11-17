#!/usr/bin/env node
/**
 * Generic index checker for Supabase Postgres
 * Usage:
 *   npm run db:check:idx -- public.idx_leads_tenant_account
 * Or directly:
 *   node backend/scripts/check-index.js public.idx_name
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Client } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const idxArg = process.argv[2];
if (!idxArg) {
  console.error('Usage: node backend/scripts/check-index.js <schema.index_name>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not found in backend/.env');
  process.exit(1);
}

const redacted = connectionString.replace(/:([^:@]+)@/, ':****@');
console.log(`Connecting to Postgres (Supabase) at ${redacted}`);

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    await client.connect();
    console.log(`Checking index: ${idxArg}`);

    const existsRes = await client.query('SELECT to_regclass($1) AS idx_oid', [idxArg]);
    const idxOid = existsRes.rows?.[0]?.idx_oid || null;
    console.log('Exists:', idxOid ? 'yes' : 'no');

    const ddlRes = await client.query('SELECT pg_get_indexdef(to_regclass($1)) AS definition', [idxArg]);
    const definition = ddlRes.rows?.[0]?.definition || null;
    if (definition) {
      console.log('Definition:');
      console.log(definition);
    } else {
      console.log('Definition: <none>');
    }
  } catch (err) {
    console.error('Check failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
