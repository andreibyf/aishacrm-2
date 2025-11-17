/**
 * SyncHealth Routes
 * CRUD operations for sync health monitoring
 */

import express from "express";
import { validateTenantAccess } from "../middleware/validateTenant.js";

export default function createSyncHealthRoutes(_pgPool) {
    const router = express.Router();

    // Apply tenant validation to all routes
    router.use(validateTenantAccess);

    // GET /api/synchealths - List sync health records
    router.get("/", async (req, res) => {
        try {
            const { tenant_id, limit = 50, offset = 0 } = req.query;

            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supabase = getSupabaseClient();
            let query = supabase
                .from('synchealth')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

            if (tenant_id) {
                query = query.eq('tenant_id', tenant_id);
            }

            const { data, error, count } = await query;
            if (error) throw new Error(error.message);

            res.json({
                status: 'success',
                data: { synchealths: data || [], total: count || 0 }
            });
        } catch (error) {
            console.error("Error fetching sync health records:", error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // GET /api/synchealths/:id - Get single sync health record
    router.get("/:id", async (req, res) => {
        try {
            const { id } = req.params;
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('synchealth')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') throw new Error(error.message);
            if (!data) {
                return res.status(404).json({ status: 'error', message: 'SyncHealth record not found' });
            }
            res.json({ status: 'success', data });
        } catch (error) {
            console.error("Error fetching sync health record:", error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // POST /api/synchealths - Create sync health record
    router.post("/", async (req, res) => {
        try {
            const { tenant_id, status, last_sync, error_message, ...rest } =
                req.body;

            if (!tenant_id) {
                return res.status(400).json({ status: 'error', message: "tenant_id is required" });
            }
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supabase = getSupabaseClient();
            const nowIso = new Date().toISOString();
            const payload = {
                tenant_id,
                status: status || 'unknown',
                last_sync: last_sync || null,
                error_message: error_message || null,
                metadata: Object.keys(rest).length ? rest : null,
                created_at: nowIso,
                created_date: nowIso,
            };
            const { data, error } = await supabase
                .from('synchealth')
                .insert([payload])
                .select('*')
                .single();
            if (error) throw new Error(error.message);
            res.status(201).json({ status: 'success', data });
        } catch (error) {
            console.error("Error creating sync health record:", error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // PUT /api/synchealths/:id - Update sync health record
    router.put("/:id", async (req, res) => {
        try {
            const { id } = req.params;
            const { status, last_sync, error_message, ...rest } = req.body;
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supabase = getSupabaseClient();
            const payload = {};
            if (status !== undefined) payload.status = status;
            if (last_sync !== undefined) payload.last_sync = last_sync;
            if (error_message !== undefined) payload.error_message = error_message;
            if (Object.keys(rest).length) payload.metadata = rest;

            if (Object.keys(payload).length === 0) {
                return res.status(400).json({ status: 'error', message: 'No fields to update' });
            }

            const { data, error } = await supabase
                .from('synchealth')
                .update(payload)
                .eq('id', id)
                .select('*')
                .maybeSingle();
            if (error && error.code !== 'PGRST116') throw new Error(error.message);
            if (!data) {
                return res.status(404).json({ status: 'error', message: 'SyncHealth record not found' });
            }
            res.json({ status: 'success', data });
        } catch (error) {
            console.error("Error updating sync health record:", error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // DELETE /api/synchealths/:id - Delete sync health record
    router.delete("/:id", async (req, res) => {
        try {
            const { id } = req.params;
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('synchealth')
                .delete()
                .eq('id', id)
                .select('*')
                .maybeSingle();
            if (error && error.code !== 'PGRST116') throw new Error(error.message);
            if (!data) {
                return res.status(404).json({ status: 'error', message: 'SyncHealth record not found' });
            }
            res.json({ status: 'success', message: "SyncHealth record deleted", id, data });
        } catch (error) {
            console.error("Error deleting sync health record:", error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}
