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

const migrationsDir = path.resolve(__dirname, '..', 'migrations');
if (!fs.existsSync(migrationsDir)) {
  console.error('Migrations directory not found:', migrationsDir);
  process.exit(1);
}

// Get all .sql files in migrations directory, sorted
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('No migration files found in', migrationsDir);
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

async function run() {
  const client = await pool.connect();
  try {
    console.log(`Found ${migrationFiles.length} migration file(s)`);
    
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`Applying migration: ${file}...`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`  ✓ ${file} applied successfully`);
    }
    
    console.log('\n✓ All migrations completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message || err);
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
