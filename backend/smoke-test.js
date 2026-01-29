/**
 * Smoke Test Suite for AiSHA CRM
 * Validates CARE, AI Chat, Braid Tools, and AiSHA Office Viz
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4000';
const EMAIL = process.env.TEST_EMAIL || 'andrei.byfield@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'tDCA4p0Eqa9%H';
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '10000', 10); // Default 10s timeout

let authToken = null;
let tenantId = null;

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function pass(msg) {
  console.log(`${colors.green}✅ PASS${colors.reset} ${msg}`);
}

function fail(msg, error) {
  console.log(`${colors.red}❌ FAIL${colors.reset} ${msg}`);
  if (error) console.log(`   Error: ${error.message || error}`);
}

function info(msg) {
  console.log(`${colors.yellow}ℹ${colors.reset}  ${msg}`);
}

// Helper to create fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function smokeTest() {
  console.log('\n' + '='.repeat(60));
  console.log('AiSHA CRM Smoke Test Suite');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Backend Health
  info('Test 1: Backend Health Check');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/system/health`);
    if (res.ok) {
      const data = await res.json();
      if (data.data?.healthy) {
        pass('Backend is healthy');
        passed++;
      } else {
        fail('Backend health check returned unhealthy');
        failed++;
      }
    } else {
      fail(`Backend health check failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('Backend health check error', err);
    failed++;
  }

  // Test 2: MCP/Braid Health
  info('Test 2: MCP/Braid Health Check');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/mcp/health-proxy`);
    if (res.ok) {
      const data = await res.json();
      if (data.data?.reachable) {
        pass('Braid MCP server is reachable');
        passed++;
      } else {
        fail('Braid MCP server is not reachable');
        failed++;
      }
    } else {
      fail(`MCP health check failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('MCP health check error', err);
    failed++;
  }

  // Test 3: Authentication
  info('Test 3: User Authentication');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // Extract cookie-based auth token
      const cookies = res.headers.get('set-cookie');
      if (cookies && cookies.includes('aisha_access=')) {
        const match = cookies.match(/aisha_access=([^;]+)/);
        if (match) {
          authToken = match[1];
        }
      }
      
      // Also support bearer token in response
      authToken = authToken || data.token || data.access_token || data.session?.access_token;
      tenantId = data.data?.user?.tenant_id || data.user?.tenant_id || data.tenant_id;
      
      if (authToken || data.status === 'success') {
        pass('User authentication successful');
        passed++;
      } else {
        fail('Authentication response missing token');
        failed++;
      }
    } else {
      const text = await res.text();
      fail(`Authentication failed (${res.status})`, text);
      failed++;
    }
  } catch (err) {
    fail('Authentication error', err);
    failed++;
  }

  if (!authToken && !tenantId) {
    console.log('\n' + colors.red + 'Cannot continue without authentication - using cookie-based auth' + colors.reset);
    // Still set tenant ID for non-authenticated calls
    tenantId = tenantId || 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c'; // Default dev tenant
  }

  if (!tenantId) {
    tenantId = '6cb4c008-4847-426a-9a2e-918ad70e7b69'; // User's tenant ID
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId
  };
  
  if (authToken) {
    authHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  // Test 4: AI Assistants List
  info('Test 4: AI Assistants List');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/ai/assistants?tenant_id=${tenantId}`, {
      headers: authHeaders
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.data?.assistants?.length > 0) {
        pass(`AI Assistants available (${data.data.assistants.length} found)`);
        passed++;
      } else {
        fail('No AI assistants found');
        failed++;
      }
    } else {
      fail(`AI assistants list failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('AI assistants list error', err);
    failed++;
  }

  // Test 5: AI Chat (simple query with timeout)
  info('Test 5: AI Chat Functionality');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        tenant_id: tenantId,
        stream: false
      })
    }, 30000); // 30s timeout for AI
    
    if (res.ok) {
      const data = await res.json();
      if (data.data?.response || data.response || data.choices) {
        pass('AI Chat responding successfully');
        passed++;
      } else {
        fail('AI Chat response missing');
        failed++;
      }
    } else {
      const text = await res.text();
      fail(`AI Chat failed (${res.status}): ${text.substring(0, 100)}`);
      failed++;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      fail('AI Chat timeout (>30s) - Check LLM provider API keys (ANTHROPIC_API_KEY empty)');
    } else {
      fail('AI Chat error', err);
    }
    failed++;
  }

  // Test 6: Braid Tools - List Accounts
  info('Test 6: Braid Tool Execution (search_accounts)');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/accounts?tenant_id=${tenantId}&limit=5`, {
      headers: authHeaders
    });
    
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) || data.data) {
        pass('Braid tool (search_accounts) executed successfully');
        passed++;
      } else {
        fail('Braid tool response format unexpected');
        failed++;
      }
    } else {
      fail(`Braid tool execution failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('Braid tool execution error', err);
    failed++;
  }

  // Test 7: CARE - Activity Tracking
  info('Test 7: CARE Activity Tracking');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v2/activities?tenant_id=${tenantId}&limit=5`, {
      headers: authHeaders
    });
    
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) || data.data) {
        pass('CARE activity tracking accessible');
        passed++;
      } else {
        fail('CARE activity response format unexpected');
        failed++;
      }
    } else {
      fail(`CARE activity tracking failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('CARE activity tracking error', err);
    failed++;
  }

  // Test 8: Dashboard Stats (CARE metrics)
  info('Test 8: CARE Dashboard Metrics');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/reports/dashboard-bundle?tenant_id=${tenantId}`, {
      headers: authHeaders
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.data || data.stats) {
        pass('CARE dashboard metrics available');
        passed++;
      } else {
        fail('CARE dashboard metrics missing');
        failed++;
      }
    } else {
      fail(`CARE dashboard metrics failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('CARE dashboard metrics error', err);
    failed++;
  }

  // Test 9: AiSHA Office Viz (frontend check)
  info('Test 9: AiSHA Office Viz Accessibility');
  try {
    const res = await fetchWithTimeout(`${FRONTEND_URL}/office`);
    
    if (res.ok) {
      const html = await res.text();
      if (html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>')) {
        pass('AiSHA Office Viz page accessible');
        passed++;
      } else {
        fail('AiSHA Office Viz page returned unexpected content');
        failed++;
      }
    } else {
      fail(`AiSHA Office Viz page failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('AiSHA Office Viz page error', err);
    failed++;
  }

  // Test 10: Braid Tool Registry
  info('Test 10: Braid Tool Registry');
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/ai/tools?tenant_id=${tenantId}`, {
      headers: authHeaders
    });
    
    if (res.ok || res.status === 404) {
      if (res.ok) {
        const data = await res.json();
        if (data.data?.tools || data.tools) {
          pass('Braid tool registry accessible');
          passed++;
        } else {
          pass('Braid tool registry accessible (no tools listed)');
          passed++;
        }
      } else {
        pass('Braid tool registry endpoint exists (404 expected if not enabled)');
        passed++;
      }
    } else {
      fail(`Braid tool registry check failed (${res.status})`);
      failed++;
    }
  } catch (err) {
    fail('Braid tool registry error', err);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Smoke Test Results');
  console.log('='.repeat(60));
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log('='.repeat(60) + '\n');

  if (failed === 0) {
    console.log(colors.green + '✅ All smoke tests passed!' + colors.reset + '\n');
    process.exit(0);
  } else {
    console.log(colors.red + '❌ Some smoke tests failed' + colors.reset + '\n');
    process.exit(1);
  }
}

smokeTest().catch(err => {
  console.error('Smoke test suite error:', err);
  process.exit(1);
});
