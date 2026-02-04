/**
 * Debug auth headers for field-parity tests
 */
import { getAuthHeaders } from './__tests__/helpers/auth.js';

const headers = getAuthHeaders();
console.log('Auth headers:', JSON.stringify(headers, null, 2));
console.log('\nEnvironment variables:');
console.log('SUPABASE_SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 'NOT SET');
console.log('SUPABASE_ANON_KEY length:', process.env.SUPABASE_ANON_KEY?.length || 'NOT SET');
console.log('VITE_SUPABASE_ANON_KEY length:', process.env.VITE_SUPABASE_ANON_KEY?.length || 'NOT SET');

// Test if headers have actual values
const hasAuth = headers.Authorization && headers.Authorization !== 'Bearer undefined';
console.log('\nHas valid auth:', hasAuth);
if (!hasAuth) {
  console.warn('\n⚠️  WARNING: Auth headers are empty! Tests will fail with 401.');
}
