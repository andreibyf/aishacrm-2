import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  try {
    console.log('Running migration: 010_add_account_revenue.sql\n');
    
    const migrationPath = join(__dirname, 'migrations', '010_add_account_revenue.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    
    await pgPool.query(sql);
    
    console.log('✓ Migration completed successfully!');
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error running migration:', error);
    await pgPool.end();
    process.exit(1);
  }
}

runMigration();
