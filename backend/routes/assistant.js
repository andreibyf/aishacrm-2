import express from 'express';

export default function createAssistantRoutes(pgPool) {
  const router = express.Router();

  // POST /api/assistant/query
  // body: { tenant_id, query }
  router.post('/query', async (req, res) => {
    try {
      const { tenant_id, query } = req.body || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      const q = String(query || '').trim().toLowerCase();

      // Fetch tenant stats (reuse same queries as mcp.get_tenant_stats)
      const [accounts, contacts, leads, opps, activities] = await Promise.all([
        pgPool.query(`SELECT COUNT(*)::int AS c FROM accounts WHERE tenant_id = $1`, [tenant_id]),
        pgPool.query(`SELECT COUNT(*)::int AS c FROM contacts WHERE tenant_id = $1`, [tenant_id]),
        pgPool.query(`SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = $1`, [tenant_id]),
        pgPool.query(`SELECT COUNT(*)::int AS c FROM opportunities WHERE tenant_id = $1`, [tenant_id]),
        pgPool.query(`SELECT COUNT(*)::int AS c FROM activities WHERE tenant_id = $1`, [tenant_id]),
      ]);

      const stats = {
        accounts: accounts.rows?.[0]?.c || 0,
        contacts: contacts.rows?.[0]?.c || 0,
        leads: leads.rows?.[0]?.c || 0,
        opportunities: opps.rows?.[0]?.c || 0,
        activities: activities.rows?.[0]?.c || 0,
      };

      // Simple intent matching
      if (!q) {
        return res.json({ status: 'success', data: { text: 'Tenant stats', stats } });
      }

      if (q.includes('lead') || q.includes('leads')) {
        return res.json({ status: 'success', data: { text: `Leads: ${stats.leads}`, value: stats.leads } });
      }
      if (q.includes('contact') || q.includes('contacts')) {
        return res.json({ status: 'success', data: { text: `Contacts: ${stats.contacts}`, value: stats.contacts } });
      }
      if (q.includes('account') || q.includes('accounts')) {
        return res.json({ status: 'success', data: { text: `Accounts: ${stats.accounts}`, value: stats.accounts } });
      }
      if (q.includes('opportun') || q.includes('deal') || q.includes('opportunity')) {
        return res.json({ status: 'success', data: { text: `Opportunities: ${stats.opportunities}`, value: stats.opportunities } });
      }
      if (q.includes('activity') || q.includes('activities')) {
        return res.json({ status: 'success', data: { text: `Activities: ${stats.activities}`, value: stats.activities } });
      }

      // Fallback: return summary and suggest queries
      const summary = `Accounts: ${stats.accounts}, Contacts: ${stats.contacts}, Leads: ${stats.leads}, Opportunities: ${stats.opportunities}, Activities: ${stats.activities}`;
      return res.json({ status: 'success', data: { text: `I can report counts. ${summary}`, stats } });
    } catch (err) {
      console.error('[Assistant] Error handling query:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
