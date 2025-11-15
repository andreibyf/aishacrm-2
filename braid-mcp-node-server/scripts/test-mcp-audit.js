#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-undef */
/*
  Test script for MCP audit logging.
  - Sends a sample BraidRequestEnvelope with a create action to the local MCP server
  - Waits a short time then queries Supabase `audit_log` for the request_id

  Requirements in environment:
  - MCP_URL (default http://localhost:8000)
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

  Usage:
    node scripts/test-mcp-audit.js
*/

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const MCP_URL = process.env.MCP_URL || 'http://localhost:8000';
const MCP_RUN = `${MCP_URL.replace(/\/$/, '')}/mcp/run`;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function makeEnvelope(requestId, tenantId) {
  return {
    requestId,
    actor: { id: 'test:user:1', type: 'user', roles: ['tester'] },
    actions: [
      {
        id: 'action-1',
        verb: 'create',
        actor: { id: 'test:user:1', type: 'user' },
        resource: { system: 'crm', kind: 'contacts' },
        payload: { tenant_id: tenantId, first_name: 'MCP', last_name: 'Tester', email: 'mcp-test@example.com' },
        options: { dryRun: false },
        metadata: { requestId, tenant_id: tenantId }
      }
    ],
    createdAt: new Date().toISOString(),
    client: 'mcp-test-script'
  };
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const requestId = `test-${Date.now()}`;
  // Attempt to find a tenant to use for this test. The Supabase project used
  // for testing should contain a `tenants` table; otherwise set TENANT_ID
  // env var before running.
  let tenantId = process.env.TENANT_ID;
  // If TENANT_ID provided, it may be either the UUID `id` or the slug `tenant_id`.
  // Try to resolve it to a canonical `id` by looking up `tenants.id` then `tenants.tenant_id`.
  async function resolveTenantId(candidate) {
    if (!candidate) return null;
    try {
      // Try match by UUID/id first
      let { data, error } = await supa.from('tenants').select('id,tenant_id').eq('id', candidate).limit(1);
      if (error) {
        console.warn('Error querying tenants by id:', error.message || error);
      }
      if (data && data.length > 0) return data[0].id;

      // Next try matching the tenant_id (slug)
      ({ data, error } = await supa.from('tenants').select('id,tenant_id').eq('tenant_id', candidate).limit(1));
      if (error) {
        console.warn('Error querying tenants by tenant_id:', error.message || error);
      }
      if (data && data.length > 0) return data[0].id;
    } catch (e) {
      console.warn('Could not resolve tenant id from Supabase:', e?.message ?? e);
    }
    return null;
  }

  if (tenantId) {
    const resolved = await resolveTenantId(tenantId);
    if (resolved) {
      tenantId = resolved;
      console.log('Resolved TENANT_ID to tenant.id:', tenantId);
    } else {
      console.log('TENANT_ID provided but could not resolve to tenants.id; will attempt auto-detect from tenants table.');
      tenantId = null;
    }
  }

  if (!tenantId) {
    try {
      const { data: tenants, error: tErr } = await supa.from('tenants').select('id').limit(1);
      if (tErr) {
        console.error('Error querying tenants table to find a tenant id:', tErr.message || tErr);
      } else if (tenants && tenants.length > 0) {
        tenantId = tenants[0].id;
        console.log('Using tenant id from tenants table:', tenantId);
      }
    } catch (e) {
      console.warn('Could not auto-detect tenant id from Supabase:', e?.message ?? e);
    }
  }

  // If still no tenant found, optionally create one in dev/CI when explicitly allowed.
  if (!tenantId) {
    const allowCreate = (process.env.AUTO_CREATE_TENANT === 'true') || (process.env.CI === 'true');
    if (allowCreate) {
      const slug = process.env.AUTO_CREATE_TENANT_SLUG || `auto-tenant-${Date.now()}`;
      const name = process.env.AUTO_CREATE_TENANT_NAME || 'Auto Created Test Tenant';
      console.log('No tenant found — AUTO_CREATE_TENANT enabled, attempting to create tenant with slug:', slug);
      try {
        const payload = {
          tenant_id: slug,
          name,
          status: 'active',
          subscription_tier: 'free',
          metadata: JSON.stringify({ created_by: 'test-mcp-audit-script', environment: 'ci' })
        };
        const { data: created, error: cErr } = await supa.from('tenants').insert(payload).select('id').limit(1);
        if (cErr) {
          console.error('Failed to create tenant in Supabase:', cErr.message || cErr);
        } else if (created && created.length > 0) {
          tenantId = created[0].id || created[0];
          console.log('Created tenant id:', tenantId);
        } else if (created && created.id) {
          tenantId = created.id;
          console.log('Created tenant id:', tenantId);
        } else {
          console.warn('Unexpected create response:', created);
        }
      } catch (e) {
        console.error('Error while attempting to create tenant:', e?.message ?? e);
      }
    }
  }

  if (!tenantId) {
    console.error('No tenant id available. Set TENANT_ID env var or ensure a tenants table exists in Supabase.');
    process.exit(5);
  }

  const envelope = makeEnvelope(requestId, tenantId);

  console.log('Sending envelope to MCP:', MCP_RUN);
  const resp = await fetch(MCP_RUN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  const body = await resp.json().catch(() => null);
  console.log('MCP response status', resp.status, body);

  // wait a bit for audit insertion
  await sleep(1500);

  // Query by `request_id` (migration 053 adds this column)
  console.log('Querying Supabase audit_log for request_id=', requestId);
  const { data, error } = await supa
    .from('audit_log')
    .select('id, tenant_id, user_email, action, entity_type, entity_id, changes, ip_address, user_agent, created_at, request_id')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error querying audit_log:', error.message);
    if (error.message && error.message.includes('column audit_log.request_id does not exist')) {
      console.error('It looks like the `request_id` column is missing. Apply `backend/migrations/053_add_audit_log_request_id.sql` then re-run this test.');
      process.exit(4);
    }
    process.exit(2);
  }

  if (!data || data.length === 0) {
    console.error('No audit_log entries found for request_id=', requestId);
    process.exit(3);
  }

  console.log('Found audit_log entries:');
  for (const row of data) {
    console.log(JSON.stringify({
      id: row.id,
      tenant_id: row.tenant_id,
      user_email: row.user_email,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      changes: row.changes,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
    }, null, 2));
  }
  process.exit(0);
})();
