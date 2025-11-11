/**
 * Run performance_logs optimized indexes
 * Usage: from backend directory: node run-perf-indexes.js
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Resolve paths relative to this script's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env
dotenv.config({ path: path.join(__dirname, '.env') });
// Fallback: also try root .env if not loaded
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

async function run() {
  console.log('🚀 Applying performance_logs optimized indexes...\n');

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env');
    process.exit(1);
  }

  console.log('📊 Database:', DATABASE_URL.replace(/:([^@]+)@/, ':****@'));

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful');

  const sqlPath = path.join(__dirname, 'scripts', 'add_performance_log_indexes.sql');
  const sql = readFileSync(sqlPath, 'utf8');
    console.log(`📄 Loaded index script: ${sqlPath}`);

    console.log('⚙️  Executing index creation (idempotent)...');
    const t0 = Date.now();
    await pool.query(sql);
    const dt = Date.now() - t0;
    console.log(`✅ Index script applied in ${dt} ms`);

    // Show created/ensured indexes on performance_logs
    const idx = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'performance_logs'
      ORDER BY indexname
    `);
    console.log(`\n✅ performance_logs indexes (${idx.rows.length}):`);
    idx.rows.forEach(r => console.log(` - ${r.indexname}`));

  } catch (err) {
    console.error('❌ Failed to apply indexes:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔚 Database connection closed');
  }
}

run();
