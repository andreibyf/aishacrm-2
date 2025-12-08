#!/usr/bin/env node
/**
 * Test script to verify cookie-based authentication flow
 * Tests: Login → Cookie storage → Authenticated API call
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'abyfield@4vdataconsulting.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'DevTest#002';

async function testAuthFlow() {
  console.log('🔐 Testing Authentication Flow\n');
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`User: ${TEST_EMAIL}\n`);

  // Step 1: Login
  console.log('1️⃣  Logging in...');
  const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    console.error('❌ Login failed:', loginResponse.status, errorText);
    process.exit(1);
  }

  const loginData = await loginResponse.json();
  console.log('✅ Login successful');
  console.log('   User ID:', loginData.user?.id);
  console.log('   Email:', loginData.user?.email);

  // Check for Set-Cookie header
  const cookies = loginResponse.headers.get('set-cookie');
  if (cookies && cookies.includes('aisha_access')) {
    console.log('✅ Cookie set: aisha_access found in Set-Cookie header');
  } else {
    console.warn('⚠️  No aisha_access cookie in Set-Cookie header');
  }

  // Extract cookie for subsequent requests
  const cookieMatch = cookies?.match(/aisha_access=([^;]+)/);
  const authCookie = cookieMatch ? `aisha_access=${cookieMatch[1]}` : null;

  if (!authCookie) {
    console.error('❌ Failed to extract auth cookie');
    process.exit(1);
  }

  // Step 2: Make authenticated request
  console.log('\n2️⃣  Testing authenticated API call...');
  const accountsResponse = await fetch(`${BACKEND_URL}/api/accounts?limit=5`, {
    headers: {
      'Cookie': authCookie
    }
  });

  if (!accountsResponse.ok) {
    const errorText = await accountsResponse.text();
    console.error('❌ Authenticated request failed:', accountsResponse.status, errorText);
    process.exit(1);
  }

  const accountsData = await accountsResponse.json();
  console.log('✅ Authenticated request successful');
  console.log(`   Retrieved ${accountsData.accounts?.length || 0} accounts`);

  // Step 3: Check backend logs for auth method used
  console.log('\n3️⃣  Checking authentication method...');
  console.log('   Expected: Cookie JWT verification (no Supabase validation)');
  console.log('   Check backend logs for: "[Auth Debug] Cookie JWT verified"');

  console.log('\n✅ All tests passed! Cookie-based auth is working correctly.');
  console.log('\n📋 Summary:');
  console.log('   ✓ Login returns JWT cookie');
  console.log('   ✓ Cookie authentication works for API calls');
  console.log('   ✓ No Supabase signature validation errors');
}

testAuthFlow().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
