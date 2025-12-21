// Run Braid tools directly (without OpenAI) for a given tenant
// Usage: node scripts/run_braid_tools.js [toolName] [tenantSlug]
// Example: node scripts/run_braid_tools.js fetch_tenant_snapshot labor-depot

import { executeBraidTool } from '../lib/braidIntegration-v2.js';

const [, , toolArg, tenantArg] = process.argv;
const toolName = toolArg || 'fetch_tenant_snapshot';
const tenantSlug = tenantArg || 'labor-depot';

async function main() {
  try {
    const tenantRecord = { tenant_id: tenantSlug };
    const result = await executeBraidTool(toolName, {}, tenantRecord, null);

    console.log(JSON.stringify({ raw: result }, null, 2));
    try {
      const names = Object.getOwnPropertyNames(result || {});
      const hasValue = Object.prototype.hasOwnProperty.call(result || {}, 'value');
      const typeOfValue = typeof (result && result.value);
      console.log(JSON.stringify({ ownProps: names, hasValue, typeOfValue }, null, 2));
    } catch {
      // ignore
    }

    if (result?.tag === 'Ok') {
      const v = result.value || {};
      const summary = {
        tool: toolName,
        ok: true,
        keys: Object.keys(v),
        counts: {
          accounts: Array.isArray(v.accounts) ? v.accounts.length : undefined,
          leads: Array.isArray(v.leads) ? v.leads.length : undefined,
          contacts: Array.isArray(v.contacts) ? v.contacts.length : undefined,
          opportunities: Array.isArray(v.opportunities) ? v.opportunities.length : undefined,
          activities: Array.isArray(v.activities) ? v.activities.length : undefined,
        },
      };
      console.log(JSON.stringify({ summary, value: v }, null, 2));
    } else {
      console.error(JSON.stringify({ tool: toolName, ok: false, error: result?.error || result }, null, 2));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(JSON.stringify({ tool: toolName, ok: false, error: e?.message || String(e) }, null, 2));
    process.exitCode = 1;
  }
}

main();
