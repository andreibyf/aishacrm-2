/**
 * Tenant Routes
 * CRUD operations for tenants
 */

import express from "express";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "tenant-assets";
}

export default function createTenantRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/tenants - List tenants
  router.get("/", async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, status } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const lim = parseInt(limit);
      const off = parseInt(offset);
      const from = off;
      const to = off + lim - 1;

      let q = supabase
        .from('tenant')
        .select('*', { count: 'exact', head: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      if (status) q = q.eq('status', status);

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      // Normalize tenant rows to expose common branding fields from branding_settings/metadata
      const tenants = (data || []).map((r) => ({
        ...r,
        logo_url: r.branding_settings?.logo_url || r.metadata?.logo_url || null,
        primary_color: r.branding_settings?.primary_color ||
          r.metadata?.primary_color || null,
        accent_color: r.branding_settings?.accent_color ||
          r.metadata?.accent_color || null,
        settings: r.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: r.metadata?.country || "",
        major_city: r.metadata?.major_city || "",
        industry: r.metadata?.industry || "other",
        business_model: r.metadata?.business_model || "b2b",
        geographic_focus: r.metadata?.geographic_focus || "north_america",
        elevenlabs_agent_id: r.metadata?.elevenlabs_agent_id || "",
        display_order: r.metadata?.display_order ?? 0,
        domain: r.metadata?.domain || "",
      }));

      res.json({
        status: "success",
        data: {
          tenants,
          total: typeof count === 'number' ? count : tenants.length,
          limit: lim,
          offset: off,
        },
      });
    } catch (error) {
      console.error("Error listing tenants:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/tenants - Create tenant
  router.post("/", async (req, res) => {
    try {
      const {
        tenant_id,
        name,
        branding_settings,
        status,
        metadata,
        // Individual branding fields
        logo_url,
        primary_color,
        accent_color,
        // Individual metadata fields
        country,
        major_city,
        industry,
        business_model,
        geographic_focus,
        elevenlabs_agent_id,
        display_order,
        domain,
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({
          status: "error",
          message: "tenant_id is required",
        });
      }
      // Build branding_settings from individual fields or use provided object
      const finalBrandingSettings = {
        ...(branding_settings || {}),
        ...(logo_url !== undefined ? { logo_url } : {}),
        ...(primary_color !== undefined ? { primary_color } : {}),
        ...(accent_color !== undefined ? { accent_color } : {}),
      };

      // Build metadata from individual fields or use provided object
      const finalMetadata = {
        ...(metadata || {}),
        ...(country !== undefined ? { country } : {}),
        ...(major_city !== undefined ? { major_city } : {}),
        ...(industry !== undefined ? { industry } : {}),
        ...(business_model !== undefined ? { business_model } : {}),
        ...(geographic_focus !== undefined ? { geographic_focus } : {}),
        ...(elevenlabs_agent_id !== undefined ? { elevenlabs_agent_id } : {}),
        ...(display_order !== undefined ? { display_order } : {}),
        ...(domain !== undefined ? { domain } : {}),
      };

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();
      const insertData = {
        tenant_id,
        name: name || null,
        branding_settings: finalBrandingSettings,
        status: status || 'active',
        metadata: finalMetadata,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data: created, error } = await supabase
        .from('tenant')
        .insert([insertData])
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Auto-provision tenant storage prefix by creating a placeholder object
      try {
        const supabase = getSupabaseAdmin();
        const bucket = getBucketName();
        if (supabase && bucket) {
          const keepKey = `uploads/${tenant_id}/.keep`;
          const empty = new Uint8Array(0);
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(keepKey, empty, {
              contentType: "text/plain",
              upsert: true,
            });
          if (upErr) {
            console.warn(
              "[Tenants] Failed to provision storage prefix for",
              tenant_id,
              upErr.message,
            );
          } else {
            console.log("[Tenants] Provisioned storage prefix for", tenant_id);
          }
        }
      } catch (provisionErr) {
        console.warn(
          "[Tenants] Storage provisioning error:",
          provisionErr.message,
        );
      }

      res.json({
        status: "success",
        message: "Tenant created",
        data: created,
      });
    } catch (error) {
      console.error("Error creating tenant:", error);

      // Handle unique constraint violation
      if (error.code === "23505") {
        return res.status(409).json({
          status: "error",
          message: "Tenant with this tenant_id already exists",
        });
      }

      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/tenants/:id - Get single tenant (by tenant_id, not UUID)
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Check if id is a UUID format (for backward compatibility) or tenant_id string
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const sel = supabase.from('tenant').select('*');
      const { data: row, error } = isUUID
        ? await sel.eq('id', id).single()
        : await sel.eq('tenant_id', id).single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!row) {
        return res.status(404).json({
          status: "error",
          message: "Tenant not found",
        });
      }
      const normalized = {
        ...row,
        logo_url: row.branding_settings?.logo_url || row.metadata?.logo_url ||
          null,
        primary_color: row.branding_settings?.primary_color ||
          row.metadata?.primary_color || null,
        accent_color: row.branding_settings?.accent_color ||
          row.metadata?.accent_color || null,
        settings: row.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: row.metadata?.country || "",
        major_city: row.metadata?.major_city || "",
        industry: row.metadata?.industry || "other",
        business_model: row.metadata?.business_model || "b2b",
        geographic_focus: row.metadata?.geographic_focus || "north_america",
        elevenlabs_agent_id: row.metadata?.elevenlabs_agent_id || "",
        display_order: row.metadata?.display_order ?? 0,
        domain: row.metadata?.domain || "",
      };

      res.json({
        status: "success",
        data: normalized,
      });
    } catch (error) {
      console.error("Error getting tenant:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // PUT /api/tenants/:id - Update tenant
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const {
        name,
        settings,
        status,
        metadata,
        logo_url,
        primary_color,
        accent_color,
        branding_settings,
        // Additional metadata fields
        country,
        major_city,
        industry,
        business_model,
        geographic_focus,
        elevenlabs_agent_id,
        display_order,
        domain,
      } = req.body;

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        params.push(name);
        paramCount++;
      }

      if (status !== undefined) {
        updates.push(`status = $${paramCount}`);
        params.push(status);
        paramCount++;
      }

      // Handle metadata - merge with existing and add new fields
      const shouldUpdateMetadata = metadata !== undefined ||
        country !== undefined ||
        major_city !== undefined || industry !== undefined ||
        business_model !== undefined ||
        geographic_focus !== undefined || elevenlabs_agent_id !== undefined ||
        display_order !== undefined || domain !== undefined ||
        settings !== undefined;

      if (shouldUpdateMetadata) {
        // Fetch existing metadata to merge
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const selMeta = supabase.from('tenant').select('metadata');
        const { data: cur, error: metaErr } = isUUID
          ? await selMeta.eq('id', id).single()
          : await selMeta.eq('tenant_id', id).single();
        if (metaErr && metaErr.code !== 'PGRST116') throw new Error(metaErr.message);
        const existingMetadata = cur?.metadata || {};

        // Merge all metadata fields
        const mergedMetadata = {
          ...existingMetadata,
          ...metadata,
          ...(settings || {}), // Legacy settings field
          ...(country !== undefined ? { country } : {}),
          ...(major_city !== undefined ? { major_city } : {}),
          ...(industry !== undefined ? { industry } : {}),
          ...(business_model !== undefined ? { business_model } : {}),
          ...(geographic_focus !== undefined ? { geographic_focus } : {}),
          ...(elevenlabs_agent_id !== undefined ? { elevenlabs_agent_id } : {}),
          ...(display_order !== undefined ? { display_order } : {}),
          ...(domain !== undefined ? { domain } : {}),
        };

        updates.push(`metadata = $${paramCount}`);
        params.push(mergedMetadata);
        paramCount++;
      }

      // Handle settings/branding - merge branding fields if provided
      const hasBrandingFields = (logo_url !== undefined) ||
        (primary_color !== undefined) || (accent_color !== undefined) ||
        (branding_settings !== undefined);

      if (settings !== undefined || hasBrandingFields) {
        // Fetch existing tenant branding_settings to merge
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const selBrand = supabase.from('tenant').select('branding_settings');
        const { data: cur2, error: brandErr } = isUUID
          ? await selBrand.eq('id', id).single()
          : await selBrand.eq('tenant_id', id).single();
        if (brandErr && brandErr.code !== 'PGRST116') throw new Error(brandErr.message);
        const existingBranding = cur2?.branding_settings || {};

        // Merge into branding_settings
        const mergedBranding = {
          ...existingBranding,
          ...(settings?.branding_settings || branding_settings || {}),
          ...(logo_url !== undefined ? { logo_url } : {}),
          ...(primary_color !== undefined ? { primary_color } : {}),
          ...(accent_color !== undefined ? { accent_color } : {}),
        };

        updates.push(`branding_settings = $${paramCount}`);
        params.push(mergedBranding);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "No fields to update",
        });
      }

      // Perform update via Supabase
      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const updateObj = {};
      // Reconstruct from updates/params since we built merged objects above
      if (name !== undefined) updateObj.name = name;
      if (status !== undefined) updateObj.status = status;
      if (shouldUpdateMetadata) updateObj.metadata = params.find(p => typeof p === 'object' && (p.country !== undefined || p.display_order !== undefined || p.domain !== undefined || p.major_city !== undefined || p.industry !== undefined || p.business_model !== undefined || p.geographic_focus !== undefined) ) || params.find(p => p && p.logo_url === undefined);
      if (settings !== undefined || hasBrandingFields) updateObj.branding_settings = params.find(p => p && (p.logo_url !== undefined || p.primary_color !== undefined || p.accent_color !== undefined) ) || params.find(p => p && p.branding_settings === undefined && p.country === undefined);
      updateObj.updated_at = nowIso;

      const upd = supabase.from('tenant').update(updateObj).select();
      const { data: updated, error: updErr } = isUUID
        ? await upd.eq('id', id).single()
        : await upd.eq('tenant_id', id).single();
      if (updErr && updErr.code !== 'PGRST116') throw new Error(updErr.message);
      if (!updated) {
        return res.status(404).json({
          status: "error",
          message: "Tenant not found",
        });
      }
      const row = updated;
      const normalized = {
        ...row,
        logo_url: row.branding_settings?.logo_url || row.metadata?.logo_url ||
          null,
        primary_color: row.branding_settings?.primary_color ||
          row.metadata?.primary_color || null,
        accent_color: row.branding_settings?.accent_color ||
          row.metadata?.accent_color || null,
        settings: row.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: row.metadata?.country || "",
        major_city: row.metadata?.major_city || "",
        industry: row.metadata?.industry || "other",
        business_model: row.metadata?.business_model || "b2b",
        geographic_focus: row.metadata?.geographic_focus || "north_america",
        elevenlabs_agent_id: row.metadata?.elevenlabs_agent_id || "",
        display_order: row.metadata?.display_order ?? 0,
        domain: row.metadata?.domain || "",
      };

      // Create audit log entry
      try {
        const auditLog = {
          tenant_id: row.tenant_id,
          user_email: req.user?.email || "system",
          action: "update",
          entity_type: "Tenant",
          entity_id: id,
          changes: {
            name,
            status,
            logo_url,
            primary_color,
            accent_color,
            metadata,
            branding_settings,
            country,
            major_city,
            industry,
            business_model,
            geographic_focus,
            elevenlabs_agent_id,
            display_order,
            domain,
          },
          ip_address: req.ip,
          user_agent: req.get("user-agent"),
        };

        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { error: auditErr } = await supabase
          .from('audit_log')
          .insert([{
            tenant_id: auditLog.tenant_id,
            user_email: auditLog.user_email,
            action: auditLog.action,
            entity_type: auditLog.entity_type,
            entity_id: auditLog.entity_id,
            changes: auditLog.changes,
            ip_address: auditLog.ip_address,
            user_agent: auditLog.user_agent,
            created_at: new Date().toISOString(),
          }]);
        if (auditErr) throw new Error(auditErr.message);

        console.log("[AUDIT] Tenant updated:", id, "by", auditLog.user_email);
      } catch (auditError) {
        console.error(
          "[AUDIT] Failed to create audit log:",
          auditError.message,
        );
        // Don't fail the request if audit logging fails
      }

      res.json({
        status: "success",
        message: "Tenant updated",
        data: normalized,
      });
    } catch (error) {
      console.error("[ERROR] Error updating tenant:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // DELETE /api/tenants/:id - Delete tenant
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('tenant')
        .delete()
        .eq('id', id)
        .select()
        .single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: "error",
          message: "Tenant not found",
        });
      }

      res.json({
        status: "success",
        message: "Tenant deleted",
        data,
      });
    } catch (error) {
      console.error("Error deleting tenant:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  return router;
}
