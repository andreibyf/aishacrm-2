/**
 * BizDev Sources Routes
 * Manage business development lead sources
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';
import { logEntityTransition } from '../lib/transitions.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { resolveTenantSlug, isUUID } from '../lib/tenantResolver.js';

export default function createBizDevSourceRoutes(pgPool) {
  const router = express.Router();

  // Enforce tenant scoping and defaults
  router.use(validateTenantAccess);

  // Get all bizdev sources (with optional filtering)
  router.get('/', async (req, res) => {
    try {
      let { tenant_id, status, source_type, priority } = req.query;

      // Accept UUID or slug; normalize to slug for legacy columns
      if (tenant_id && isUUID(String(tenant_id))) {
        tenant_id = await resolveTenantSlug(pgPool, String(tenant_id));
      }
      
      let query = 'SELECT * FROM bizdev_sources WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${paramCount}`;
        params.push(tenant_id);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (source_type) {
        query += ` AND source_type = $${paramCount}`;
        params.push(source_type);
        paramCount++;
      }

      if (priority) {
        query += ` AND priority = $${paramCount}`;
        params.push(priority);
        paramCount++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await pgPool.query(query, params);

      res.json({
        status: 'success',
        data: { bizdevsources: result.rows }
      });
    } catch (error) {
      console.error('Error fetching bizdev sources:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Get single bizdev source by ID (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      // Accept UUID or slug; normalize to slug for legacy columns
      if (tenant_id && isUUID(String(tenant_id))) {
        tenant_id = await resolveTenantSlug(pgPool, String(tenant_id));
      }
      
      const result = await pgPool.query(
        'SELECT * FROM bizdev_sources WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'BizDev source not found' });
      }

      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error fetching bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Create new bizdev source
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id: incomingTenantId,
        source_name,
        source_type,
        source_url,
        contact_person,
        contact_email,
        contact_phone,
        status,
        priority,
        leads_generated,
        opportunities_created,
        revenue_generated,
        notes,
        tags,
        metadata,
        is_test_data
      } = req.body;

      if (!incomingTenantId || !source_name) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and source_name are required'
        });
      }

      // Accept UUID or slug; normalize to slug for legacy columns
      const tenant_id = isUUID(String(incomingTenantId))
        ? await resolveTenantSlug(pgPool, String(incomingTenantId))
        : incomingTenantId;

      const result = await pgPool.query(
        `INSERT INTO bizdev_sources (
          tenant_id, source_name, source_type, source_url,
          contact_person, contact_email, contact_phone,
          status, priority, leads_generated, opportunities_created,
          revenue_generated, notes, tags, metadata, is_test_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          tenant_id, source_name, source_type, source_url,
          contact_person, contact_email, contact_phone,
          status || 'active', priority || 'medium', leads_generated || 0,
          opportunities_created || 0, revenue_generated || 0,
          notes, JSON.stringify(tags || []), JSON.stringify(metadata || {}),
          is_test_data || false
        ]
      );

      res.status(201).json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Update bizdev source (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};
      const {
        source_name,
        source_type,
        source_url,
        contact_person,
        contact_email,
        contact_phone,
        status,
        priority,
        leads_generated,
        opportunities_created,
        revenue_generated,
        notes,
        tags,
        metadata,
        is_test_data
      } = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      // Accept UUID or slug; normalize to slug for legacy columns
      if (tenant_id && isUUID(String(tenant_id))) {
        tenant_id = await resolveTenantSlug(pgPool, String(tenant_id));
      }

      const result = await pgPool.query(
        `UPDATE bizdev_sources SET
          source_name = COALESCE($1, source_name),
          source_type = COALESCE($2, source_type),
          source_url = COALESCE($3, source_url),
          contact_person = COALESCE($4, contact_person),
          contact_email = COALESCE($5, contact_email),
          contact_phone = COALESCE($6, contact_phone),
          status = COALESCE($7, status),
          priority = COALESCE($8, priority),
          leads_generated = COALESCE($9, leads_generated),
          opportunities_created = COALESCE($10, opportunities_created),
          revenue_generated = COALESCE($11, revenue_generated),
          notes = COALESCE($12, notes),
          tags = COALESCE($13, tags),
          metadata = COALESCE($14, metadata),
          is_test_data = COALESCE($15, is_test_data),
          updated_at = now()
        WHERE tenant_id = $16 AND id = $17
        RETURNING *`,
        [
          source_name, source_type, source_url, contact_person,
          contact_email, contact_phone, status, priority,
          leads_generated, opportunities_created, revenue_generated,
          notes, tags ? JSON.stringify(tags) : null,
          metadata ? JSON.stringify(metadata) : null,
          is_test_data, tenant_id, id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      res.json({
        status: 'success',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // Delete bizdev source (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      // Accept UUID or slug; normalize to slug for legacy columns
      if (tenant_id && isUUID(String(tenant_id))) {
        tenant_id = await resolveTenantSlug(pgPool, String(tenant_id));
      }
      
      const result = await pgPool.query(
        'DELETE FROM bizdev_sources WHERE tenant_id = $1 AND id = $2 RETURNING *',
        [tenant_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      res.json({
        status: 'success',
        message: 'BizDev source deleted',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error deleting bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // POST /api/bizdevsources/:id/promote - Promote bizdev source to account
  router.post('/:id/promote', async (req, res) => {
    const supportsTx = typeof pgPool.connect === 'function';
    let client = null;
    try {
  const { id } = req.params;
  // Default delete_source to false to retain promoted sources for UX (grayed out + stats)
  const { tenant_id: incomingTenantId, performed_by, delete_source = false } = req.body;

      // Accept UUID or slug; normalize to slug for legacy columns
      const tenant_id = isUUID(String(incomingTenantId))
        ? await resolveTenantSlug(pgPool, String(incomingTenantId))
        : incomingTenantId;

      console.log('[Promote BizDev Source] Request received:', { id, tenant_id, body: req.body, supportsTx });

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      if (supportsTx) {
        client = await pgPool.connect();
      } else {
        client = { query: (...args) => pgPool.query(...args), release: () => {} };
      }

      if (supportsTx) {
        await client.query('BEGIN');
      }

      // Fetch the bizdev source (lock if transactions supported)
      const selectSql = supportsTx
        ? 'SELECT * FROM bizdev_sources WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE'
        : 'SELECT * FROM bizdev_sources WHERE id = $1 AND tenant_id = $2 LIMIT 1';
  const sourceResult = await client.query(selectSql, [id, tenant_id]);

      if (sourceResult.rows.length === 0) {
        if (supportsTx) { try { await client.query('ROLLBACK'); } catch { /* noop */ } }
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      const source = sourceResult.rows[0];
      console.log('[Promote BizDev Source] Source data:', {
        company_name: source.company_name,
        source: source.source,
        source_name: source.source_name,
        industry: source.industry
      });

      // Determine account name
      let accountName = source.company_name || source.source || source.source_name;
      if (!accountName) {
        accountName = source.industry || source.source_type || `BizDev Source ${String(source.id).substring(0, 8)}`;
      }

      const accountMetadata = {
        ...(source.metadata || {}),
        promoted_from_bizdev_source: source.id,
        promoted_at: new Date().toISOString(),
        original_source: source.source,
        original_source_type: source.source_type,
        original_priority: source.priority,
        notes: source.notes,
        contact_phone: source.contact_phone || source.phone_number,
        contact_email: source.contact_email || source.email,
        dba_name: source.dba_name,
        address: {
          line1: source.address_line_1,
          line2: source.address_line_2,
          city: source.city,
          state: source.state_province,
          postal_code: source.postal_code,
          country: source.country,
        },
        license: {
          industry_license: source.industry_license,
          license_status: source.license_status,
          license_expiry_date: source.license_expiry_date,
        },
      };

      // Create account
      const accountResult = await client.query(
        `INSERT INTO accounts (
          tenant_id, name, type, industry, website, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *`,
        [tenant_id, accountName, 'prospect', source.industry || null, source.website || source.source_url, accountMetadata]
      );
      const newAccount = accountResult.rows[0];

      // Optional contact
      let newContact = null;
      if (source.contact_person) {
        const [firstName, ...lastNameParts] = String(source.contact_person).split(' ');
        const lastName = lastNameParts.join(' ');
        const contactResult = await client.query(
          `INSERT INTO contacts (
            tenant_id, account_id, first_name, last_name, email, phone, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *`,
          [tenant_id, newAccount.id, firstName, lastName || '', source.contact_email, source.contact_phone]
        );
        newContact = contactResult.rows[0];
      }

      // Update bizdev_source link + status
      if (supportsTx) {
        await client.query(
          `UPDATE bizdev_sources SET
            status = 'Promoted',
            account_id = $1,
            account_name = $2,
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{converted_to_account_id}', to_jsonb($1::text)),
            updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [newAccount.id, newAccount.name, id, tenant_id]
        );
      } else {
        const newMetadata = { ...(source.metadata || {}), converted_to_account_id: String(newAccount.id) };
        await client.query(
          `UPDATE bizdev_sources SET
             status = $1,
             account_id = $2,
             account_name = $3,
             metadata = $4,
             updated_at = NOW()
           WHERE id = $5 AND tenant_id = $6`,
          ['Promoted', newAccount.id, newAccount.name, newMetadata, id, tenant_id]
        );
      }

      // Link opportunities (skip in API mode due to JSON/ILIKE filters)
      if (supportsTx) {
        try {
          const linkByMetadata = await client.query(
            `UPDATE opportunities SET account_id = $1, updated_at = NOW()
             WHERE tenant_id = $2 AND account_id IS NULL AND (metadata ->> 'origin_bizdev_source_id') = $3`,
            [newAccount.id, tenant_id, id]
          );
          const linkByDescription = await client.query(
            `UPDATE opportunities SET account_id = $1, updated_at = NOW()
             WHERE tenant_id = $2 AND account_id IS NULL AND description ILIKE $3`,
            [newAccount.id, tenant_id, `%[BizDevSource:${id}]%`]
          );
          console.log('[Promote BizDev Source] Linked opportunities to new account', {
            linked_by_metadata: linkByMetadata.rowCount,
            linked_by_description: linkByDescription.rowCount,
            new_account_id: newAccount.id,
            bizdev_source_id: id,
          });
        } catch (linkErr) {
          console.warn('[Promote BizDev Source] Failed to link opportunities by origin metadata/description', linkErr);
        }
      } else {
        console.warn('[Promote BizDev Source] Skipping opportunity linking in API mode');
      }

      // Relink activities (simple WHERE supported in API mode)
      try {
        await client.query(
          `UPDATE activities SET related_to = $1, related_id = $2
           WHERE tenant_id = $3 AND related_to = 'bizdev_source' AND related_id = $4`,
          ['account', newAccount.id, tenant_id, id]
        );
      } catch (e) {
        console.warn('[Promote BizDev Source] Failed to relink activities', e?.message || e);
      }

      if (delete_source) {
        // Transition log best-effort: use pg-like client when available
        try {
          await logEntityTransition(client, {
            tenant_id,
            from_table: 'bizdev_sources',
            from_id: id,
            to_table: 'accounts',
            to_id: newAccount.id,
            action: 'promote',
            performed_by,
            snapshot: source,
          });
        } catch (e) {
          console.warn('[Promote BizDev Source] Transition log failed (non-fatal):', e?.message || e);
        }
        await client.query('DELETE FROM bizdev_sources WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
      }

      if (supportsTx) {
        await client.query('COMMIT');
      }

      return res.json({
        status: 'success',
        message: 'BizDev source promoted to account',
        data: { account: newAccount, contact: newContact, bizdev_source_id: id }
      });
    } catch (error) {
      if (supportsTx && client) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
      }
      console.error('Error promoting bizdev source:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    } finally {
      if (supportsTx && client && typeof client.release === 'function') {
        try { client.release(); } catch { /* noop */ }
      }
    }
  });

  return router;
}
