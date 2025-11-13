/**
 * Lead Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { logEntityTransition } from '../lib/transitions.js';

export default function createLeadRoutes(pgPool) {
  const router = express.Router();

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
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, status, account_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

  let query = 'SELECT * FROM leads WHERE tenant_id = $1';
  const params = [tenant_id];
      
      if (status) {
        // Handle MongoDB-style operators (e.g., { $nin: ['converted', 'lost'] })
        let parsedStatus = status;
        if (typeof status === 'string' && status.startsWith('{')) {
          try {
            parsedStatus = JSON.parse(status);
          } catch {
            // If it's not valid JSON, treat as literal string
          }
        }
        
        if (typeof parsedStatus === 'object' && parsedStatus.$nin) {
          // Handle $nin operator: status NOT IN (...)
          const placeholders = parsedStatus.$nin.map((_, i) => `$${params.length + i + 1}`).join(', ');
          params.push(...parsedStatus.$nin);
          query += ` AND status NOT IN (${placeholders})`;
        } else {
          // Simple equality
          params.push(status);
          query += ` AND status = $${params.length}`;
        }
      }
      if (account_id) {
        params.push(account_id);
        query += ` AND account_id = $${params.length}`;
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);
      
  let countQuery = 'SELECT COUNT(*) FROM leads WHERE tenant_id = $1';
  const countParams = [tenant_id];
      if (status) {
        // Apply same status filter logic for count
        let parsedStatus = status;
        if (typeof status === 'string' && status.startsWith('{')) {
          try {
            parsedStatus = JSON.parse(status);
          } catch {
            // If it's not valid JSON, treat as literal string
          }
        }
        
        if (typeof parsedStatus === 'object' && parsedStatus.$nin) {
          const placeholders = parsedStatus.$nin.map((_, i) => `$${countParams.length + i + 1}`).join(', ');
          countParams.push(...parsedStatus.$nin);
          countQuery += ` AND status NOT IN (${placeholders})`;
        } else {
          countParams.push(status);
          countQuery += ' AND status = $2';
        }
      }
      if (account_id) {
        countParams.push(account_id);
        countQuery += ` AND account_id = $${countParams.length}`;
      }
      const countResult = await pgPool.query(countQuery, countParams);

      // Expand metadata for all leads
      const leads = result.rows.map(expandMetadata);

      res.json({
        status: 'success',
        data: { leads, total: parseInt(countResult.rows[0].count), status, limit: parseInt(limit), offset: parseInt(offset) },
      });
    } catch (error) {
      console.error('Error listing leads:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads - Create lead
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, phone, company, job_title, status = 'new', source, metadata, ...otherFields } = req.body;

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

      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };

      const query = `
        INSERT INTO leads (tenant_id, first_name, last_name, email, phone, company, job_title, status, source, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `;
      
      const result = await pgPool.query(query, [
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        status,
        source,
        combinedMetadata
      ]);

      const lead = expandMetadata(result.rows[0]);

      res.json({
        status: 'success',
        message: 'Lead created',
        data: lead,
      });
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/leads/:id - Get single lead (tenant required)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query('SELECT * FROM leads WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }

      const row = result.rows[0];
      if (row.id !== id || row.tenant_id !== tenant_id) {
        console.error('[Leads GET /:id] Mismatched row returned', { expected: { id, tenant_id }, got: { id: row.id, tenant_id: row.tenant_id } });
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }

      // Expand metadata to top-level properties
      const lead = expandMetadata(row);

      res.json({
        status: 'success',
        data: lead,
      });
    } catch (error) {
      console.error('Error fetching lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/leads/:id - Update lead
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, email, phone, company, job_title, status, source, metadata, ...otherFields } = req.body;

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

      // First, get current lead to merge metadata
      const currentLead = await pgPool.query('SELECT metadata FROM leads WHERE id = $1', [id]);
      
      if (currentLead.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }

      // Merge metadata
      const currentMetadata = currentLead.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (first_name !== undefined) {
        updates.push(`first_name = $${paramCount++}`);
        values.push(first_name);
      }
      if (last_name !== undefined) {
        updates.push(`last_name = $${paramCount++}`);
        values.push(last_name);
      }
      if (email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(phone);
      }
      if (company !== undefined) {
        updates.push(`company = $${paramCount++}`);
        values.push(company);
      }
      if (job_title !== undefined) {
        updates.push(`job_title = $${paramCount++}`);
        values.push(job_title);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }
      if (source !== undefined) {
        updates.push(`source = $${paramCount++}`);
        values.push(source);
      }

      // Always update metadata
      updates.push(`metadata = $${paramCount++}`);
      values.push(updatedMetadata);

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }

      // Expand metadata in response
      const updatedLead = expandMetadata(result.rows[0]);

      res.json({
        status: 'success',
        message: 'Lead updated',
        data: updatedLead,
      });
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/leads/:id - Delete lead
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pgPool.query('DELETE FROM leads WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }

      res.json({
        status: 'success',
        message: 'Lead deleted',
        data: { id: result.rows[0].id },
      });
    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/leads/:id/convert - Convert lead to contact/opportunity
  router.post('/:id/convert', async (req, res) => {
    const client = await pgPool.connect();
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

      await client.query('BEGIN');

      // Lock lead row
      const leadRes = await client.query(
        'SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [id, tenant_id]
      );
      if (leadRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ status: 'error', message: 'Lead not found' });
      }
      const lead = leadRes.rows[0];

      // Determine Account: use selected, create new if requested, else null
      let accountId = selected_account_id || null;
      let newAccount = null;
      if (!accountId && create_account) {
        const name = (account_name || lead.company || '').trim();
        if (!name) {
          throw new Error('Account name is required to create a new account');
        }
        const accIns = await client.query(
          `INSERT INTO accounts (tenant_id, name, phone, assigned_to, created_at, updated_at)
           VALUES ($1,$2,$3,$4, now(), now()) RETURNING *`,
          [tenant_id, name, lead.phone || null, lead.assigned_to || performed_by || null]
        );
        newAccount = accIns.rows[0];
        accountId = newAccount.id;
      }

      // Create Contact from Lead
      const contactIns = await client.query(
        `INSERT INTO contacts (
           tenant_id, account_id, first_name, last_name, email, phone, job_title, status,
           metadata, assigned_to, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                   COALESCE($9::jsonb, '{}'::jsonb), $10, now(), now())
         RETURNING *`,
        [
          tenant_id,
          accountId || null,
          lead.first_name,
          lead.last_name,
          lead.email,
          lead.phone,
          lead.job_title,
          'prospect',
          JSON.stringify({ converted_from_lead_id: lead.id, source: lead.source || null }),
          lead.assigned_to || performed_by || null,
        ]
      );
      const contact = contactIns.rows[0];

      // Optionally create Opportunity
      let opportunity = null;
      if (create_opportunity) {
        const oppName = (opportunity_name && opportunity_name.trim()) || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'New Opportunity';
        const oppAmt = Number(opportunity_amount || lead.estimated_value || 0) || 0;
        const oppIns = await client.query(
          `INSERT INTO opportunities (
             tenant_id, name, account_id, contact_id, stage, amount, probability, lead_source,
             assigned_to, close_date, type, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,'prospecting',$5,25,$6,$7, (now() + interval '30 days')::date, 'new_business', now(), now())
           RETURNING *`,
          [
            tenant_id,
            oppName,
            accountId || null,
            contact.id,
            oppAmt,
            lead.source || 'other',
            lead.assigned_to || performed_by || null,
          ]
        );
        opportunity = oppIns.rows[0];
      }

      // Re-link Activities from lead -> contact
      await client.query(
        `UPDATE activities
           SET related_to = 'contact', related_id = $1, updated_date = now()
         WHERE tenant_id = $2 AND related_to = 'lead' AND related_id = $3`,
        [contact.id, tenant_id, lead.id]
      );

      // Re-link any existing Opportunities originally tied to this lead
      try {
        const linkOppByMeta = await client.query(
          `UPDATE opportunities
             SET contact_id = COALESCE(contact_id, $1),
                 account_id = COALESCE(account_id, $2),
                 updated_at = now()
           WHERE tenant_id = $3
             AND (metadata ->> 'origin_lead_id') = $4`,
          [contact.id, accountId || null, tenant_id, lead.id]
        );

        const linkOppByDesc = await client.query(
          `UPDATE opportunities
             SET contact_id = COALESCE(contact_id, $1),
                 account_id = COALESCE(account_id, $2),
                 updated_at = now()
           WHERE tenant_id = $3
             AND description ILIKE $4`,
          [contact.id, accountId || null, tenant_id, `%[Lead:${lead.id}]%`]
        );

        console.log('[Leads] Converted: relinked opportunities', {
          by_meta: linkOppByMeta.rowCount,
          by_desc: linkOppByDesc.rowCount,
        });
      } catch (oppLinkErr) {
        console.warn('[Leads] Failed to relink opportunities from lead', oppLinkErr);
      }

      // Record transition snapshot, then delete lead to avoid double counting
      await logEntityTransition(client, {
        tenant_id,
        from_table: 'leads',
        from_id: lead.id,
        to_table: 'contacts',
        to_id: contact.id,
        action: 'convert',
        performed_by,
        snapshot: lead,
      });

      await client.query('DELETE FROM leads WHERE id = $1 AND tenant_id = $2', [lead.id, tenant_id]);

      await client.query('COMMIT');
      return res.json({
        status: 'success',
        message: 'Lead converted and moved to contacts',
        data: { contact, account: newAccount, opportunity }
      });
    } catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* noop */ }
      console.error('[Leads] convert error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    } finally {
      client.release();
    }
  });

  return router;
}
