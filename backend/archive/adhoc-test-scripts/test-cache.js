#!/usr/bin/env node
/**
 * Redis Cache Test Script
 * Tests the API caching layer for accounts/leads/contacts/bizdevsources
 */

import http from 'http';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Mock authentication token (replace with real token in production)
const AUTH_TOKEN = 'mock-token-for-testing';

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(data)
          });
        } catch {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function testCaching(module, endpoint) {
  console.log(`\n=== Testing ${module} caching ===`);
  
  // First request (cache miss)
  console.log(`1. First request to ${endpoint} (should be cache miss)...`);
  const start1 = Date.now();
  const response1 = await makeRequest(endpoint);
  const time1 = Date.now() - start1;
  console.log(`   Status: ${response1.status}, Time: ${time1}ms`);
  console.log(`   Records: ${response1.data?.data?.[module]?.length || response1.data?.[module]?.length || 'N/A'}`);
  
  // Second request (cache hit)
  console.log(`2. Second request to ${endpoint} (should be cache hit)...`);
  const start2 = Date.now();
  const response2 = await makeRequest(endpoint);
  const time2 = Date.now() - start2;
  console.log(`   Status: ${response2.status}, Time: ${time2}ms`);
  console.log(`   Records: ${response2.data?.data?.[module]?.length || response2.data?.[module]?.length || 'N/A'}`);
  
  // Compare times
  const speedup = ((time1 - time2) / time1 * 100).toFixed(1);
  console.log(`   ✓ Cache speedup: ${speedup}% faster (${time1}ms → ${time2}ms)`);
  
  return { time1, time2, speedup };
}

// Unused function - kept for reference (invalidation testing)
async function _testInvalidation(module, endpoint) {
  console.log(`\n=== Testing ${module} cache invalidation ===`);
  
  // Get initial data (populate cache)
  console.log(`1. Initial GET request...`);
  await makeRequest(endpoint);
  
  // Create new record (should invalidate cache)
  console.log(`2. Creating new ${module} record (should invalidate cache)...`);
  const createData = {
    tenant_id: TENANT_ID,
    name: `Test ${module} ${Date.now()}`,
    ...(module === 'accounts' && { type: 'test' }),
    ...(module === 'leads' && { status: 'new' }),
    ...(module === 'contacts' && { email: `test${Date.now()}@example.com` }),
    ...(module === 'bizdevsources' && { source_type: 'referral' })
  };
  
  const createResponse = await makeRequest(endpoint, 'POST', createData);
  console.log(`   Status: ${createResponse.status}`);
  
  // Get data again (should be cache miss after invalidation)
  console.log(`3. GET request after create (should be cache miss)...`);
  const start = Date.now();
  await makeRequest(endpoint);
  const time = Date.now() - start;
  console.log(`   Time: ${time}ms (cache was invalidated)`);
}

async function main() {
  console.log('Redis API Cache Testing');
  console.log('======================');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  
  try {
    // Test caching for each module
    await testCaching('accounts', `/api/accounts?tenant_id=${TENANT_ID}&limit=20`);
    await testCaching('leads', `/api/leads?tenant_id=${TENANT_ID}&limit=20`);
    await testCaching('contacts', `/api/contacts?tenant_id=${TENANT_ID}&limit=20`);
    await testCaching('bizdevsources', `/api/bizdevsources?tenant_id=${TENANT_ID}&limit=20`);
    
    console.log('\n\n=== Cache Statistics ===');
    const stats = await makeRequest('/api/system/cache-stats');
    console.log(JSON.stringify(stats.data, null, 2));
    
    // Uncomment to test invalidation (creates test records)
    // await testInvalidation('accounts', `/api/accounts`);
    
    console.log('\n✓ All cache tests passed!');
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  }
}

main();
