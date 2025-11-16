import express from 'express';
import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';

export default function createTenantResolveRoutes(pgPool) { // pgPool unused but kept for signature consistency
  const router = express.Router();

  // Batch resolve: /api/tenantresolve?ids=a,b,c
  router.get('/', async (req, res) => {
    try {
      const raw = req.query.ids;
      if (!raw) {
        return res.status(400).json({ status: 'error', message: 'ids query parameter required' });
      }
      const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid identifiers provided' });
      }
      const results = [];
      for (const id of parts) {
        const resolved = await resolveCanonicalTenant(id);
        results.push({ input: id, ...resolved });
      }
      return res.json({ status: 'success', data: results });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/tenantresolve/:identifier - resolve canonical tenant
  router.get('/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      const result = await resolveCanonicalTenant(identifier);
      return res.json({ status: 'success', data: result });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  return router;
}
