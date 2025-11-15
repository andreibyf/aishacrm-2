/**
 * Run a single SQL file against the configured Supabase Postgres
 * Usage: node scripts/run-sql.js <path-to-sql>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Client } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env (not .env.local)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const sqlPathArg = process.argv[2];
if (!sqlPathArg) {
  console.error('Usage: node scripts/run-sql.js <path-to-sql>');
  process.exit(1);
}

const sqlPath = path.isAbsolute(sqlPathArg)
  ? sqlPathArg
  : path.join(process.cwd(), sqlPathArg);

if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not found in backend/.env');
  process.exit(1);
}

const redacted = connectionString.replace(/:([^:@]+)@/, ':****@');
console.log(`Connecting to Postgres (Supabase) at ${redacted}`);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await client.connect();
    console.log(`Applying SQL from: ${sqlPath}`);
    const res = await client.query(sql);
    if (res && Array.isArray(res.rows) && res.rows.length > 0) {
      console.log('Query returned rows:');
      console.log(JSON.stringify(res.rows, null, 2));
    } else {
      console.log('SQL applied successfully.');
    }
  } catch (err) {
    console.error('SQL execution failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
