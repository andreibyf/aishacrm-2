import fs from 'fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync('migrations/011_enable_rls.sql', 'utf8');
    console.log('SQL length:', sql.length);

    console.log('Applying migration...');
    await client.query('BEGIN');

    // Execute each statement separately for better error reporting
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    console.log(`Found ${statements.length} statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (stmt) {
        console.log(`Executing statement ${i + 1}...`);
        console.log(`SQL: ${stmt.substring(0, 100)}...`);
        await client.query(stmt);
        console.log(`✓ Statement ${i + 1} executed successfully`);
      }
    }

    await client.query('COMMIT');
    console.log('✓ Migration applied successfully');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('Rollback failed:', rollbackErr.message);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();