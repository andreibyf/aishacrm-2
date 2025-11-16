/**
 * Apply a single SQL file to the configured DATABASE_URL
 * Usage: node apply-single-sql.js ./migrations/075_agent_memory_archive.sql
 */
import fs from 'fs';
import path from 'path';
import pkg from 'pg';

const { Client } = pkg;

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node apply-single-sql.js <path-to-sql>');
    process.exit(1);
  }
  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`SQL file not found: ${filePath}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(filePath, 'utf8');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required in environment');
    process.exit(1);
  }

  let client;
  try {
    client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log(`✓ Connected. Applying ${path.basename(filePath)} ...`);
    await client.query(sql);
    console.log('✓ SQL applied successfully');
  } catch (err) {
    console.error('❌ Failed to apply SQL:', err.message || String(err));
    process.exit(1);
  } finally {
    try { await client?.end(); } catch {}
  }
}

main();
