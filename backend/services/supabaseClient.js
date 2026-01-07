/**
 * Supabase Client Service
 * Re-exports the Supabase client from the centralized supabase-db module
 * This file exists to maintain backward compatibility with routes that import from services/
 */

import { getSupabaseClient } from '../lib/supabase-db.js';

// Export the Supabase client instance
export const supabase = getSupabaseClient();

// Also export the getter function for flexibility
export { getSupabaseClient };
