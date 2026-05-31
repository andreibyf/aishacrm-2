/**
 * One-time script to backfill module settings for existing tenants
 * that were created before module settings auto-initialization was added.
 *
 * Usage: node backfill-module-settings.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// Single source of truth for the default module catalog — the same rows new
// tenants are seeded with (backend/routes/tenants.js). Importing it keeps this
// maintenance script from drifting (e.g. missing financeOps). The alias-aware
// selectMissingDefaultRows ensures a legacy alias-enrolled tenant is not
// silently locked out by inserting a disabled canonical row that would
// override the alias via canonical-wins.
import { buildDefaultModuleRows, selectMissingDefaultRows } from '../../routes/tenants.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function backfillModuleSettings() {
  console.log('Starting module settings backfill...\n');

  // Get all tenants
  const { data: tenants, error: tenantError } = await supabase
    .from('tenant')
    .select('id, name, tenant_id');

  if (tenantError) {
    console.error('Failed to fetch tenants:', tenantError.message);
    process.exit(1);
  }

  console.log(`Found ${tenants.length} tenants\n`);

  for (const tenant of tenants) {
    console.log(`Processing tenant: ${tenant.name} (${tenant.id})`);

    // Get existing module settings for this tenant
    const { data: existingSettings, error: settingsError } = await supabase
      .from('modulesettings')
      .select('module_name')
      .eq('tenant_id', tenant.id);

    if (settingsError) {
      console.error(`  Error fetching settings for ${tenant.name}:`, settingsError.message);
      continue;
    }

    const existingModuleNames = existingSettings.map((s) => s.module_name);
    // Build the full default row set (incl. financeOps seeded disabled), then
    // insert only the rows this tenant is truly missing. The alias-aware
    // filter treats a legacy enterpriseFinance row as equivalent to the
    // canonical financeOps key, so we do NOT insert a disabled canonical row
    // that would silently override an alias-enabled tenant (canonical-wins).
    const defaultRows = buildDefaultModuleRows(tenant.id);
    const newSettings = selectMissingDefaultRows(defaultRows, existingModuleNames);

    if (newSettings.length === 0) {
      console.log(`  ✓ Already has all ${defaultRows.length} modules`);
      continue;
    }

    console.log(
      `  Missing ${newSettings.length} modules: ${newSettings.map((r) => r.module_name).join(', ')}`,
    );

    const { data: inserted, error: insertError } = await supabase
      .from('modulesettings')
      .insert(newSettings)
      .select();

    if (insertError) {
      console.error(`  ✗ Failed to insert settings for ${tenant.name}:`, insertError.message);
      continue;
    }

    console.log(`  ✓ Created ${inserted.length} module settings`);
  }

  console.log('\nBackfill complete!');
}

backfillModuleSettings().catch(console.error);
