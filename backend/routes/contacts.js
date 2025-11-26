/**
 * Contact Routes
 * Full CRUD operations with PostgreSQL database
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';

export default function createContactRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/contacts:
   *   get:
   *     summary: List contacts
   *     tags: [contacts]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: status
   *         schema: { type: string, nullable: true }
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
   *         description: Contacts list
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
   *                     contacts:
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
   *                           account_id:
   *                             type: string
   *                             nullable: true
   *                           status:
   *                             type: string
   *                           created_at:
   *                             type: string
   *                             format: date-time
   *   post:
   *     summary: Create contact
   *     tags: [contacts]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *             properties:
   *               tenant_id: { type: string }
   *               first_name: { type: string }
   *               last_name: { type: string }
   *               email: { type: string }
   *               phone: { type: string }
   *               account_id: { type: string, nullable: true }
   *           example:
   *             tenant_id: "550e8400-e29b-41d4-a716-446655440000"
   *             first_name: "Jane"
   *             last_name: "Doe"
   *             email: "jane.doe@example.com"
   *             phone: "+1-555-0123"
   *             account_id: "acc_12345"
   *     responses:
   *       200:
   *         description: Contact created
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
   *                       format: email
   *                     phone:
   *                       type: string
   *                     account_id:
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

  // GET /api/contacts - List contacts
  router.get('/', cacheList('contacts', 180), async (req, res) => {
    try {
      let { tenant_id, status, account_id, filter } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase.from('contacts').select('*', { count: 'exact' }).eq('tenant_id', tenant_id);
      
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
          const orConditions = parsedFilter.$or.map(condition => {
            const [field, opObj] = Object.entries(condition)[0];
            if (opObj && opObj.$icontains) {
              return `${field}.ilike.%${opObj.$icontains}%`;
            }
            return null;
          }).filter(Boolean);
          
          if (orConditions.length > 0) {
            q = q.or(orConditions.join(','));
          }
        }
      }
      
      if (status) q = q.eq('status', status);
      if (account_id) q = q.eq('account_id', account_id);
      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const contacts = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          contacts,
          total: count || 0,
          limit,
          offset
        },
      });
    } catch (error) {
      console.error('Error listing contacts:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/contacts/search - Search contacts by name/email/phone
  /**
   * @openapi
   * /api/contacts/search:
   *   get:
   *     summary: Search contacts
   *     tags: [contacts]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: q
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 25 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Search results
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/search', cacheList('contacts', 180), async (req, res) => {
    try {
      let { tenant_id, q = '' } = req.query;
      const limit = parseInt(req.query.limit || '25', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!q || !q.trim()) {
        return res.status(400).json({ status: 'error', message: 'q is required' });
      }

      const like = `%${q}%`;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error, count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);

      const contacts = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          contacts,
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error('Error searching contacts:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/contacts - Create contact
  router.post('/', invalidateCache('contacts'), async (req, res) => {
    try {
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        title,
        department,
        description,
        account_id,
        status = 'active',
        metadata: incomingMetadata,
        ...otherFields
      } = req.body || {};

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

      // Store title, department, description, and other fields in metadata since they may not be direct columns
      const mergedMetadata = {
        ...(incomingMetadata || {}),
        ...otherFields,
        ...(title !== undefined && title !== null ? { title } : {}),
        ...(department !== undefined && department !== null ? { department } : {}),
        ...(description !== undefined && description !== null ? { description } : {}),
      };

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('contacts')
        .insert([{
          tenant_id,
          first_name,
          last_name,
          email,
          phone,
          account_id: account_id || null,
          status,
          metadata: mergedMetadata,
          created_at: nowIso,
          updated_at: nowIso,
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        message: 'Contact created',
        data: { contact: data },
      });
    } catch (error) {
      console.error('Error creating contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/contacts/:id - Get single contact (tenant required)
  /**
   * @openapi
   * /api/contacts/{id}:
   *   get:
   *     summary: Get contact by ID
   *     tags: [contacts]
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
   *         description: Contact details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update contact
   *     tags: [contacts]
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
   *         description: Contact updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete contact
   *     tags: [contacts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Contact deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }
      if (error) throw new Error(error.message);

      const contact = expandMetadata(data);

      res.json({
        status: 'success',
        data: contact,
      });
    } catch (error) {
      console.error('Error fetching contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/contacts/:id - Update contact
  router.put('/:id', invalidateCache('contacts'), async (req, res) => {
    try {
      const { id } = req.params;
      const { first_name, last_name, email, phone, title, department, description, account_id, status, metadata, ...otherFields } = req.body;

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
        .from('contacts')
        .select('metadata')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      // Store title, department, description in metadata since they may not be direct columns
      const currentMetadata = current?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
        ...(title !== undefined ? { title } : {}),
        ...(department !== undefined ? { department } : {}),
        ...(description !== undefined ? { description } : {}),
      };

      const payload = { metadata: updatedMetadata, updated_at: new Date().toISOString() };
      if (first_name !== undefined) payload.first_name = first_name;
      if (last_name !== undefined) payload.last_name = last_name;
      if (email !== undefined) payload.email = email;
      if (phone !== undefined) payload.phone = phone;
      if (account_id !== undefined) payload.account_id = account_id;
      if (status !== undefined) payload.status = status;

      const { data, error } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }
      if (error) throw new Error(error.message);

      const updatedContact = expandMetadata(data);

      res.json({
        status: 'success',
        message: 'Contact updated',
        data: updatedContact,
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/contacts/:id - Delete contact
  router.delete('/:id', invalidateCache('contacts'), async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Contact not found' });

      res.json({
        status: 'success',
        message: 'Contact deleted',
        data: { id: data.id },
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
