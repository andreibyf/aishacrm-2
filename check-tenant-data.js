/**
 * Check if data exists in Supabase for the tenant
 *
 * Env required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TEST_TENANT_UUID or TEST_TENANT_SLUG/TEST_TENANT_DOMAIN
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function resolveTenantId() {
  const direct = (process.env.TEST_TENANT_UUID || '').trim();
  if (direct) return direct;
  const slug = (process.env.TEST_TENANT_SLUG || '').trim();
  const domain = (process.env.TEST_TENANT_DOMAIN || '').trim();
  if (!slug && !domain) throw new Error('Provide TEST_TENANT_UUID or TEST_TENANT_SLUG/TEST_TENANT_DOMAIN');
  if (slug) {
    const res = await supabase.from('tenant_identifiers').select('tenant_id').eq('slug', slug).limit(1).single();
    if (!res.error && res.data?.tenant_id) return res.data.tenant_id;
  }
  if (domain) {
    const res = await supabase.from('tenant_identifiers').select('tenant_id').eq('domain', domain).limit(1).single();
    if (!res.error && res.data?.tenant_id) return res.data.tenant_id;
  }
  if (domain) {
    const res = await supabase.from('tenants').select('id').eq('domain', domain).limit(1).single();
    if (!res.error && res.data?.id) return res.data.id;
  }
  if (slug) {
    const trySlug = await supabase.from('tenants').select('id').eq('slug', slug).limit(1).single();
    if (!trySlug.error && trySlug.data?.id) return trySlug.data.id;
    const res = await supabase.from('tenants').select('id,domain').ilike('domain', `${slug}.%`).limit(1).single();
    if (!res.error && res.data?.id) return res.data.id;
  }
  throw new Error('Unable to resolve tenant_id from provided identifiers');
}

async function checkData() {
  const TENANT_ID = await resolveTenantId();
  console.log('\n=== Checking Tenant Data ===\n');
  console.log(`Tenant ID: ${TENANT_ID}\n`);

  const tables = ['contacts', 'accounts', 'leads', 'opportunities', 'activities'];

  for (const table of tables) {
    try {
      // Check total count
      const { count: totalCount, error: totalError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (totalError) {
        console.error(`[${table}] Error getting total:`, totalError);
        continue;
      }

      // Check tenant-specific count
      const { count: tenantCount, error: tenantError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', TENANT_ID);

      if (tenantError) {
        console.error(`[${table}] Error getting tenant count:`, tenantError);
        continue;
      }

      console.log(`${table.padEnd(20)} Total: ${totalCount || 0}\tTenant: ${tenantCount || 0}`);

      // Get sample records for this tenant
      if (tenantCount > 0) {
        const { data, error } = await supabase
          .from(table)
          .select('id, tenant_id')
          .eq('tenant_id', TENANT_ID)
          .limit(3);

        if (!error && data) {
          console.log(`  Sample IDs: ${data.map(r => r.id).join(', ')}`);
        }
      }
    } catch (error) {
      console.error(`[${table}] Exception:`, error.message);
    }
  }

  // Check tenants table
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, domain')
      .eq('id', TENANT_ID);

    if (error) {
      console.error('\n[tenants] Error:', error);
    } else if (data && data.length > 0) {
      console.log('\n=== Tenant Info ===');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('\n⚠️  Tenant not found in tenants table!');
    }
  } catch (error) {
    console.error('\n[tenants] Exception:', error.message);
  }
}

checkData().catch(console.error);
