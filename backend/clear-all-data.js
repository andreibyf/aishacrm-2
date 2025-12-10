#!/usr/bin/env node
/**
 * Clear all customer data from entity tables
 * Run with: node clear-all-data.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllData() {
  // Order matters - delete dependent tables first
  const tables = [
    'activities',
    'opportunities', 
    'contacts',
    'leads',
    'accounts'
  ];
  
  console.log('Clearing all customer data...\n');
  
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select('id');
      
      if (error) {
        console.log(`${table}: ERROR - ${error.message}`);
      } else {
        const deletedCount = data ? data.length : 0;
        console.log(`${table}: deleted ${deletedCount} records`);
      }
    } catch (e) {
      console.log(`${table}: EXCEPTION - ${e.message}`);
    }
  }
  
  console.log('\nDone!');
}

clearAllData();
