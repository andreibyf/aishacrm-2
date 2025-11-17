#!/usr/bin/env node
/**
 * Create unit-test-tenant in the database
 * Run with: node create-test-tenant.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load backend environment variables
dotenv.config({ path: join(__dirname, 'backend', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestTenant() {
  const TEST_TENANT_ID = 'unit-test-tenant';
  
  console.log('🔍 Checking if unit-test-tenant exists...');
  
  // Check if tenant already exists
  const { data: existing } = await supabase
    .from('tenant')
    .select('tenant_id, name')
    .eq('tenant_id', TEST_TENANT_ID)
    .single();
  
  if (existing) {
    console.log('✅ unit-test-tenant already exists:', existing);
    return;
  }
  
  console.log('📝 Creating unit-test-tenant...');
  
  // Create the test tenant
  const { data, error } = await supabase
    .from('tenant')
    .insert({
      tenant_id: TEST_TENANT_ID,
      name: 'Unit Test Tenant',
      slug: 'unit-test-tenant',
      status: 'active',
      domain: 'unit-test.local'
    })
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error creating tenant:', error);
    process.exit(1);
  }
  
  console.log('✅ Successfully created unit-test-tenant:', data);
}

createTestTenant().catch(console.error);
