/**
 * listPerformanceLogs
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
    if (!(user.role === 'admin' || user.role === 'superadmin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let payload = {};
    try {
      payload = await req.json();
    } catch {
      // ignore empty body
    }

    const limitRaw = Number(payload?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 50;
    const functionNames = Array.isArray(payload?.functionNames) ? payload.functionNames.filter(Boolean) : [];

    let logs = [];
    if (functionNames.length > 0) {
      logs = await base44.asServiceRole.entities.PerformanceLog.filter(
        { function_name: { "$in": functionNames } },
        "-created_date",
        limit
      );
    } else {
      logs = await base44.asServiceRole.entities.PerformanceLog.list("-created_date", limit);
    }

    return Response.json({
      ok: true,
      took_ms: Date.now() - started,
      count: logs?.length ?? 0,
      logs
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});

----------------------------

export default listPerformanceLogs;
