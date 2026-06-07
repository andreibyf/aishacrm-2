/**
 * Test setup helper
 * Initializes Supabase client for tests that need database access
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Load environment variables from common backend/root locations.
// We load every candidate file with override=false so pre-set CI vars are preserved,
// while missing keys can still be sourced from later files (e.g., repo root .env).
const envPaths = [
  join(__dirname, '../.env.local'),
  join(__dirname, '../.env'),
  join(__dirname, '../../.env.local'),
  join(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  config({ path: envPath, override: false });
}

/**
 * Initialize Supabase client for tests
 * Returns true if successful, false if credentials not available
 */
export async function initSupabaseForTests() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[Test Setup] Supabase credentials not found - some tests may be skipped');
    return false;
  }

  try {
    const { initSupabaseDB } = await import('../lib/supabase-db.js');
    initSupabaseDB(url, key);
    return true;
  } catch (error) {
    console.warn('[Test Setup] Failed to initialize Supabase:', error.message);
    return false;
  }
}

/**
 * Check if Supabase is available for testing
 */
export function hasSupabaseCredentials() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && key);
}
