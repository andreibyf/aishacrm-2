import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from backend/.env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

const sqlFile = path.resolve(__dirname, '..', 'migrations', '001_init.sql');
if (!fs.existsSync(sqlFile)) {
  console.error('Migration file not found:', sqlFile);
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

async function run() {
  const client = await pool.connect();
  try {
    console.log('Applying migrations from', sqlFile);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migrations applied successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    try {
      await client.query('ROLLBACK');
    } catch (_err) {
      // swallow rollback error but log lightly
      console.warn('Rollback failed:', _err && _err.message ? _err.message : _err);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
