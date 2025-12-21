// Validate all Braid tools systematically
// Usage: node scripts/validate_braid_tools.js [tenantSlug]

import { executeBraidTool } from '../lib/braidIntegration-v2.js';

const tenantSlug = process.argv[2] || 'labor-depot';
const tenantRecord = { tenant_id: tenantSlug };

const toolsToTest = [
  // Data Snapshot
  { name: 'fetch_tenant_snapshot', args: { tenant: tenantSlug, scope: 'all', limit: 10 } },
  
  // Account Management
  { name: 'list_accounts', args: { tenant: tenantSlug, limit: 10, offset: 0 } },
  
  // Lead Management
  { name: 'list_leads', args: { tenant: tenantSlug, status: 'contacted', limit: 10 } },
  
  // Activity & Calendar
  { name: 'get_upcoming_activities', args: { tenant: tenantSlug, assigned_to: '', days: 30 } },
  
  // Notes
  { name: 'get_notes_for_record', args: { tenant: tenantSlug, related_to_type: 'account', related_to_id: '' } },
  
  // Opportunities
  { name: 'list_opportunities_by_stage', args: { tenant: tenantSlug, stage: 'prospecting', limit: 10 } },
  
  // Contacts
  { name: 'search_contacts', args: { tenant: tenantSlug, query: 'depot', limit: 10 } },
];

async function validateAll() {
  console.log(`\n🧪 Validating Braid Tools for tenant: ${tenantSlug}\n`);
  
  const results = [];
  
  for (const { name, args } of toolsToTest) {
    process.stdout.write(`Testing ${name}... `);
    
    try {
      const result = await executeBraidTool(name, args, tenantRecord, null);
      
      if (result?.tag === 'Ok') {
        const value = result.value || {};
        const keys = Object.keys(value);
        const arrayCount = Array.isArray(value) ? value.length : 
                          (keys.some(k => Array.isArray(value[k])) ? 
                            keys.filter(k => Array.isArray(value[k])).map(k => `${k}:${value[k].length}`).join(', ') : 
                            'N/A');
        
        console.log(`✅ OK (${Array.isArray(value) ? value.length + ' items' : typeof value === 'object' ? keys.length + ' keys' : 'scalar'})`);
        results.push({ tool: name, status: 'PASS', detail: arrayCount });
      } else {
        const errorMsg = result?.error?.message || JSON.stringify(result?.error || result);
        console.log(`❌ ERR: ${errorMsg.slice(0, 80)}`);
        results.push({ tool: name, status: 'FAIL', detail: errorMsg.slice(0, 100) });
      }
    } catch (e) {
      console.log(`❌ EXCEPTION: ${e.message}`);
      results.push({ tool: name, status: 'EXCEPTION', detail: e.message });
    }
  }
  
  console.log('\n📊 Summary:\n');
  console.table(results);
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log(`\n✨ ${passed}/${total} tools validated successfully\n`);
  
  process.exitCode = passed === total ? 0 : 1;
}

validateAll();
