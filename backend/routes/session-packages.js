/**
 * Session Packages Routes
 * CRUD for tenant-defined service packages (e.g., "6-Session Training Package").
 *
 * All routes require authentication + tenant validation.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { invalidateCache, cacheList } from '../lib/cacheMiddleware.js';

function resolveTenantId(req) {
  const fromMiddleware = req.tenant?.id;
  const fromRequest = req.query?.tenant_id || req.body?.tenant_id;
  if (fromMiddleware) {
    if (fromRequest && fromRequest !== fromMiddleware) {
      return { error: 'tenant_id mismatch' };
    }
    return { tenant_id: fromMiddleware };
  }
  if (fromRequest) return { tenant_id: fromRequest };
  return { error: 'tenant_id is required' };
}

export default function createSessionPackageRoutes() {
  const router = express.Router();
  router.use(validateTenantAccess);

  // GET /api/session-packages — list active packages for tenant
  router.get(
    '/',
    cacheList('session_packages', (req) => req.tenant?.id),
    async (req, res) => {
      try {
        const { tenant_id, error } = resolveTenantId(req);
        if (error) return res.status(400).json({ status: 'error', message: error });

        const { include_inactive } = req.query;
        const supabase = getSupabaseClient();

        let query = supabase
          .from('session_packages')
          .select('*')
          .eq('tenant_id', tenant_id)
          .order('created_at', { ascending: false });

        if (!include_inactive || include_inactive === 'false') {
          query = query.eq('is_active', true);
        }

        const { data, error: dbErr } = await query;
        if (dbErr) throw new Error(dbErr.message);

        res.json({ status: 'success', data });
      } catch (err) {
        logger.error('[SessionPackages] GET / error', { error: err.message });
        res.status(500).json({ status: 'error', message: err.message });
      }
    },
  );

  // GET /api/session-packages/:id — get single package
  router.get('/:id', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getSupabaseClient();
      const { data, error: dbErr } = await supabase
        .from('session_packages')
        .select('*')
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .single();

      if (dbErr || !data) return res.status(404).json({ status: 'error', message: 'Not found' });

      res.json({ status: 'success', data });
    } catch (err) {
      logger.error('[SessionPackages] GET /:id error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/session-packages — create package (admin)
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { name, description, session_count, price_cents, validity_days, is_active } = req.body;

      if (!name || !session_count) {
        return res
          .status(400)
          .json({ status: 'error', message: 'name and session_count are required' });
      }

      const supabase = getSupabaseClient();
      const { data, error: dbErr } = await supabase
        .from('session_packages')
        .insert([
          {
            tenant_id,
            name,
            description,
            session_count: Number(session_count),
            price_cents: Number(price_cents) || 0,
            validity_days: Number(validity_days) || 365,
            is_active: is_active !== false,
          },
        ])
        .select('*')
        .single();

      if (dbErr) throw new Error(dbErr.message);

      invalidateCache(`session_packages_${tenant_id}`);
      res.status(201).json({ status: 'success', data });
    } catch (err) {
      logger.error('[SessionPackages] POST / error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // PUT /api/session-packages/:id — update package
  router.put('/:id', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const allowed = [
        'name',
        'description',
        'session_count',
        'price_cents',
        'validity_days',
        'is_active',
      ];
      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      const supabase = getSupabaseClient();
      const { data, error: dbErr } = await supabase
        .from('session_packages')
        .update(updates)
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (dbErr || !data)
        return res.status(404).json({ status: 'error', message: 'Not found or not updated' });

      invalidateCache(`session_packages_${tenant_id}`);
      res.json({ status: 'success', data });
    } catch (err) {
      logger.error('[SessionPackages] PUT /:id error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // DELETE /api/session-packages/:id — soft delete (set is_active=false)
  router.delete('/:id', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getSupabaseClient();
      const { error: dbErr } = await supabase
        .from('session_packages')
        .update({ is_active: false })
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id);

      if (dbErr) throw new Error(dbErr.message);

      invalidateCache(`session_packages_${tenant_id}`);
      res.json({ status: 'success', message: 'Package deactivated' });
    } catch (err) {
      logger.error('[SessionPackages] DELETE /:id error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
