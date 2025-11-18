/**
 * BizDev Sources Routes
 * Manage business development lead sources
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';
import { logEntityTransition } from '../lib/transitions.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';

export default function createBizDevSourceRoutes(pgPool) {
  const router = express.Router();
  const supabase = getSupabaseClient();

  // Enforce tenant scoping and defaults
  router.use(validateTenantAccess);

  /**
   * @openapi
   * /api/bizdevsources:
   *   get:
   *     summary: List BizDev sources
   *     description: Returns BizDev sources with optional filtering.
   *     tags: [bizdevsources]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *       - in: query
   *         name: source_type
   *         schema:
   *           type: string
   *       - in: query
   *         name: priority
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of BizDev sources
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // Get all bizdev sources (with optional filtering)
  router.get('/', cacheList('bizdevsources', 180), async (req, res) => {
    try {
      let { tenant_id, status, source_type, priority } = req.query;

      // Accept UUID or slug; normalize to slug for legacy columns
      
      let query = supabase
        .from('bizdev_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }

      if (status) {
        query = query.eq('status', status);
      }

      if (source_type) {
        query = query.eq('source_type', source_type);
      }

      if (priority) {
        query = query.eq('priority', priority);
      }

      const { data, error } = await query;

      if (error) throw error;

      res.json({
        status: 'success',
        data: { bizdevsources: data || [] }
      });
    } catch (error) {
      console.error('Error fetching bizdev sources:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * @openapi
   * /api/bizdevsources/{id}:
   *   get:
   *     summary: Get BizDev source by ID
   *     description: Retrieves a BizDev source by ID for a tenant.
   *     tags: [bizdevsources]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: BizDev source details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // Get single bizdev source by ID (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      // Accept UUID or slug; normalize to slug for legacy columns
      
      const { data, error } = await supabase
        .from('bizdev_sources')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      // Safety check
      if (data.tenant_id !== tenant_id) {
        return res.status(404).json({ status: 'error', message: 'BizDev source not found' });
      }

      res.json({
        status: 'success',
        data
      });
    } catch (error) {
      console.error('Error fetching bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * @openapi
   * /api/bizdevsources:
   *   post:
   *     summary: Create a BizDev source
   *     description: Creates a new BizDev source for a tenant.
   *     tags: [bizdevsources]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, source_name]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               source_name:
   *                 type: string
   *               source_type:
   *                 type: string
   *               source_url:
   *                 type: string
   *               contact_person:
   *                 type: string
   *               contact_email:
   *                 type: string
   *               contact_phone:
   *                 type: string
   *               status:
   *                 type: string
   *               priority:
   *                 type: string
   *               leads_generated:
   *                 type: integer
   *               opportunities_created:
   *                 type: integer
   *               revenue_generated:
   *                 type: number
   *               notes:
   *                 type: string
   *               tags:
   *                 type: array
   *                 items:
   *                   type: string
   *               metadata:
   *                 type: object
   *               is_test_data:
   *                 type: boolean
   *     responses:
   *       201:
   *         description: BizDev source created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // Create new bizdev source
  router.post('/', invalidateCache('bizdevsources'), async (req, res) => {
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

      const tenant_id = incomingTenantId;

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

  /**
   * @openapi
   * /api/bizdevsources/{id}:
   *   put:
   *     summary: Update a BizDev source
   *     description: Updates a BizDev source by ID for a tenant.
   *     tags: [bizdevsources]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               source_name:
   *                 type: string
   *               source_type:
   *                 type: string
   *               source_url:
   *                 type: string
   *               contact_person:
   *                 type: string
   *               contact_email:
   *                 type: string
   *               contact_phone:
   *                 type: string
   *               status:
   *                 type: string
   *               priority:
   *                 type: string
   *               leads_generated:
   *                 type: integer
   *               opportunities_created:
   *                 type: integer
   *               revenue_generated:
   *                 type: number
   *               notes:
   *                 type: string
   *               tags:
   *                 type: array
   *                 items:
   *                   type: string
   *               metadata:
   *                 type: object
   *               is_test_data:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: BizDev source updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // Update bizdev source (tenant scoped)
  router.put('/:id', invalidateCache('bizdevsources'), async (req, res) => {
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
        is_test_data,
        // Company information fields
        company_name,
        dba_name,
        industry,
        website,
        email,
        phone_number,
        address_line_1,
        address_line_2,
        city,
        state_province,
        postal_code,
        country,
        batch_id,
        industry_license,
        license_status,
        license_expiry_date
      } = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      // Accept UUID or slug; normalize to slug for legacy columns

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
          company_name = COALESCE($16, company_name),
          dba_name = COALESCE($17, dba_name),
          industry = COALESCE($18, industry),
          website = COALESCE($19, website),
          email = COALESCE($20, email),
          phone_number = COALESCE($21, phone_number),
          address_line_1 = COALESCE($22, address_line_1),
          address_line_2 = COALESCE($23, address_line_2),
          city = COALESCE($24, city),
          state_province = COALESCE($25, state_province),
          postal_code = COALESCE($26, postal_code),
          country = COALESCE($27, country),
          batch_id = COALESCE($28, batch_id),
          industry_license = COALESCE($29, industry_license),
          license_status = COALESCE($30, license_status),
          license_expiry_date = COALESCE($31, license_expiry_date),
          updated_at = now()
        WHERE tenant_id = $32 AND id = $33
        RETURNING *`,
        [
          source_name, source_type, source_url, contact_person,
          contact_email, contact_phone, status, priority,
          leads_generated, opportunities_created, revenue_generated,
          notes, tags ? JSON.stringify(tags) : null,
          metadata ? JSON.stringify(metadata) : null,
          is_test_data,
          company_name, dba_name, industry, website, email, phone_number,
          address_line_1, address_line_2, city, state_province, postal_code, country,
          batch_id, industry_license, license_status, license_expiry_date,
          tenant_id, id
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

  /**
   * @openapi
   * /api/bizdevsources/{id}:
   *   delete:
   *     summary: Delete a BizDev source
   *     description: Deletes a BizDev source by ID for a tenant.
   *     tags: [bizdevsources]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: BizDev source deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // Delete bizdev source (tenant scoped)
  router.delete('/:id', invalidateCache('bizdevsources'), async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      // Accept UUID or slug; normalize to slug for legacy columns
      
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

  /**
   * @openapi
   * /api/bizdevsources/{id}/promote:
   *   post:
   *     summary: Promote BizDev source to account
   *     description: Converts a BizDev source into an account and optionally deletes the source.
   *     tags: [bizdevsources]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               performed_by:
   *                 type: string
   *               delete_source:
   *                 type: boolean
   *                 default: false
   *     responses:
   *       200:
   *         description: Promotion completed
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/bizdevsources/:id/promote - Promote bizdev source to account
  router.post('/:id/promote', invalidateCache('bizdevsources'), async (req, res) => {
    const supportsTx = typeof pgPool.connect === 'function';
    let client = null;
    try {
  const { id } = req.params;
  // Default delete_source to false to retain promoted sources for UX (grayed out + stats)
  const { tenant_id: incomingTenantId, performed_by, delete_source = false } = req.body;

      const tenant_id = incomingTenantId;

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
        const phoneValue = source.contact_phone || source.phone_number;
        const emailValue = source.contact_email || source.email;
        const contactResult = await client.query(
          `INSERT INTO contacts (
            tenant_id, account_id, first_name, last_name, email, phone, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *`,
          [tenant_id, newAccount.id, firstName, lastName || '', emailValue, phoneValue]
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

  /**
   * @openapi
   * /api/bizdevsources/archive:
   *   post:
   *     summary: Archive BizDev sources to cloud storage
   *     description: Archives selected BizDev sources by marking them as archived and optionally exporting data.
   *     tags: [bizdevsources]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [bizdev_source_ids, tenant_id]
   *             properties:
   *               bizdev_source_ids:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: uuid
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               format:
   *                 type: string
   *                 enum: [csv, json]
   *                 default: csv
   *               compress:
   *                 type: boolean
   *                 default: true
   *               remove_after_archive:
   *                 type: boolean
   *                 default: false
   *     responses:
   *       200:
   *         description: Sources archived successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post('/archive', invalidateCache('bizdevsources'), async (req, res) => {
    try {
      const {
        bizdev_source_ids,
        tenant_id: incomingTenantId,
        format = 'csv',
        compress = true,
        remove_after_archive = false
      } = req.body;

      if (!incomingTenantId) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      if (!bizdev_source_ids || !Array.isArray(bizdev_source_ids) || bizdev_source_ids.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'bizdev_source_ids array is required'
        });
      }

      const tenant_id = incomingTenantId;

      // Update sources to mark as archived
      const placeholders = bizdev_source_ids.map((_, i) => `$${i + 2}`).join(',');
      const updateResult = await pgPool.query(
        `UPDATE bizdev_sources 
         SET status = 'Archived', 
             archived_at = NOW(),
             updated_at = NOW()
         WHERE tenant_id = $1 AND id IN (${placeholders})
         RETURNING *`,
        [tenant_id, ...bizdev_source_ids]
      );

      const archivedSources = updateResult.rows;

      // If remove_after_archive is true, clear large text fields
      if (remove_after_archive && archivedSources.length > 0) {
        const ids = archivedSources.map(s => s.id);
        const idPlaceholders = ids.map((_, i) => `$${i + 2}`).join(',');
        await pgPool.query(
          `UPDATE bizdev_sources 
           SET notes = NULL,
               metadata = COALESCE(metadata, '{}'::jsonb) || '{"minimized": true}'::jsonb
           WHERE tenant_id = $1 AND id IN (${idPlaceholders})`,
          [tenant_id, ...ids]
        );
      }

      // TODO: In future, implement actual export to R2/cloud storage here
      // For now, just mark as archived in database
      const archiveData = {
        success: true,
        archived_count: archivedSources.length,
        format,
        compress,
        timestamp: new Date().toISOString(),
        storage_path: `archives/bizdev-sources/${new Date().toISOString().split('T')[0]}`
      };

      res.json({
        status: 'success',
        message: `Successfully archived ${archivedSources.length} BizDev source(s)`,
        data: archiveData
      });
    } catch (error) {
      console.error('Error archiving bizdev sources:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
