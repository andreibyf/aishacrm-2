/**
 * Session Credits Routes
 * Manage credit balances and purchases for contacts/leads.
 *
 * Endpoints:
 *   GET  /api/session-credits          — list credits for entity (contact or lead)
 *   POST /api/session-credits/purchase — purchase a package → create credits record
 *   POST /api/session-credits/grant    — admin: manually grant credits without payment
 */

import express from 'express';
import Stripe from 'stripe';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { invalidateCache } from '../lib/cacheMiddleware.js';

function resolveTenantId(req) {
  const fromMiddleware = req.tenant?.id;
  const fromRequest = req.query?.tenant_id || req.body?.tenant_id;
  if (fromMiddleware) {
    if (fromRequest && fromRequest !== fromMiddleware) return { error: 'tenant_id mismatch' };
    return { tenant_id: fromMiddleware };
  }
  if (fromRequest) return { tenant_id: fromRequest };
  return { error: 'tenant_id is required' };
}

export default function createSessionCreditsRoutes() {
  const router = express.Router();
  router.use(validateTenantAccess);

  // GET /api/session-credits?contact_id=<uuid>|lead_id=<uuid>
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { contact_id, lead_id, entity_id } = req.query;
      const resolvedContactId = contact_id || entity_id;

      if (!resolvedContactId && !lead_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'contact_id or lead_id is required' });
      }

      const supabase = getSupabaseClient();
      let query = supabase
        .from('session_credits')
        .select(
          `
          *,
          session_packages (name, session_count, validity_days)
        `,
        )
        .eq('tenant_id', tenant_id)
        .order('purchase_date', { ascending: false });

      if (resolvedContactId) query = query.eq('contact_id', resolvedContactId);
      else if (lead_id) query = query.eq('lead_id', lead_id);

      const { data, error: dbErr } = await query;
      if (dbErr) throw new Error(dbErr.message);

      // Compute summary
      const totalCredits = data?.reduce((s, r) => s + (r.credits_remaining || 0), 0) || 0;
      const activeCredits = data?.filter((r) => new Date(r.expiry_date) > new Date()) || [];

      res.json({
        status: 'success',
        data,
        summary: {
          total_remaining: totalCredits,
          active_records: activeCredits.length,
        },
      });
    } catch (err) {
      logger.error('[SessionCredits] GET / error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/session-credits/bookings?contact_id=<uuid>|lead_id=<uuid>
  // Returns booking history for an entity
  router.get('/bookings', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { contact_id, lead_id } = req.query;
      if (!contact_id && !lead_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'contact_id or lead_id is required' });
      }

      const supabase = getSupabaseClient();
      let query = supabase
        .from('booking_sessions')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('scheduled_start', { ascending: false });

      if (contact_id) query = query.eq('contact_id', contact_id);
      else if (lead_id) query = query.eq('lead_id', lead_id);

      const { data, error: dbErr } = await query;
      if (dbErr) throw new Error(dbErr.message);

      res.json({ status: 'success', data });
    } catch (err) {
      logger.error('[SessionCredits] GET /bookings error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/session-credits/purchase
  // Called after successful payment. Creates a session_credits record.
  // Body: { tenant_id, contact_id?, lead_id?, package_id, payment_reference? }
  router.post('/purchase', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { contact_id, lead_id, package_id, payment_reference } = req.body;

      if (!package_id) {
        return res.status(400).json({ status: 'error', message: 'package_id is required' });
      }
      if (!contact_id && !lead_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'contact_id or lead_id is required' });
      }

      const supabase = getSupabaseClient();

      // Fetch package to get session_count and validity_days
      const { data: pkg, error: pkgErr } = await supabase
        .from('session_packages')
        .select('id, session_count, validity_days, is_active')
        .eq('id', package_id)
        .eq('tenant_id', tenant_id)
        .single();

      if (pkgErr || !pkg) {
        return res.status(404).json({ status: 'error', message: 'Package not found' });
      }
      if (!pkg.is_active) {
        return res.status(400).json({ status: 'error', message: 'Package is no longer active' });
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + pkg.validity_days);

      const { data: credit, error: creditErr } = await supabase
        .from('session_credits')
        .insert([
          {
            tenant_id,
            contact_id: contact_id || null,
            lead_id: lead_id || null,
            package_id,
            credits_purchased: pkg.session_count,
            credits_remaining: pkg.session_count,
            purchase_date: new Date().toISOString(),
            expiry_date: expiryDate.toISOString(),
            metadata: {
              payment_reference: payment_reference || null,
              purchased_via: 'api',
            },
          },
        ])
        .select('*')
        .single();

      if (creditErr) throw new Error(creditErr.message);

      const entityKey = contact_id ? `contact_${contact_id}` : `lead_${lead_id}`;
      invalidateCache(`session_credits_${tenant_id}_${entityKey}`);

      res.status(201).json({ status: 'success', data: credit });
    } catch (err) {
      logger.error('[SessionCredits] POST /purchase error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/session-credits/checkout — Create Stripe Checkout Session
  // Body: { package_id, contact_id?, lead_id?, success_url, cancel_url }
  // Returns: { status: 'success', data: { url: <stripe hosted page URL> } }
  router.post('/checkout', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { package_id, contact_id, lead_id, success_url, cancel_url } = req.body;

      if (!package_id || !success_url || !cancel_url) {
        return res.status(400).json({
          status: 'error',
          message: 'package_id, success_url, and cancel_url are required',
        });
      }
      if (!contact_id && !lead_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'contact_id or lead_id is required' });
      }

      const supabase = getSupabaseClient();

      // Load package
      const { data: pkg, error: pkgErr } = await supabase
        .from('session_packages')
        .select('id, name, session_count, price_cents, is_active')
        .eq('id', package_id)
        .eq('tenant_id', tenant_id)
        .single();

      if (pkgErr || !pkg) {
        return res.status(404).json({ status: 'error', message: 'Package not found' });
      }
      if (!pkg.is_active) {
        return res.status(400).json({ status: 'error', message: 'Package is no longer active' });
      }
      if (!pkg.price_cents || pkg.price_cents <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Package has no price — use /purchase for free grants',
        });
      }

      // Load Stripe credentials for this tenant
      const { data: integrations, error: intErr } = await supabase
        .from('tenant_integrations')
        .select('api_credentials')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'stripe')
        .eq('is_active', true)
        .limit(1);

      if (intErr || !integrations?.length) {
        return res.status(422).json({
          status: 'error',
          message: 'No active Stripe integration configured for this tenant',
        });
      }

      const secretKey = integrations[0]?.api_credentials?.secret_key;
      if (!secretKey) {
        return res
          .status(422)
          .json({ status: 'error', message: 'Stripe secret key not configured' });
      }

      const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: pkg.price_cents,
              product_data: {
                name: pkg.name,
                description: `${pkg.session_count} session credit${pkg.session_count !== 1 ? 's' : ''}`,
              },
            },
          },
        ],
        metadata: {
          tenant_id,
          package_id,
          contact_id: contact_id || '',
          lead_id: lead_id || '',
        },
        success_url,
        cancel_url,
      });

      logger.info('[SessionCredits] Stripe Checkout Session created', {
        tenant_id,
        package_id,
        session_id: session.id,
      });

      res.json({ status: 'success', data: { url: session.url, session_id: session.id } });
    } catch (err) {
      logger.error('[SessionCredits] POST /checkout error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/session-credits/expiring?days=30 — admin: list credits expiring soon
  // Returns credits where expiry_date is within the next N days and credits_remaining > 0
  router.get('/expiring', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
      const now = new Date();
      const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const supabase = getSupabaseClient();
      const { data, error: dbErr } = await supabase
        .from('session_credits')
        .select(
          `
          *,
          session_packages (name, session_count)
        `,
        )
        .eq('tenant_id', tenant_id)
        .gt('credits_remaining', 0)
        .gte('expiry_date', now.toISOString())
        .lte('expiry_date', cutoff.toISOString())
        .order('expiry_date', { ascending: true });

      if (dbErr) throw new Error(dbErr.message);

      res.json({ status: 'success', data, meta: { days, count: data?.length ?? 0 } });
    } catch (err) {
      logger.error('[SessionCredits] GET /expiring error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/session-credits/extend — bulk extend expiry dates
  // Body: { credit_ids: [uuid], extend_days: number }
  router.post('/extend', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { credit_ids, extend_days } = req.body;

      if (!Array.isArray(credit_ids) || credit_ids.length === 0) {
        return res.status(400).json({ status: 'error', message: 'credit_ids array is required' });
      }
      if (!extend_days || Number(extend_days) < 1) {
        return res.status(400).json({ status: 'error', message: 'extend_days must be >= 1' });
      }

      const extendMs = Number(extend_days) * 24 * 60 * 60 * 1000;
      const supabase = getSupabaseClient();

      // Fetch and update each credit individually to add days relative to current expiry
      const { data: existing, error: fetchErr } = await supabase
        .from('session_credits')
        .select('id, expiry_date')
        .eq('tenant_id', tenant_id)
        .in('id', credit_ids);

      if (fetchErr) throw new Error(fetchErr.message);

      const updates = (existing || []).map((c) => ({
        id: c.id,
        expiry_date: new Date(new Date(c.expiry_date).getTime() + extendMs).toISOString(),
      }));

      const results = await Promise.allSettled(
        updates.map((u) =>
          supabase
            .from('session_credits')
            .update({ expiry_date: u.expiry_date })
            .eq('id', u.id)
            .eq('tenant_id', tenant_id),
        ),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;

      logger.info('[SessionCredits] POST /extend completed', {
        tenant_id,
        requested: credit_ids.length,
        extended: updates.length - failed,
        failed,
      });

      res.json({
        status: 'success',
        data: {
          extended: updates.length - failed,
          failed,
          extend_days: Number(extend_days),
        },
      });
    } catch (err) {
      logger.error('[SessionCredits] POST /extend error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/session-credits/grant — admin manual credit grant
  // Body: { tenant_id, contact_id?, lead_id?, package_id, credits_count, note? }
  router.post('/grant', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { contact_id, lead_id, package_id, credits_count, note, validity_days } = req.body;

      if (!package_id || !credits_count) {
        return res
          .status(400)
          .json({ status: 'error', message: 'package_id and credits_count are required' });
      }
      if (!contact_id && !lead_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'contact_id or lead_id is required' });
      }

      const supabase = getSupabaseClient();

      // Validate package exists under this tenant
      const { data: pkg } = await supabase
        .from('session_packages')
        .select('id')
        .eq('id', package_id)
        .eq('tenant_id', tenant_id)
        .single();

      if (!pkg) return res.status(404).json({ status: 'error', message: 'Package not found' });

      const validDays = Number(validity_days) || 365;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + validDays);

      const { data: credit, error: creditErr } = await supabase
        .from('session_credits')
        .insert([
          {
            tenant_id,
            contact_id: contact_id || null,
            lead_id: lead_id || null,
            package_id,
            credits_purchased: Number(credits_count),
            credits_remaining: Number(credits_count),
            purchase_date: new Date().toISOString(),
            expiry_date: expiryDate.toISOString(),
            metadata: {
              granted_by: req.user?.id || 'admin',
              note: note || null,
              granted_manually: true,
            },
          },
        ])
        .select('*')
        .single();

      if (creditErr) throw new Error(creditErr.message);

      res.status(201).json({ status: 'success', data: credit });
    } catch (err) {
      logger.error('[SessionCredits] POST /grant error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
