/**
 * Tenant Routes
 * CRUD operations for tenants
 */

import express from "express";
import { createAuditLog, getUserEmailFromRequest, getClientIP } from "../lib/auditLogger.js";
import { getSupabaseAdmin, getBucketName } from "../lib/supabaseFactory.js";

/**
 * Default modules that should be initialized for every new tenant.
 * These match the modules defined in frontend's ModuleManager.jsx
 * All modules are enabled by default.
 */
const DEFAULT_MODULES = [
  "Dashboard",
  "Contact Management",
  "Account Management",
  "Lead Management",
  "Opportunities",
  "Activity Tracking",
  "Calendar",
  "BizDev Sources",
  "Cash Flow Management",
  "Document Processing & Management",
  "AI Campaigns",
  "Analytics & Reports",
  "Employee Management",
  "Integrations",
  "Payment Portal",
  "Utilities",
  "Client Onboarding",
  "AI Agent",
  "Realtime Voice",
  "Workflows",
];

/**
 * Generate a unique tenant_id slug from a company name
 * If the base slug exists, appends a counter: acme-corp-2, acme-corp-3, etc.
 */
async function generateUniqueTenantId(supabase, name) {
  // Create base slug: lowercase, alphanumeric + hyphens only
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Collapse multiple hyphens

  // Check if base slug is available
  const { data: existing } = await supabase
    .from('tenant')
    .select('tenant_id')
    .eq('tenant_id', slug)
    .maybeSingle();

  if (!existing) {
    console.log(`[generateUniqueTenantId] Generated slug: ${slug}`);
    return slug;
  }

  // Base slug exists, append counter
  let counter = 2;
  let candidate = `${slug}-${counter}`;
  
  while (true) {
    const { data: check } = await supabase
      .from('tenant')
      .select('tenant_id')
      .eq('tenant_id', candidate)
      .maybeSingle();
    
    if (!check) {
      console.log(`[generateUniqueTenantId] Generated slug with counter: ${candidate}`);
      return candidate;
    }
    
    counter++;
    candidate = `${slug}-${counter}`;
    
    // Safety check to prevent infinite loops
    if (counter > 1000) {
      throw new Error(`Unable to generate unique tenant_id for name: ${name}`);
    }
  }
}

