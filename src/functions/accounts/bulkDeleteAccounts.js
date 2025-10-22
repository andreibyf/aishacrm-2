/**
 * bulkDeleteAccounts
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { accountIds } = await req.json().catch(() => ({ accountIds: [] }));
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return Response.json({ status: 'error', message: 'No accountIds provided' }, { status: 400 });
    }

    const failures = [];
    let deleted = 0;

    // Delete in small batches to avoid rate limits
    const BATCH = 50;
    for (let i = 0; i < accountIds.length; i += BATCH) {
      const batch = accountIds.slice(i, i + BATCH);
      // Run deletes sequentially per batch to stay safe with RLS and limits
      for (const id of batch) {
        try {
          // Use user-scoped delete so RLS is enforced
          await base44.entities.Account.delete(id);
          deleted += 1;
        } catch (e) {
          failures.push({ id, error: String(e?.message || e) });
        }
      }
    }

    return Response.json({
      status: 'success',
      message: `Deleted ${deleted} accounts${failures.length ? `, ${failures.length} failed` : ''}`,
      deleted,
      failed: failures
    }, { status: 200 });
  } catch (error) {
    return Response.json({ status: 'error', message: String(error?.message || error) }, { status: 500 });
  }
});

----------------------------

export default bulkDeleteAccounts;
