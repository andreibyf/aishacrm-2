/**
 * Create Superadmin User in Supabase Database
 * Ensures the user exists in public.users table to match auth.users
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load backend env
dotenv.config({ path: join(__dirname, 'backend', '.env') });

const { Pool } = pg;

// Supabase connection
const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: parseInt(process.env.SUPABASE_DB_PORT || '6543'),
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const SUPERADMIN_EMAIL = 'abyfield@4vdataconsulting.com';
const FIRST_NAME = 'Andrei';
const LAST_NAME = 'Byfield';

async function createSuperadmin() {
  try {
    console.log('🔍 Checking if user exists...');
    
    const existing = await pool.query(
      'SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)',
      [SUPERADMIN_EMAIL]
    );

    if (existing.rows.length > 0) {
      console.log('✅ User already exists:', existing.rows[0]);
      return;
    }

    console.log('➕ Creating superadmin user in public.users...');
    
    const result = await pool.query(
      `INSERT INTO users (
        email, 
        first_name, 
        last_name, 
        role, 
        metadata,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, email, first_name, last_name, role`,
      [
        SUPERADMIN_EMAIL,
        FIRST_NAME,
        LAST_NAME,
        'superadmin',
        JSON.stringify({
          first_name: FIRST_NAME,
          last_name: LAST_NAME,
          display_name: `${FIRST_NAME} ${LAST_NAME}`,
          full_name: `${FIRST_NAME} ${LAST_NAME}`
        })
      ]
    );

    console.log('✅ Superadmin created successfully:', result.rows[0]);
    console.log('\n📝 You can now use the app normally!');
    
  } catch (error) {
    console.error('❌ Error creating superadmin:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

createSuperadmin();
