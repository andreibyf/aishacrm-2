/**
 * Lead Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';

export default function createLeadRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/leads:
   *   get:
   *     summary: List leads
   *     tags: [leads]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: status
   *         schema: { oneOf: [ { type: string }, { type: object } ] }
   *       - in: query
   *         name: account_id
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Leads list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     leads:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           tenant_id:
   *                             type: string
   *                             format: uuid
   *                           first_name:
   *                             type: string
   *                           last_name:
   *                             type: string
   *                           email:
   *                             type: string
   *                             format: email
   *                           phone:
   *                             type: string
   *                           company:
   *                             type: string
   *                           status:
   *                             type: string
   *                             example: new
   *                           source:
   *                             type: string
   *                           account_id:
   *                             type: string
   *                             nullable: true
   *                           created_at:
   *                             type: string
   *                             format: date-time
   *   post:
   *     summary: Create lead
   *     tags: [leads]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *           example:
   *             tenant_id: "550e8400-e29b-41d4-a716-446655440000"
   *             first_name: "John"
   *             last_name: "Smith"
   *             email: "john.smith@example.com"
   *             phone: "+1-555-9876"
   *             company: "Smith Industries"
   *             status: "new"
   *             source: "website"
   *     responses:
   *       200:
   *         description: Lead created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     tenant_id:
   *                       type: string
   *                       format: uuid
   *                     first_name:
   *                       type: string
   *                     last_name:
   *                       type: string
   *                     email:
   *                       type: string
   *                     phone:
   *                       type: string
   *                     company:
   *                       type: string
   *                     status:
   *                       type: string
   *                     created_at:
   *                       type: string
   *                       format: date-time
   */

  // Apply tenant validation and employee data scope to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

// Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  // GET /api/leads - List leads
  router.get('/', cacheList('leads', 180), async (req, res) => {
    try {
      let { tenant_id, status, account_id, filter } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase.from('leads').select('*', { count: 'exact' }).eq('tenant_id', tenant_id);

      // Handle $or filter for dynamic search (frontend passes filter as JSON string)
      if (filter) {
        let parsedFilter = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsedFilter = JSON.parse(filter);
          } catch {
            // treat as literal
          }
        }
        
        if (typeof parsedFilter === 'object' && parsedFilter.$or && Array.isArray(parsedFilter.$or)) {
          // Build OR condition: match any of the $or criteria
          // Use Supabase's or() method for multiple OR conditions
          const orConditions = parsedFilter.$or.map(condition => {
            // Each condition is like { first_name: { $icontains: "search_term" } }
            const [field, opObj] = Object.entries(condition)[0];
            if (opObj && opObj.$icontains) {
              return `${field}.ilike.%${opObj.$icontains}%`;
            }
            return null;
          }).filter(Boolean);
          
          if (orConditions.length > 0) {
            // Use Supabase or() to combine conditions with OR logic
            q = q.or(orConditions.join(','));
          }
        }
      }

      if (status) {
        let parsedStatus = status;
        if (typeof status === 'string' && status.startsWith('{')) {
          try {
            parsedStatus = JSON.parse(status);
          } catch {
            // treat as literal
          }
        }
        if (typeof parsedStatus === 'object' && parsedStatus.$nin) {
          // NOT IN: filter out these statuses
          for (const s of parsedStatus.$nin) {
            q = q.neq('status', s);
          }
        } else {
          q = q.eq('status', status);
        }
      }
      if (account_id) q = q.eq('account_id', account_id);
      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const leads = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: { leads, total: count || 0, status, limit, offset },
      });
    } catch (error) {
      console.error('Error listing leads:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads - Create lead
  router.post('/', invalidateCache('leads'), async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, phone, company, job_title, title, description, status = 'new', source, metadata, ...otherFields } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Validate required name fields
      if (!first_name || !first_name.trim()) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'first_name is required and cannot be empty',
          field: 'first_name'
        });
      }

      if (!last_name || !last_name.trim()) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'last_name is required and cannot be empty',
          field: 'last_name'
        });
      }

      // Store title and description in metadata since they may not be direct columns
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields,
        ...(title !== undefined && title !== null ? { title } : {}),
        ...(description !== undefined && description !== null ? { description } : {}),
      };

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .insert([{
          tenant_id,
          first_name,
          last_name,
          email,
          phone,
          company,
          job_title,
          status,
          source,
          metadata: combinedMetadata,
          created_at: nowIso,
          created_date: nowIso,
          updated_at: nowIso,
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      const lead = expandMetadata(data);

      console.log('[Leads POST] Successfully created lead:', lead.id);
      res.json({
        status: 'success',
        message: 'Lead created',
        data: { lead },
      });
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/leads/:id - Get single lead (tenant required)
  /**
   * @openapi
   * /api/leads/{id}:
   *   get:
   *     summary: Get lead by ID
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lead details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update lead
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Lead updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete lead
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lead deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (error) throw new Error(error.message);

      const lead = expandMetadata(data);

      res.json({
        status: 'success',
        data: { lead },
      });
    } catch (error) {
      console.error('Error fetching lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/leads/:id - Update lead
  router.put('/:id', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, email, phone, title, description, company, job_title, status, source, metadata, ...otherFields } = req.body;

      // Validate required name fields if provided
      if (first_name !== undefined && (!first_name || !first_name.trim())) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'first_name cannot be empty',
          field: 'first_name'
        });
      }

      if (last_name !== undefined && (!last_name || !last_name.trim())) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'last_name cannot be empty',
          field: 'last_name'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: current, error: fetchErr } = await supabase
        .from('leads')
        .select('metadata')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      // Store title and description in metadata since they may not be direct columns
      const currentMetadata = current?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
      };

      const payload = { metadata: updatedMetadata, updated_at: new Date().toISOString() };
      if (first_name !== undefined) payload.first_name = first_name;
      if (last_name !== undefined) payload.last_name = last_name;
      if (email !== undefined) payload.email = email;
      if (phone !== undefined) payload.phone = phone;
      if (company !== undefined) payload.company = company;
      if (job_title !== undefined) payload.job_title = job_title;
      if (status !== undefined) payload.status = status;
      if (source !== undefined) payload.source = source;

      const { data, error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (error) throw new Error(error.message);

      const updatedLead = expandMetadata(data);

      res.json({
        status: 'success',
        message: 'Lead updated',
        data: { lead: updatedLead },
      });
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/leads/:id - Delete lead
  router.delete('/:id', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Lead not found' });

      res.json({
        status: 'success',
        message: 'Lead deleted',
        data: { id: data.id },
      });
    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads/:id/convert - Convert lead to contact/opportunity
  /**
   * @openapi
   * /api/leads/{id}/convert:
   *   post:
   *     summary: Convert lead
   *     description: Convert a lead into a contact and optionally create an account and opportunity.
   *     tags: [leads]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id: { type: string }
   *               create_account: { type: boolean }
   *               account_name: { type: string }
   *               selected_account_id: { type: string, nullable: true }
   *               create_opportunity: { type: boolean }
   *               opportunity_name: { type: string }
   *               opportunity_amount: { type: number }
   *     responses:
   *       200:
   *         description: Lead converted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post('/:id/convert', invalidateCache('leads'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        tenant_id,
        performed_by,
        create_account = false,
        account_name,
        selected_account_id,
        create_opportunity = false,
        opportunity_name,
        opportunity_amount,
      } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Fetch the lead
      const { data: lead, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();
      if (leadErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      if (leadErr) throw new Error(leadErr.message);

      // Prepare bookkeeping for compensating actions if something fails
      let accountId = selected_account_id || null;
      let newAccount = null;
      let contact = null;
      let opportunity = null;

      try {
        // Create account if requested
        if (!accountId && create_account) {
          const name = (account_name || lead.company || '').trim();
          if (!name) throw new Error('Account name is required to create a new account');
          const nowIso = new Date().toISOString();
          const { data: acc, error: accErr } = await supabase
            .from('accounts')
            .insert([{
              tenant_id,
              name,
              phone: lead.phone || null,
              assigned_to: lead.assigned_to || performed_by || null,
              created_at: nowIso,
              updated_at: nowIso,
            }])
            .select('*')
            .single();
          if (accErr) throw new Error(accErr.message);
          newAccount = acc;
          accountId = newAccount.id;
        }

        // Create contact from lead
        const nowIso = new Date().toISOString();
        const { data: cont, error: contErr } = await supabase
          .from('contacts')
          .insert([{
            tenant_id,
            account_id: accountId || null,
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            job_title: lead.job_title,
            status: 'prospect',
            metadata: { converted_from_lead_id: lead.id, source: lead.source || null },
            assigned_to: lead.assigned_to || performed_by || null,
            created_at: nowIso,
            updated_at: nowIso,
          }])
          .select('*')
          .single();
        if (contErr) throw new Error(contErr.message);
        contact = cont;

        // Optionally create Opportunity
        if (create_opportunity) {
          const oppName = (opportunity_name && opportunity_name.trim()) || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'New Opportunity';
          const oppAmt = Number(opportunity_amount || lead.estimated_value || 0) || 0;
          const closeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const { data: opp, error: oppErr } = await supabase
            .from('opportunities')
            .insert([{
              tenant_id,
              name: oppName,
              account_id: accountId || null,
              contact_id: contact.id,
              stage: 'prospecting',
              amount: oppAmt,
              probability: 25,
              assigned_to: lead.assigned_to || performed_by || null,
              close_date: closeDate,
              created_at: nowIso,
              updated_at: nowIso,
            }])
            .select('*')
            .single();
          if (oppErr) throw new Error(oppErr.message);
          opportunity = opp;
        }

        // Re-link Activities from lead -> contact
        await supabase
          .from('activities')
          .update({ related_to: 'contact', related_id: contact.id, updated_date: nowIso })
          .eq('tenant_id', tenant_id)
          .eq('related_to', 'lead')
          .eq('related_id', lead.id);

        // Re-link opportunities that reference this lead (best-effort)
        try {
          // TODO: PostgREST doesn't support jsonb ->> operator directly; skip metadata-based lookup
          // Instead try description ILIKE
          await supabase
            .from('opportunities')
            .update({
              contact_id: contact.id,
              account_id: accountId || null,
              updated_at: nowIso,
            })
            .eq('tenant_id', tenant_id)
            .ilike('description', `%[Lead:${lead.id}]%`);

          console.log('[Leads] Converted: attempted to relink opportunities by description');
        } catch (oppLinkErr) {
          console.warn('[Leads] Failed to relink opportunities from lead', oppLinkErr);
        }

        // Record transition snapshot
        const transLib = await import('../lib/transitions.js');
        await transLib.logEntityTransition(supabase, {
          tenant_id,
          from_table: 'leads',
          from_id: lead.id,
          to_table: 'contacts',
          to_id: contact.id,
          action: 'convert',
          performed_by,
          snapshot: lead,
        });

        // Delete lead
        await supabase.from('leads').delete().eq('id', lead.id).eq('tenant_id', tenant_id);

        return res.json({
          status: 'success',
          message: 'Lead converted and moved to contacts',
          data: { contact, account: newAccount, opportunity }
        });

      } catch (innerErr) {
        // Compensate created records when running without DB transactions (best-effort)
        console.error('[Leads] conversion inner error, attempting cleanup:', innerErr.message || innerErr);
        try {
          if (opportunity && opportunity.id) await supabase.from('opportunities').delete().eq('id', opportunity.id).eq('tenant_id', tenant_id);
        } catch (e) { console.warn('Cleanup opportunity failed', e.message || e); }
        try {
          if (contact && contact.id) await supabase.from('contacts').delete().eq('id', contact.id).eq('tenant_id', tenant_id);
        } catch (e) { console.warn('Cleanup contact failed', e.message || e); }
        try {
          if (newAccount && newAccount.id) await supabase.from('accounts').delete().eq('id', newAccount.id).eq('tenant_id', tenant_id);
        } catch (e) { console.warn('Cleanup account failed', e.message || e); }

        console.error('[Leads] convert error:', innerErr);
        return res.status(500).json({ status: 'error', message: innerErr.message || String(innerErr) });
      }
    } catch (error) {
      console.error('[Leads] convert error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
