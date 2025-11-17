/**
 * Test script to verify dashboard-stats endpoint
 *
 * Configuration via env (no hardcoded IDs/URLs):
 * - VITE_AISHACRM_BACKEND_URL or BACKEND_URL: backend base URL
 * - TEST_TENANT_UUID: optional direct tenant UUID
 * - TEST_TENANT_SLUG or TEST_TENANT_DOMAIN: optional identifier to resolve via Supabase
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: required if resolving by slug/domain
 */

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:4001';

async function resolveTenantId() {
  const direct = (process.env.TEST_TENANT_UUID || '').trim();
  if (direct) return direct;

  const slug = (process.env.TEST_TENANT_SLUG || '').trim();
  const domain = (process.env.TEST_TENANT_DOMAIN || '').trim();
  if (!slug && !domain) {
    throw new Error('Provide TEST_TENANT_UUID or TEST_TENANT_SLUG/TEST_TENANT_DOMAIN');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to resolve tenant');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) Prefer mapping table if present
  if (slug) {
    const { data, error } = await sb.from('tenant_identifiers').select('tenant_id').eq('slug', slug).limit(1).single();
    if (!error && data?.tenant_id) return data.tenant_id;
  }
  if (domain) {
    const { data, error } = await sb.from('tenant_identifiers').select('tenant_id').eq('domain', domain).limit(1).single();
    if (!error && data?.tenant_id) return data.tenant_id;
  }

  // 2) Fallback: resolve from tenants table by domain or slug-like name mapping
  if (domain) {
    const { data, error } = await sb.from('tenants').select('id').eq('domain', domain).limit(1).single();
    if (!error && data?.id) return data.id;
  }
  if (slug) {
    // Try exact slug column if exists; else derive from domain prefix
    let id = null;
    const trySlug = await sb.from('tenants').select('id').eq('slug', slug).limit(1).single();
    if (!trySlug.error && trySlug.data?.id) id = trySlug.data.id;
    if (!id) {
      const { data, error } = await sb.from('tenants').select('id,domain').ilike('domain', `${slug}.%`).limit(1).single();
      if (!error && data?.id) return data.id;
    } else {
      return id;
    }
  }

  throw new Error('Unable to resolve tenant_id from provided identifiers');
}

async function testDashboardStats() {
  console.log('\n=== Testing Dashboard Stats Endpoint ===\n');
  console.log(`Backend URL: ${BACKEND_URL}`);

  const tenantId = await resolveTenantId();
  console.log(`Tenant ID: ${tenantId}\n`);

  try {
    const url = `${BACKEND_URL}/api/reports/dashboard-stats?tenant_id=${tenantId}`;
    console.log(`Fetching: ${url}\n`);

    const response = await fetch(url);
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const result = await response.json();
    
    console.log('\n=== Response ===\n');
    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'success' && result.data) {
      const stats = result.data;
      console.log('\n=== Summary ===');
      console.log(`Total Contacts: ${stats.totalContacts}`);
      console.log(`Total Accounts: ${stats.totalAccounts}`);
      console.log(`Total Leads: ${stats.totalLeads}`);
      console.log(`Total Opportunities: ${stats.totalOpportunities}`);
      console.log(`Total Activities: ${stats.totalActivities}`);
      console.log(`Recent Activities: ${stats.recentActivities?.length || 0}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testDashboardStats().catch(console.error);
