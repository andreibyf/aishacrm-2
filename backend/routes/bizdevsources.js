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
import {
  getOrCreatePlaceholderB2CAccount,
  createPersonFromBizDev,
  findOrCreateB2BAccountFromBizDev,
  buildLeadProvenanceMetadata,
  determineLeadType
} from '../utils/promotionHelpers.js';

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
      const { status, source_type, priority } = req.query;

      // Enforce tenant isolation - support both middleware tenant and query param
      const tenant_id = req.tenant?.id || req.query.tenant_id;
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }
      
      let query = supabase
        .from('bizdev_sources')
        .select('*')
        .eq('tenant_id', tenant_id)  // Always enforce tenant scoping
        .order('created_at', { ascending: false });

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

      // Map 'source' column to 'source_name' for frontend compatibility
      const mappedData = (data || []).map(row => ({
        ...row,
        source_name: row.source || row.source_name
      }));

      res.json({
        status: 'success',
        data: { bizdevsources: mappedData }
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

      // Map 'source' column to 'source_name' for frontend compatibility
      res.json({
        status: 'success',
        data: { ...data, source_name: data.source || data.source_name }
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
        source_name,  // Frontend may send this
        source,       // Production DB uses this column name
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
        // Company/Address fields from v3 form
        company_name,
        batch_id,
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
        lead_ids,
        industry_license,
        license_status,
        license_expiry_date
      } = req.body;

      // Accept either 'source' or 'source_name' from frontend
      const sourceValue = source || source_name;

      if (!incomingTenantId || !sourceValue) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and source (or source_name) are required'
        });
      }

      const tenant_id = incomingTenantId;

      // Use Supabase client - production DB column is 'source' not 'source_name'
      const { data, error } = await supabase
        .from('bizdev_sources')
        .insert({
          tenant_id,
          source: sourceValue,
          source_type,
          source_url,
          contact_person,
          contact_email: contact_email || email,
          contact_phone: contact_phone || phone_number,
          status: status || 'active',
          priority: priority || 'medium',
          leads_generated: leads_generated || 0,
          opportunities_created: opportunities_created || 0,
          revenue_generated: revenue_generated || 0,
          notes,
          tags: tags || [],
          metadata: metadata || {},
          is_test_data: is_test_data || false,
          // Company/Address fields
          company_name,
          batch_id,
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
          lead_ids: Array.isArray(lead_ids) ? lead_ids : (lead_ids ? JSON.parse(lead_ids) : []),
          industry_license,
          license_status,
          license_expiry_date
        })
        .select()
        .single();

      if (error) throw error;

      // Return with source_name for frontend compatibility
      res.status(201).json({
        status: 'success',
        data: { ...data, source_name: data.source }
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
        source_name,  // Frontend may send this
        source,       // Production DB uses this column name
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

      // Accept either 'source' or 'source_name' from frontend
      const sourceValue = source || source_name;

      // Build update object with only defined values
      const updateObj = {};
      if (sourceValue !== undefined) updateObj.source = sourceValue;
      if (source_type !== undefined) updateObj.source_type = source_type;
      if (source_url !== undefined) updateObj.source_url = source_url;
      if (contact_person !== undefined) updateObj.contact_person = contact_person;
      if (contact_email !== undefined) updateObj.contact_email = contact_email;
      if (contact_phone !== undefined) updateObj.contact_phone = contact_phone;
      if (status !== undefined) updateObj.status = status;
      if (priority !== undefined) updateObj.priority = priority;
      if (leads_generated !== undefined) updateObj.leads_generated = leads_generated;
      if (opportunities_created !== undefined) updateObj.opportunities_created = opportunities_created;
      if (revenue_generated !== undefined) updateObj.revenue_generated = revenue_generated;
      if (notes !== undefined) updateObj.notes = notes;
      if (tags !== undefined) updateObj.tags = tags;
      if (metadata !== undefined) updateObj.metadata = metadata;
      if (is_test_data !== undefined) updateObj.is_test_data = is_test_data;
      if (company_name !== undefined) updateObj.company_name = company_name;
      if (dba_name !== undefined) updateObj.dba_name = dba_name;
      if (industry !== undefined) updateObj.industry = industry;
      if (website !== undefined) updateObj.website = website;
      if (email !== undefined) updateObj.email = email;
      if (phone_number !== undefined) updateObj.phone_number = phone_number;
      if (address_line_1 !== undefined) updateObj.address_line_1 = address_line_1;
      if (address_line_2 !== undefined) updateObj.address_line_2 = address_line_2;
      if (city !== undefined) updateObj.city = city;
      if (state_province !== undefined) updateObj.state_province = state_province;
      if (postal_code !== undefined) updateObj.postal_code = postal_code;
      if (country !== undefined) updateObj.country = country;
      if (batch_id !== undefined) updateObj.batch_id = batch_id;
      if (industry_license !== undefined) updateObj.industry_license = industry_license;
      if (license_status !== undefined) updateObj.license_status = license_status;
      if (license_expiry_date !== undefined) updateObj.license_expiry_date = license_expiry_date;
      updateObj.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('bizdev_sources')
        .update(updateObj)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      // Map 'source' column to 'source_name' for frontend compatibility
      res.json({
        status: 'success',
        data: { ...data, source_name: data.source || data.source_name }
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

      const { data, error } = await supabase
        .from('bizdev_sources')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'BizDev source not found'
        });
      }

      const deletedData = data[0];

      res.json({
        status: 'success',
        message: 'BizDev source deleted',
        data: { ...deletedData, source_name: deletedData.source || deletedData.source_name }
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
   *     summary: Promote BizDev source to Lead
   *     description: Converts a BizDev source into a Lead (v3.0.0 workflow). Creates Account and optionally Person profile, then creates Lead with provenance metadata.
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
  // POST /api/bizdevsources/:id/promote - Promote bizdev source to Lead (v3.0.0 normalized architecture)
  // v3.0.0 Architecture:
  // - Create Lead (minimal: tenant_id, title, account_id, person_id, lead_type)
  // - Create/link Account (B2B company or B2C placeholder)
  // - Create/link person_profile (B2C requirement or contact person for B2B)
  // - Store BizDev provenance via: leads.promoted_from_bizdev_source_id + leads.metadata
  router.post('/:id/promote', invalidateCache('bizdevsources'), invalidateCache('leads'), invalidateCache('accounts'), async (req, res) => {
    const supportsTx = typeof pgPool.connect === 'function';
    let client = null;
    try {
      const { id } = req.params;
      const { tenant_id: incomingTenantId, performed_by, delete_source = false, client_type = 'B2B' } = req.body;
      const tenant_id = incomingTenantId;

      console.log('[Promote BizDev → Lead v3.0.0] Request:', { id, tenant_id, client_type });

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      if (supportsTx) {
        client = await pgPool.connect();
      } else {
        client = { query: (...args) => pgPool.query(...args), release: () => {} };
      }

      if (supportsTx) await client.query('BEGIN');

      // ========== STEP 1: Fetch BizDev Source ==========
      const selectSql = supportsTx
        ? 'SELECT * FROM bizdev_sources WHERE id = $1 AND tenant_id = $2 FOR UPDATE'
        : 'SELECT * FROM bizdev_sources WHERE id = $1 AND tenant_id = $2';
      const sourceResult = await client.query(selectSql, [id, tenant_id]);

      if (sourceResult.rows.length === 0) {
        if (supportsTx) await client.query('ROLLBACK').catch(() => {});
        return res.status(404).json({ status: 'error', message: 'BizDev source not found' });
      }

      const bizdevSource = sourceResult.rows[0];
      console.log('[Promote] BizDev Source fetched:', {
        company_name: bizdevSource.company_name,
        contact_person: bizdevSource.contact_person
      });

      // ========== STEP 2: Determine lead_type and create Account ==========
      // Fetch tenant's business_model to determine lead type (B2C/B2B)
      let tenantBusinessModel = client_type;
      try {
        const tenantResult = await client.query(
          'SELECT business_model FROM tenant WHERE id = $1',
          [tenant_id]
        );
        if (tenantResult.rows.length > 0 && tenantResult.rows[0].business_model) {
          tenantBusinessModel = tenantResult.rows[0].business_model;
          console.log('[Promote] Tenant business_model:', tenantBusinessModel);
        }
      } catch (_e) {
        console.warn('[Promote] Failed to fetch tenant business_model, using default:', tenantBusinessModel);
      }

      const hasCompanyData = !!(bizdevSource.company_name || bizdevSource.dba_name);
      const leadType = determineLeadType(tenantBusinessModel, hasCompanyData);
      
      let accountId;
      let personId = null;

      if (leadType === 'b2c') {
        // B2C: Create person_profile, link to placeholder B2C account
        console.log('[Promote] Creating B2C Lead flow');
        
        // Get or create placeholder B2C account
        const b2cAccountResult = await getOrCreatePlaceholderB2CAccount(client, tenant_id);
        accountId = b2cAccountResult.id;
        console.log('[Promote] Using placeholder B2C account:', accountId);

        // Create person_profile from contact data
        const personResult = await createPersonFromBizDev(client, tenant_id, bizdevSource);
        personId = personResult.id;
        console.log('[Promote] Created person_profile:', personId);
      } else {
        // B2B: Create or find B2B company account
        console.log('[Promote] Creating B2B Lead flow');
        
        const accountResult = await findOrCreateB2BAccountFromBizDev(client, tenant_id, bizdevSource);
        accountId = accountResult.id;
        console.log('[Promote] Using/created B2B account:', accountId);
      }

      // ========== STEP 3: Build Lead metadata with provenance ==========
      const leadMetadata = buildLeadProvenanceMetadata(bizdevSource);

      // ========== STEP 4: Create Lead in normalized schema ==========
      // v3.0.0 Lead schema: (tenant_id, account_id, person_id [B2C only], lead_type, + contact fields, metadata)
      // Contact fields populated from BizDev Source for downstream conversion flow
      
      // Extract contact name - try contact_person, then split email username
      let firstName = null, lastName = null;
      if (bizdevSource.contact_person) {
        const [first, ...rest] = bizdevSource.contact_person.split(' ');
        firstName = first;
        lastName = rest.join(' ') || null;
      } else if (bizdevSource.contact_email) {
        firstName = bizdevSource.contact_email.split('@')[0]; // Fallback: email prefix
      }

      const leadInsertSql = leadType === 'b2c'
        ? `INSERT INTO leads (tenant_id, account_id, person_id, lead_type, first_name, last_name, email, phone, source, address_1, address_2, city, state, zip, country, created_date, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING *`
        : `INSERT INTO leads (tenant_id, account_id, lead_type, first_name, last_name, email, phone, company, source, address_1, address_2, city, state, zip, country, created_date, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING *`;

      const leadParams = leadType === 'b2c'
        ? [tenant_id, accountId, personId, leadType, firstName, lastName, bizdevSource.contact_email, bizdevSource.contact_phone, bizdevSource.source || bizdevSource.source_type, bizdevSource.address_line_1, bizdevSource.address_line_2, bizdevSource.city, bizdevSource.state_province, bizdevSource.postal_code, bizdevSource.country, bizdevSource.created_date || new Date().toISOString(), JSON.stringify(leadMetadata)]
        : [tenant_id, accountId, leadType, firstName, lastName, bizdevSource.contact_email, bizdevSource.contact_phone, bizdevSource.company_name, bizdevSource.source || bizdevSource.source_type, bizdevSource.address_line_1, bizdevSource.address_line_2, bizdevSource.city, bizdevSource.state_province, bizdevSource.postal_code, bizdevSource.country, bizdevSource.created_date || new Date().toISOString(), JSON.stringify(leadMetadata)];

      const leadResult = await client.query(leadInsertSql, leadParams);
      const newLead = leadResult.rows[0];
      console.log('[Promote] Lead created:', { lead_id: newLead.id, lead_type: leadType });

      // ========== STEP 5: Update BizDev Source status and link (provenance stored in lead metadata) ==========
      const updateBizDevSql = `UPDATE bizdev_sources SET
            status = $1,
            metadata = $2,
            updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`;

      const updatedBizdevMetadata = {
        ...bizdevSource.metadata,
        promoted_to_lead_id: newLead.id,
        promoted_at: new Date().toISOString(),
        promoted_account_id: accountId,
        promoted_person_id: personId,
        promoted_lead_type: leadType
      };

      await client.query(updateBizDevSql, ['Promoted', JSON.stringify(updatedBizdevMetadata), id, tenant_id]);
      console.log('[Promote] BizDev Source marked as Promoted');

      // ========== STEP 6: Relink activities ==========
      try {
        await client.query(
          `UPDATE activities SET related_to = $1, related_id = $2, updated_at = NOW()
           WHERE tenant_id = $3 AND related_to = 'bizdev_source' AND related_id = $4`,
          ['lead', newLead.id, tenant_id, id]
        );
      } catch (e) {
        console.warn('[Promote] Activity relink failed (non-fatal):', e?.message);
      }

      // ========== STEP 7: Optionally delete BizDev Source ==========
      if (delete_source) {
        try {
          await logEntityTransition(client, {
            tenant_id,
            from_table: 'bizdev_sources',
            from_id: id,
            to_table: 'leads',
            to_id: newLead.id,
            action: 'promote',
            performed_by,
            snapshot: bizdevSource
          });
        } catch (e) {
          console.warn('[Promote] Transition log failed (non-fatal):', e?.message);
        }
        await client.query('DELETE FROM bizdev_sources WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
        console.log('[Promote] BizDev Source deleted');
      }

      if (supportsTx) await client.query('COMMIT');

      // Fetch the account object to return to frontend
      const accountSelect = supportsTx
        ? 'SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2'
        : 'SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2';
      const accountResult = await client.query(accountSelect, [accountId, tenant_id]);
      const account = accountResult.rows[0] || null;

      return res.json({
        status: 'success',
        message: `BizDev Source promoted to ${leadType.toUpperCase()} Lead`,
        data: {
          lead: newLead,
          account: account,
          bizdev_source_id: id,
          account_id: accountId,
          person_id: personId,
          lead_type: leadType
        }
      });
    } catch (error) {
      if (supportsTx && client) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
      }
      console.error('[Promote] Error:', error);
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
