/**
 * Construction Projects Routes
 * Full CRUD operations for construction projects module
 * Used by staffing companies to track client projects and worker assignments
 */

import express from "express";
import {
  enforceEmployeeDataScope,
  validateTenantAccess,
} from "../middleware/validateTenant.js";
import { tenantScopedId } from "../middleware/tenantScopedId.js";
import { cacheList, invalidateCache } from "../lib/cacheMiddleware.js";

export default function createConstructionProjectsRoutes(_pgPool) {
  const router = express.Router();

  // Apply tenant validation to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  // Helper functions
  const toNullableString = (value) => {
    if (value === null || value === undefined || value === "") return null;
    return String(value).trim();
  };

  const toNumeric = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  };

  const toDate = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  };

  const isValidUUID = (str) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  };

  // ==============================================
  // GET /api/construction/projects - List all projects
  // ==============================================
  router.get("/", cacheList("construction_projects", 180), async (req, res) => {
    try {
      const { tenant_id, status, account_id, limit, offset } = req.query;
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("construction_projects")
        .select(
          `
          *,
          account:accounts!account_id(id, name),
          lead:leads!lead_id(id, first_name, last_name, company),
          project_manager:contacts!project_manager_contact_id(id, first_name, last_name, email),
          supervisor:contacts!supervisor_contact_id(id, first_name, last_name, email),
          assignments:construction_assignments(count)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (tenant_id && isValidUUID(tenant_id)) {
        q = q.eq("tenant_id", tenant_id);
      }
      if (status) {
        q = q.eq("status", status);
      }
      if (account_id && isValidUUID(account_id)) {
        q = q.eq("account_id", account_id);
      }
      if (limit) {
        q = q.limit(parseInt(limit, 10));
      }
      if (offset) {
        q = q.range(parseInt(offset, 10), parseInt(offset, 10) + (parseInt(limit, 10) || 50) - 1);
      }

      const { data, error, count } = await q;

      if (error) {
        console.error("[construction-projects] GET error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        data: {
          projects: data || [],
          total: count || 0,
        },
      });
    } catch (err) {
      console.error("[construction-projects] GET exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // GET /api/construction/projects/:id - Get single project
  // ==============================================
  router.get("/:id", tenantScopedId(), async (req, res) => {
    try {
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("construction_projects")
        .select(
          `
          *,
          account:accounts!account_id(id, name, metadata),
          lead:leads!lead_id(id, first_name, last_name, company),
          project_manager:contacts!project_manager_contact_id(id, first_name, last_name, email, phone),
          supervisor:contacts!supervisor_contact_id(id, first_name, last_name, email, phone),
          assignments:construction_assignments(
            id, contact_id, role, start_date, end_date, pay_rate, bill_rate, rate_type, status, notes,
            worker:contacts!contact_id(id, first_name, last_name, email, phone, worker_role)
          )
        `
        )
        .eq("id", req.idScope.id);

      if (req.idScope.tenant_id) {
        q = q.eq("tenant_id", req.idScope.tenant_id);
      }

      const { data, error } = await q.single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Project not found" });
        }
        console.error("[construction-projects] GET/:id error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({ status: "success", data });
    } catch (err) {
      console.error("[construction-projects] GET/:id exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // POST /api/construction/projects - Create project
  // ==============================================
  router.post("/", invalidateCache("construction_projects"), async (req, res) => {
    try {
      const {
        tenant_id,
        project_name,
        account_id,
        lead_id,
        site_name,
        site_address,
        project_manager_contact_id,
        supervisor_contact_id,
        start_date,
        end_date,
        project_value,
        status,
        description,
        notes,
        metadata,
        created_by,
      } = req.body;

      if (!tenant_id || !isValidUUID(tenant_id)) {
        return res.status(400).json({ status: "error", message: "Valid tenant_id is required" });
      }
      if (!project_name || !project_name.trim()) {
        return res.status(400).json({ status: "error", message: "project_name is required" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {
        tenant_id,
        project_name: project_name.trim(),
        account_id: account_id && isValidUUID(account_id) ? account_id : null,
        lead_id: lead_id && isValidUUID(lead_id) ? lead_id : null,
        site_name: toNullableString(site_name),
        site_address: toNullableString(site_address),
        project_manager_contact_id: project_manager_contact_id && isValidUUID(project_manager_contact_id) ? project_manager_contact_id : null,
        supervisor_contact_id: supervisor_contact_id && isValidUUID(supervisor_contact_id) ? supervisor_contact_id : null,
        start_date: toDate(start_date),
        end_date: toDate(end_date),
        project_value: toNumeric(project_value),
        status: status || "Planned",
        description: toNullableString(description),
        notes: toNullableString(notes),
        metadata: metadata || {},
        created_by: created_by && isValidUUID(created_by) ? created_by : null,
      };

      const { data, error } = await supabase
        .from("construction_projects")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        console.error("[construction-projects] POST error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.status(201).json({
        status: "success",
        message: "Project created successfully",
        data,
      });
    } catch (err) {
      console.error("[construction-projects] POST exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // PUT /api/construction/projects/:id - Update project
  // ==============================================
  router.put("/:id", invalidateCache("construction_projects"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid project ID" });
      }

      const {
        project_name,
        account_id,
        lead_id,
        site_name,
        site_address,
        project_manager_contact_id,
        supervisor_contact_id,
        start_date,
        end_date,
        project_value,
        status,
        description,
        notes,
        metadata,
      } = req.body;

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {};
      if (project_name !== undefined) payload.project_name = project_name.trim();
      if (account_id !== undefined) payload.account_id = account_id && isValidUUID(account_id) ? account_id : null;
      if (lead_id !== undefined) payload.lead_id = lead_id && isValidUUID(lead_id) ? lead_id : null;
      if (site_name !== undefined) payload.site_name = toNullableString(site_name);
      if (site_address !== undefined) payload.site_address = toNullableString(site_address);
      if (project_manager_contact_id !== undefined) payload.project_manager_contact_id = project_manager_contact_id && isValidUUID(project_manager_contact_id) ? project_manager_contact_id : null;
      if (supervisor_contact_id !== undefined) payload.supervisor_contact_id = supervisor_contact_id && isValidUUID(supervisor_contact_id) ? supervisor_contact_id : null;
      if (start_date !== undefined) payload.start_date = toDate(start_date);
      if (end_date !== undefined) payload.end_date = toDate(end_date);
      if (project_value !== undefined) payload.project_value = toNumeric(project_value);
      if (status !== undefined) payload.status = status;
      if (description !== undefined) payload.description = toNullableString(description);
      if (notes !== undefined) payload.notes = toNullableString(notes);
      if (metadata !== undefined) payload.metadata = metadata;

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ status: "error", message: "No fields to update" });
      }

      const { data, error } = await supabase
        .from("construction_projects")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Project not found" });
        }
        console.error("[construction-projects] PUT error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        message: "Project updated successfully",
        data,
      });
    } catch (err) {
      console.error("[construction-projects] PUT exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // DELETE /api/construction/projects/:id - Delete project
  // ==============================================
  router.delete("/:id", invalidateCache("construction_projects"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid project ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("construction_projects")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("[construction-projects] DELETE error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      if (!data) {
        return res.status(404).json({ status: "error", message: "Project not found" });
      }

      res.json({
        status: "success",
        message: "Project deleted successfully",
        data: { id: data.id },
      });
    } catch (err) {
      console.error("[construction-projects] DELETE exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  return router;
}
