/**
 * Notes Routes
 * CRUD operations for notes attached to entities
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createNoteRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/notes:
   *   get:
   *     summary: List notes
   *     description: Returns a paginated list of notes filtered by tenant and optional relation.
   *     tags: [notes]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: related_type
   *         schema:
   *           type: string
   *       - in: query
   *         name: related_id
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 200
   *         description: Page size (default 50)
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *         description: Pagination offset (default 0)
   *     responses:
   *       200:
   *         description: List of notes
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/notes - List notes
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, related_type, related_id } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase.from('note').select('*', { count: 'exact' });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      if (related_type) q = q.eq('related_type', related_type);
      if (related_id) q = q.eq('related_id', related_id);
      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      res.json({ status: 'success', data: { notes: data || [], total: count || 0 } });
    } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/notes/{id}:
   *   get:
   *     summary: Get a note
   *     description: Returns a single note by ID within the tenant scope.
   *     tags: [notes]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: true
   *     responses:
   *       200:
   *         description: Note details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/notes/:id - Get single note (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('note')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') return res.status(404).json({ status: 'error', message: 'Not found' });
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { note: data } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/notes:
   *   post:
   *     summary: Create a note
   *     description: Creates a note scoped to a tenant and optionally related to an entity.
   *     tags: [notes]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, content]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               title:
   *                 type: string
   *               content:
   *                 type: string
   *               related_type:
   *                 type: string
   *               related_id:
   *                 type: string
   *               created_by:
   *                 type: string
   *               metadata:
   *                 type: object
   *     responses:
   *       201:
   *         description: Note created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing required fields
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/notes - Create note
  router.post('/', async (req, res) => {
    try {
      const n = req.body;
      if (!n.tenant_id || !n.content) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and content required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('note')
        .insert([{
          tenant_id: n.tenant_id,
          title: n.title || null,
          content: n.content,
          related_type: n.related_type || null,
          related_id: n.related_id || null,
          created_by: n.created_by || null,
          metadata: n.metadata || {},
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      
      // AI MEMORY INGESTION (async, non-blocking)
      if (data) {
        import('../lib/aiMemory/index.js')
          .then(({ upsertMemoryChunks }) => {
            const noteText = `${data.title || 'Note'}: ${data.content}`;
            return upsertMemoryChunks({
              tenantId: data.tenant_id,
              content: noteText,
              sourceType: 'note',
              entityType: data.related_type,
              entityId: data.related_id,
              metadata: { noteId: data.id, createdBy: data.created_by }
            });
          })
          .catch(err => {
            console.error('[NOTE_MEMORY_INGESTION] Failed:', err.message);
          });
      }
      
      res.status(201).json({ status: 'success', message: 'Created', data: { note: data } });
    } catch (error) {
      console.error('Error creating note:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/notes/{id}:
   *   put:
   *     summary: Update a note
   *     description: Updates allowed fields on a note within the tenant scope.
   *     tags: [notes]
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
   *               title:
   *                 type: string
   *               content:
   *                 type: string
   *               related_type:
   *                 type: string
   *               related_id:
   *                 type: string
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Note updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: No valid fields
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // PUT /api/notes/:id - Update note (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      const u = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const allowed = ['title', 'content', 'related_type', 'related_id', 'metadata'];
      const payload = { updated_at: new Date().toISOString() };
      Object.entries(u).forEach(([k, v]) => {
        if (allowed.includes(k)) payload[k] = v;
      });
      if (Object.keys(payload).length === 1) return res.status(400).json({ status: 'error', message: 'No valid fields' });

      const { data, error } = await supabase
        .from('note')
        .update(payload)
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') return res.status(404).json({ status: 'error', message: 'Not found' });
      if (error) throw new Error(error.message);
      
      // AI MEMORY INGESTION (async, non-blocking)
      if (data && data.content) {
        import('../lib/aiMemory/index.js')
          .then(({ upsertMemoryChunks }) => {
            const noteText = `${data.title || 'Note'}: ${data.content}`;
            return upsertMemoryChunks({
              tenantId: data.tenant_id,
              content: noteText,
              sourceType: 'note',
              entityType: data.related_type,
              entityId: data.related_id,
              metadata: { noteId: data.id, createdBy: data.created_by }
            });
          })
          .catch(err => {
            console.error('[NOTE_MEMORY_INGESTION] Failed:', err.message);
          });
      }
      
      res.json({ status: 'success', message: 'Updated', data: { note: data } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/notes/{id}:
   *   delete:
   *     summary: Delete a note
   *     description: Deletes a note within the tenant scope.
   *     tags: [notes]
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
   *         description: Note deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // DELETE /api/notes/:id - Delete note (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('note')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Deleted', data: { id: data.id } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
