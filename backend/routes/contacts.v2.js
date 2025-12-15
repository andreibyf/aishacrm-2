/**
 * Contacts V2 Routes
 * Streamlined CRUD with flattened metadata fields
 * 
 * @openapi
 * tags:
 *   - name: contacts-v2
 *     description: Contacts API v2 - Streamlined CRUD with flattened metadata
 */

import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { buildContactAiContext } from '../lib/aiContextEnricher.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';
import { sanitizeUuidInput } from '../lib/uuidValidator.js';

export default function createContactV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  /**
   * Flatten metadata fields into top-level properties for consistent API shape
   */
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata, ...rest } = record;
    const metadataObj = metadata && typeof metadata === 'object' ? metadata : {};

    // Flatten common fields - prefer column value, fallback to metadata
    const mobile = rest.mobile ?? metadataObj.mobile ?? null;
    const lead_source = rest.lead_source ?? metadataObj.lead_source ?? null;
    const address_1 = rest.address_1 ?? metadataObj.address_1 ?? null;
    const address_2 = rest.address_2 ?? metadataObj.address_2 ?? null;
    const city = rest.city ?? metadataObj.city ?? null;
    const state = rest.state ?? metadataObj.state ?? null;
    const zip = rest.zip ?? metadataObj.zip ?? null;
    const country = rest.country ?? metadataObj.country ?? null;
    const is_test_data =
      typeof rest.is_test_data === 'boolean'
        ? rest.is_test_data
        : (typeof metadataObj.is_test_data === 'boolean' ? metadataObj.is_test_data : false);
    const tags = Array.isArray(rest.tags)
      ? rest.tags
      : Array.isArray(metadataObj.tags)
        ? metadataObj.tags
        : [];

    return {
      ...metadataObj,
      ...rest,
      mobile,
      lead_source,
      address_1,
      address_2,
      city,
      state,
      zip,
      country,
      is_test_data,
      tags,
      metadata: metadataObj,
    };
  };

  /**
   * @openapi
   * /api/v2/contacts:
   *   get:
   *     summary: List contacts (v2)
   *     tags: [contacts-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: status
   *         schema: { type: string }
   *       - in: query
   *         name: account_id
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Contacts list with flattened metadata
   */
  router.get('/', cacheList('contacts', 180), async (req, res) => {
    try {
      const { tenant_id, status, account_id, filter, assigned_to } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      let q = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Handle filter object
      if (filter) {
        let parsed = filter;
        if (typeof filter === 'string' && filter.startsWith('{')) {
          try {
            parsed = JSON.parse(filter);
          } catch {
            // ignore
          }
        }
        if (parsed && typeof parsed === 'object') {
          if (parsed.status) q = q.eq('status', parsed.status);
          if (parsed.account_id) q = q.eq('account_id', parsed.account_id);
          // Handle is_test_data flag
          if (parsed.is_test_data !== undefined) {
            if (parsed.is_test_data === false) {
              q = q.or('is_test_data.is.false,is_test_data.is.null');
            } else {
              q = q.eq('is_test_data', parsed.is_test_data);
            }
          }
          
          // Handle $or for assigned_to (including NULL)
          if (parsed.$or && Array.isArray(parsed.$or)) {
            const normalizedOr = parsed.$or.filter(c => c && typeof c === 'object');
            const hasUnassigned = normalizedOr.some(c => c.assigned_to === null);
            const assignedVals = normalizedOr
              .map(c => c.assigned_to)
              .filter(v => v !== undefined && v !== null && String(v).trim() !== '');

            if (hasUnassigned && assignedVals.length === 0) {
              q = q.is('assigned_to', null);
            } else if (assignedVals.length > 0) {
              const orParts = assignedVals.map(v => `assigned_to.eq.${v}`);
              q = q.or(orParts.join(','));
            }

            // Preserve any ilike search conditions alongside assigned_to
            const searchOrs = normalizedOr
              .map(condition => {
                const [field, opObj] = Object.entries(condition)[0] || [];
                if (opObj && opObj.$icontains) {
                  return `${field}.ilike.%${opObj.$icontains}%`;
                }
                return null;
              })
              .filter(Boolean);
            if (searchOrs.length > 0) {
              q = q.or(searchOrs.join(','));
            }
          }
        }
      }

      // Apply direct query params
      if (status) q = q.eq('status', status);
      const safeAccountId = sanitizeUuidInput(account_id);
      if (safeAccountId !== undefined && safeAccountId !== null) q = q.eq('account_id', safeAccountId);
      const safeAssignedTo = sanitizeUuidInput(assigned_to);
      if (safeAssignedTo !== undefined && safeAssignedTo !== null) q = q.eq('assigned_to', safeAssignedTo);

      const { data, error, count } = await q;
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
      console.error('Error in v2 contacts list:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/contacts:
   *   post:
   *     summary: Create contact (v2)
   *     tags: [contacts-v2]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               first_name: { type: string }
   *               last_name: { type: string }
   *               email: { type: string, format: email }
   *               phone: { type: string }
   *               mobile: { type: string }
   *               status: { type: string }
   *               account_id: { type: string }
   *               lead_source: { type: string }
   *               tags: { type: array, items: { type: string } }
   *     responses:
   *       201:
   *         description: Contact created
   */
  router.post('/', invalidateCache('contacts'), async (req, res) => {
    try {
      const { tenant_id, metadata, tags, ...payload } = req.body || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const insertPayload = {
        tenant_id,
        ...payload,
        ...(Array.isArray(tags) ? { tags } : {}),
        metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
      };

      const { data, error } = await supabase
        .from('contacts')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      const created = expandMetadata(data);
      const aiContext = await buildContactAiContext(created, {});
      
      res.status(201).json({
        status: 'success',
        data: { contact: created, aiContext },
      });
    } catch (error) {
      console.error('Error in v2 contact create:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/contacts/{id}:
   *   get:
   *     summary: Get contact by ID (v2)
   *     tags: [contacts-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Contact details
   *       404:
   *         description: Contact not found
   */
  router.get('/:id', cacheDetail('contacts', 300), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

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
      const aiContext = await buildContactAiContext(contact, {});
      
      res.json({ status: 'success', data: { contact, aiContext } });
    } catch (error) {
      console.error('Error in v2 contact get:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/contacts/{id}:
   *   put:
   *     summary: Update contact (v2)
   *     tags: [contacts-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               first_name: { type: string }
   *               last_name: { type: string }
   *               email: { type: string }
   *               phone: { type: string }
   *               status: { type: string }
   *               tags: { type: array, items: { type: string } }
   *     responses:
   *       200:
   *         description: Contact updated
   *       404:
   *         description: Contact not found
   */
  router.put('/:id', invalidateCache('contacts'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, metadata, tags, ...payload } = req.body || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Build update payload
      const updatePayload = {
        ...payload,
        ...(Array.isArray(tags) ? { tags } : {}),
      };

      // Fetch existing metadata to merge
      const { data: current, error: fetchErr } = await supabase
        .from('contacts')
        .select('metadata')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      // Merge metadata
      const existingMeta = current?.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      const mergedMeta = {
        ...existingMeta,
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      };
      updatePayload.metadata = mergedMeta;

      const { data, error } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }
      if (error) throw new Error(error.message);

      const updated = expandMetadata(data);
      res.json({ status: 'success', data: { contact: updated } });
    } catch (error) {
      console.error('Error in v2 contact update:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/contacts/{id}:
   *   delete:
   *     summary: Delete contact (v2)
   *     tags: [contacts-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Contact deleted
   *       404:
   *         description: Contact not found
   */
  router.delete('/:id', invalidateCache('contacts'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Contact not found' });
      }

      res.json({ status: 'success', message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('Error in v2 contact delete:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
