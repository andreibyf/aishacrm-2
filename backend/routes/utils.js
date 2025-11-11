/**
 * Utility Routes
 * Miscellaneous utility functions
 */

import express from 'express';
import crypto from 'crypto';

export default function createUtilsRoutes(_pgPool) {
  const router = express.Router();
  const pgPool = _pgPool; // optional DB access for uniqueness checks

  // POST /api/utils/hash - Hash a string
  router.post('/hash', async (req, res) => {
    try {
      const { text, algorithm = 'sha256' } = req.body;

      res.json({
        status: 'success',
        message: 'Hashing not yet implemented',
        data: { algorithm, text_length: text?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/generate-uuid - Generate UUID
  router.post('/generate-uuid', async (req, res) => {
    try {
      const uuid = crypto.randomUUID();

      res.json({
        status: 'success',
        data: { uuid },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/generate-unique-id - Generate a human-readable unique ID per entity/tenant
  // Body: { entity_type: 'Lead'|'Contact'|'Account'|'Opportunity'|'Activity', tenant_id: string, prefix?: string }
  router.post('/generate-unique-id', async (req, res) => {
    try {
      const { entity_type, tenant_id, prefix } = req.body || {};

      if (!entity_type) {
        return res.status(400).json({ status: 'error', message: 'entity_type is required' });
      }
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Map entity type to table and default prefix
      const map = {
        Lead: { table: 'leads', defaultPrefix: 'LEAD' },
        Contact: { table: 'contacts', defaultPrefix: 'CONT' },
        Account: { table: 'accounts', defaultPrefix: 'ACCT' },
        Opportunity: { table: 'opportunities', defaultPrefix: 'OPP' },
        Activity: { table: 'activities', defaultPrefix: 'ACT' },
      };
      const cfg = map[entity_type] || { table: null, defaultPrefix: 'ID' };

      // Build short, readable slug components
      const tenantSlug = String(tenant_id)
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
        .split('-')[0]
        .slice(0, 6) || 'TEN';
      const pfx = (prefix || cfg.defaultPrefix || 'ID').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'ID';

      const now = new Date();
      const y = String(now.getUTCFullYear()).slice(-2);
      const m = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d = String(now.getUTCDate()).padStart(2, '0');
      const datePart = `${y}${m}${d}`; // YYMMDD

      const rand = (len = 4) => {
        const bytes = crypto.randomBytes(len);
        return bytes.toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, len);
      };

      const buildId = () => `${pfx}-${tenantSlug}-${datePart}-${rand(4)}`;

      // If we have DB access and a known table, ensure uniqueness within the tenant for that table
      const ensureUnique = async () => {
        const candidate = buildId();
        if (!pgPool || !cfg.table) return candidate;
        let exists = false;
        try {
          // Check metadata->>'unique_id' for existence (our routes store extra fields in metadata)
          const { rows } = await pgPool.query(
            `SELECT 1 FROM ${cfg.table} WHERE tenant_id = $1 AND (metadata->>'unique_id') = $2 LIMIT 1`,
            [tenant_id, candidate]
          );
          exists = rows.length > 0;
  } catch {
          // If JSON path fails (e.g., missing metadata), attempt to check a direct column if it exists
          try {
            const { rows } = await pgPool.query(
              `SELECT 1 FROM ${cfg.table} WHERE tenant_id = $1 AND unique_id = $2 LIMIT 1`,
              [tenant_id, candidate]
            );
            exists = rows.length > 0;
          } catch {
            exists = false; // give up uniqueness check, fallback to candidate
          }
        }
        if (!exists) return candidate;
        // Retry with different random suffix a few times
        for (let i = 0; i < 5; i++) {
          const retry = buildId();
          try {
            const { rows } = await pgPool.query(
              `SELECT 1 FROM ${cfg.table} WHERE tenant_id = $1 AND (metadata->>'unique_id') = $2 LIMIT 1`,
              [tenant_id, retry]
            );
            if (rows.length === 0) return retry;
          } catch {
            return retry; // if check fails, return retry candidate
          }
        }
        // As a last resort, append a longer random token
        return `${buildId()}-${rand(6)}`;
      };

      const unique_id = await ensureUnique();
      return res.json({ status: 'success', data: { unique_id, entity_type, tenant_id } });
    } catch (error) {
      console.error('[Utils] generate-unique-id error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