/**
 * Initialize default module settings for a newly created tenant.
 * This ensures every tenant has their own module settings rows,
 * preventing cross-tenant pollution when toggling modules.
 * 
 * @param {object} supabase - Supabase admin client
 * @param {string} tenantId - The UUID of the newly created tenant
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
async function initializeModuleSettingsForTenant(supabase, tenantId) {
  try {
    const moduleRows = DEFAULT_MODULES.map(moduleName => ({
      tenant_id: tenantId,
      module_name: moduleName,
      settings: {},
      is_enabled: true,
    }));

    const { data, error } = await supabase
      .from('modulesettings')
      .insert(moduleRows)
      .select();

    if (error) {
      console.error(`[Tenants] Failed to initialize module settings for tenant ${tenantId}:`, error.message);
      return { success: false, count: 0, error: error.message };
    }

    console.log(`[Tenants] Initialized ${data?.length || 0} module settings for tenant ${tenantId}`);
    return { success: true, count: data?.length || 0 };
  } catch (err) {
    console.error(`[Tenants] Error initializing module settings for tenant ${tenantId}:`, err.message);
    return { success: false, count: 0, error: err.message };
  }
}

export default function createTenantRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/tenants:
   *   get:
   *     summary: List tenants
   *     tags: [tenants]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: status
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Tenants list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   post:
   *     summary: Create tenant
   *     tags: [tenants]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: []
   *     responses:
   *       200:
   *         description: Tenant created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */

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

      // Filter by UUID id (primary key), not tenant_id slug
      if (tenant_id) q = q.eq('id', tenant_id);
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
        // Use direct columns (migrated from metadata JSONB)
        country: r.country || "",
        major_city: r.major_city || "",
        industry: r.industry || "other",
        business_model: r.business_model || "b2b",
        geographic_focus: r.geographic_focus || "north_america",
        elevenlabs_agent_id: r.elevenlabs_agent_id || "",
        display_order: r.display_order ?? 0,
        domain: r.domain || "",
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
      console.log("[Tenants POST] Received request body:", JSON.stringify(req.body, null, 2));
      
      let {
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

      console.log("[Tenants POST] Parsed tenant_id:", tenant_id, "name:", name);

      // Auto-generate tenant_id from name if not provided
      if (!tenant_id && name) {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        tenant_id = await generateUniqueTenantId(supabase, name);
        console.log("[Tenants POST] Auto-generated tenant_id:", tenant_id);
      }

      if (!tenant_id) {
        console.warn("[Tenants POST] Missing tenant_id and name in request");
        return res.status(400).json({
          status: "error",
          message: "Either tenant_id or name is required",
        });
      }
      // Build branding_settings from individual fields or use provided object
      const finalBrandingSettings = {
        ...(branding_settings || {}),
        ...(logo_url !== undefined ? { logo_url } : {}),
        ...(primary_color !== undefined ? { primary_color } : {}),
        ...(accent_color !== undefined ? { accent_color } : {}),
      };

      // Keep metadata for other fields not yet migrated to columns
      const finalMetadata = {
        ...(metadata || {}),
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
        // Direct column assignments (migrated from metadata)
        country: country || null,
        major_city: major_city || null,
        industry: industry || null,
        business_model: business_model || null,
        geographic_focus: geographic_focus || null,
        elevenlabs_agent_id: elevenlabs_agent_id || null,
        display_order: display_order ?? 0,
        domain: domain || null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      console.log("[Tenants POST] Attempting to insert:", JSON.stringify(insertData, null, 2));
      
      const { data: created, error } = await supabase
        .from('tenant')
        .insert([insertData])
        .select()
        .single();
      
      if (error) {
        console.error("[Tenants POST] Database error:", error);
        throw new Error(error.message);
      }
      
      console.log("[Tenants POST] Tenant created successfully:", created?.id);

      // Create audit log for tenant creation
      try {
        await createAuditLog(supabase, {
          tenant_id: created?.tenant_id || 'system',
          user_email: getUserEmailFromRequest(req),
          action: 'create',
          entity_type: 'tenant',
          entity_id: created?.id,
          changes: {
            name: created?.name,
            status: created?.status,
            tenant_id: created?.tenant_id,
          },
          ip_address: getClientIP(req),
          user_agent: req.headers['user-agent'],
        });
      } catch (auditError) {
        console.warn('[AUDIT] Failed to log tenant creation:', auditError.message);
      }

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

      // Initialize default module settings for the new tenant
      // This ensures each tenant has their own module settings rows
      // to prevent cross-tenant pollution when toggling modules
      try {
        const moduleResult = await initializeModuleSettingsForTenant(supabase, created.id);
        if (!moduleResult.success) {
          console.warn(`[Tenants] Module settings initialization warning: ${moduleResult.error}`);
        }
      } catch (moduleErr) {
        console.warn('[Tenants] Module settings initialization error:', moduleErr.message);
        // Non-fatal: tenant is created, settings can be initialized on first access
      }

      res.status(201).json({
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
  /**
   * @openapi
   * /api/tenants/{id}:
   *   get:
   *     summary: Get tenant by ID or tenant_id
   *     tags: [tenants]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Tenant details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update tenant
   *     tags: [tenants]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Tenant updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete tenant
   *     tags: [tenants]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Tenant deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
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
        // Use direct columns (migrated from metadata JSONB)
        country: row.country || "",
        major_city: row.major_city || "",
        industry: row.industry || "other",
        business_model: row.business_model || "b2b",
        geographic_focus: row.geographic_focus || "north_america",
        elevenlabs_agent_id: row.elevenlabs_agent_id || "",
        display_order: row.display_order ?? 0,
        domain: row.domain || "",
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

      // Handle metadata - keep for fields not yet migrated to columns
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramCount}`);
        params.push(metadata);
        paramCount++;
      }

      // Handle individual tenant fields (migrated from metadata to direct columns)
      if (country !== undefined) {
        updates.push(`country = $${paramCount}`);
        params.push(country);
        paramCount++;
      }

      if (major_city !== undefined) {
        updates.push(`major_city = $${paramCount}`);
        params.push(major_city);
        paramCount++;
      }

      if (industry !== undefined) {
        updates.push(`industry = $${paramCount}`);
        params.push(industry);
        paramCount++;
      }

      if (business_model !== undefined) {
        updates.push(`business_model = $${paramCount}`);
        params.push(business_model);
        paramCount++;
      }

      if (geographic_focus !== undefined) {
        updates.push(`geographic_focus = $${paramCount}`);
        params.push(geographic_focus);
        paramCount++;
      }

      if (elevenlabs_agent_id !== undefined) {
        updates.push(`elevenlabs_agent_id = $${paramCount}`);
        params.push(elevenlabs_agent_id);
        paramCount++;
      }

      if (display_order !== undefined) {
        updates.push(`display_order = $${paramCount}`);
        params.push(display_order);
        paramCount++;
      }

      if (domain !== undefined) {
        updates.push(`domain = $${paramCount}`);
        params.push(domain);
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
      
      // Direct column updates
      if (name !== undefined) updateObj.name = name;
      if (status !== undefined) updateObj.status = status;
      if (country !== undefined) updateObj.country = country;
      if (major_city !== undefined) updateObj.major_city = major_city;
      if (industry !== undefined) updateObj.industry = industry;
      if (business_model !== undefined) updateObj.business_model = business_model;
      if (geographic_focus !== undefined) updateObj.geographic_focus = geographic_focus;
      if (elevenlabs_agent_id !== undefined) updateObj.elevenlabs_agent_id = elevenlabs_agent_id;
      if (display_order !== undefined) updateObj.display_order = display_order;
      if (domain !== undefined) updateObj.domain = domain;
      
      // Handle metadata (for non-flattened fields)
      if (metadata !== undefined) {
        updateObj.metadata = metadata;
      }
      
      // Handle branding settings
      if (settings !== undefined || hasBrandingFields) {
        // Fetch existing tenant branding_settings to merge
        const selBrand = supabase.from('tenant').select('branding_settings');
        const { data: cur, error: brandErr } = isUUID
          ? await selBrand.eq('id', id).single()
          : await selBrand.eq('tenant_id', id).single();
        if (brandErr && brandErr.code !== 'PGRST116') throw new Error(brandErr.message);
        const existingBranding = cur?.branding_settings || {};

        // Merge into branding_settings
        const mergedBranding = {
          ...existingBranding,
          ...(settings?.branding_settings || branding_settings || {}),
          ...(logo_url !== undefined ? { logo_url } : {}),
          ...(primary_color !== undefined ? { primary_color } : {}),
          ...(accent_color !== undefined ? { accent_color } : {}),
        };
        updateObj.branding_settings = mergedBranding;
      }
      
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

      // Create audit log for tenant deletion
      try {
        await createAuditLog(supabase, {
          tenant_id: data?.tenant_id || 'system',
          user_email: getUserEmailFromRequest(req),
          action: 'delete',
          entity_type: 'tenant',
          entity_id: id,
          changes: {
            name: data?.name,
            tenant_id: data?.tenant_id,
          },
          ip_address: getClientIP(req),
          user_agent: req.headers['user-agent'],
        });
      } catch (auditError) {
        console.warn('[AUDIT] Failed to log tenant deletion:', auditError.message);
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
