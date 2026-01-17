import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace('?sslmode=require', '') : '';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createTasksTable() {
  const client = await pool.connect();
  try {
    console.log('Checking for tasks table...');
    
    // Check if table exists
    const res = await client.query("SELECT to_regclass('public.tasks')");
    if (res.rows[0].to_regclass) {
      console.log('Tasks table already exists.');
      return;
    }

    console.log('Creating tasks table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        entity_type TEXT,
        entity_id UUID,
        assigned_to TEXT,
        result TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Add RLS policies if needed (skipping for now as per "surgical edits" but good practice)
    // For now, we assume the backend has full access.

    console.log('Tasks table created successfully.');
  } catch (err) {
    console.error('Error creating tasks table:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createTasksTable();
