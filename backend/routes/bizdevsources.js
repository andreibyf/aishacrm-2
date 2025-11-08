/**
 * BizDev Sources Routes
 * Manage business development lead sources
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createBizDevSourceRoutes(pgPool) {
  const router = express.Router();

  // Get all bizdev sources (with optional filtering)
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, status, source_type, priority } = req.query;
      
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
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
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
        tenant_id,
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

      if (!tenant_id || !source_name) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and source_name are required'
        });
      }

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
      const { tenant_id } = req.query || {};
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
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
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
    try {
      const { id } = req.params;
      const { tenant_id } = req.body;

      console.log('[Promote BizDev Source] Request received:', { id, tenant_id, body: req.body });

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      // Fetch the bizdev source
      const sourceResult = await pgPool.query(
        'SELECT * FROM bizdev_sources WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [id, tenant_id]
      );

      if (sourceResult.rows.length === 0) {
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

      // Validate required fields and create fallback name
      // bizdev_sources table uses: company_name, source (not source_name)
      let accountName = source.company_name || source.source || source.source_name;
      if (!accountName) {
        // Generate fallback name from available data
        accountName = source.industry || source.source_type || `BizDev Source ${source.id.substring(0, 8)}`;
      }

      // Create account from bizdev source
      const accountData = {
        tenant_id,
        name: accountName,
        industry: source.industry || null,
        website: source.website || source.source_url,
        metadata: {
          ...source.metadata,
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
            country: source.country
          },
          license: {
            industry_license: source.industry_license,
            license_status: source.license_status,
            license_expiry_date: source.license_expiry_date
          }
        }
      };

      const accountResult = await pgPool.query(
        `INSERT INTO accounts (
          tenant_id, name, industry, website, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *`,
        [
          accountData.tenant_id,
          accountData.name,
          accountData.industry,
          accountData.website,
          accountData.metadata
        ]
      );

      const newAccount = accountResult.rows[0];

      // Create a contact if we have contact person info
      let newContact = null;
      if (source.contact_person) {
        const [firstName, ...lastNameParts] = source.contact_person.split(' ');
        const lastName = lastNameParts.join(' ');

        const contactResult = await pgPool.query(
          `INSERT INTO contacts (
            tenant_id, account_id, first_name, last_name, email, phone, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *`,
          [
            tenant_id,
            newAccount.id,
            firstName,
            lastName || '',
            source.contact_email,
            source.contact_phone
          ]
        );

        newContact = contactResult.rows[0];
      }

      // Update bizdev source status to 'converted'
      await pgPool.query(
        `UPDATE bizdev_sources SET
          status = 'converted',
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{converted_to_account_id}',
            to_jsonb($1::text)
          ),
          updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
        [newAccount.id, id, tenant_id]
      );

      res.json({
        status: 'success',
        message: 'BizDev source promoted to account',
        data: {
          account: newAccount,
          contact: newContact,
          bizdev_source_id: id
        }
      });
    } catch (error) {
      console.error('Error promoting bizdev source:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
