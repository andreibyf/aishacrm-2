#!/usr/bin/env node
// Quick script to test auth environment variables

console.log('=== Auth Environment Check ===');
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('SUPABASE_SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);
console.log('SUPABASE_SERVICE_ROLE_KEY prefix:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20));
console.log('\nSUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
console.log('SUPABASE_ANON_KEY length:', process.env.SUPABASE_ANON_KEY?.length);

// Test helper
import { getAuthHeaders } from './__tests__/helpers/auth.js';
const headers = getAuthHeaders();
console.log('\n=== Auth Headers from Helper ===');
console.log('Authorization:', headers.Authorization?.substring(0, 30) + '...');
console.log('apikey:', headers.apikey?.substring(0, 30) + '...');
console.log('Headers match service role:', headers.apikey === process.env.SUPABASE_SERVICE_ROLE_KEY);
