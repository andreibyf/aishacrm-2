/**
 * testSuites
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  const started = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const suites = [
      { id: 'performanceSmoke', name: 'Performance Smoke', description: 'Quick API latency checks on core entities.' },
      { id: 'entitiesHealth', name: 'Entities Health', description: 'Basic read checks for Contact/Account/Lead/Opportunity/Activity.' }
    ];

    return Response.json({ 
      suites, 
      meta: { 
        generated_at: new Date().toISOString(), 
        duration_ms: Date.now() - started 
      } 
    });
  } catch (error) {
    const status = error?.response?.status || error?.status || 500;
    console.error(`Test suites endpoint failed (${status}):`, error?.message || 'Unknown error');
    return Response.json({ error: error.message }, { status });
  }
});

----------------------------

export default testSuites;
