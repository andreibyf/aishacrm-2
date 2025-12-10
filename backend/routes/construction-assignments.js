/**
 * Construction Assignments Routes
 * Full CRUD operations for worker assignments to construction projects
 */

import express from "express";
import {
  enforceEmployeeDataScope,
  validateTenantAccess,
} from "../middleware/validateTenant.js";
import { tenantScopedId } from "../middleware/tenantScopedId.js";
import { cacheList, invalidateCache } from "../lib/cacheMiddleware.js";

export default function createConstructionAssignmentsRoutes(_pgPool) {
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
  // GET /api/construction/assignments - List all assignments
  // ==============================================
  router.get("/", cacheList("construction_assignments", 180), async (req, res) => {
    try {
      const { tenant_id, project_id, contact_id, status, role, limit, offset } = req.query;
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("construction_assignments")
        .select(
          `
          *,
          project:construction_projects!project_id(id, project_name, site_name, status),
          worker:contacts!contact_id(id, first_name, last_name, email, phone, worker_role)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (tenant_id && isValidUUID(tenant_id)) {
        q = q.eq("tenant_id", tenant_id);
      }
      if (project_id && isValidUUID(project_id)) {
        q = q.eq("project_id", project_id);
      }
      if (contact_id && isValidUUID(contact_id)) {
        q = q.eq("contact_id", contact_id);
      }
      if (status) {
        q = q.eq("status", status);
      }
      if (role) {
        q = q.ilike("role", `%${role}%`);
      }
      if (limit) {
        q = q.limit(parseInt(limit, 10));
      }
      if (offset) {
        q = q.range(parseInt(offset, 10), parseInt(offset, 10) + (parseInt(limit, 10) || 50) - 1);
      }

      const { data, error, count } = await q;

      if (error) {
        console.error("[construction-assignments] GET error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        data: {
          assignments: data || [],
          total: count || 0,
        },
      });
    } catch (err) {
      console.error("[construction-assignments] GET exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // GET /api/construction/assignments/:id - Get single assignment
  // ==============================================
  router.get("/:id", tenantScopedId(), async (req, res) => {
    try {
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("construction_assignments")
        .select(
          `
          *,
          project:construction_projects!project_id(id, project_name, site_name, site_address, status, account_id),
          worker:contacts!contact_id(id, first_name, last_name, email, phone, worker_role)
        `
        )
        .eq("id", req.idScope.id);

      if (req.idScope.tenant_id) {
        q = q.eq("tenant_id", req.idScope.tenant_id);
      }

      const { data, error } = await q.single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Assignment not found" });
        }
        console.error("[construction-assignments] GET/:id error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({ status: "success", data });
    } catch (err) {
      console.error("[construction-assignments] GET/:id exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // POST /api/construction/assignments - Create assignment
  // ==============================================
  router.post("/", invalidateCache("construction_assignments"), async (req, res) => {
    try {
      const {
        tenant_id,
        project_id,
        contact_id,
        role,
        start_date,
        end_date,
        pay_rate,
        bill_rate,
        rate_type,
        status,
        notes,
        metadata,
        created_by,
      } = req.body;

      // Validate required fields
      if (!tenant_id || !isValidUUID(tenant_id)) {
        return res.status(400).json({ status: "error", message: "Valid tenant_id is required" });
      }
      if (!project_id || !isValidUUID(project_id)) {
        return res.status(400).json({ status: "error", message: "Valid project_id is required" });
      }
      if (!contact_id || !isValidUUID(contact_id)) {
        return res.status(400).json({ status: "error", message: "Valid contact_id (worker) is required" });
      }
      if (!role || !role.trim()) {
        return res.status(400).json({ status: "error", message: "role is required" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {
        tenant_id,
        project_id,
        contact_id,
        role: role.trim(),
        start_date: toDate(start_date),
        end_date: toDate(end_date),
        pay_rate: toNumeric(pay_rate),
        bill_rate: toNumeric(bill_rate),
        rate_type: rate_type || "hourly",
        status: status || "Active",
        notes: toNullableString(notes),
        metadata: metadata || {},
        created_by: created_by && isValidUUID(created_by) ? created_by : null,
      };

      const { data, error } = await supabase
        .from("construction_assignments")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        // Check for unique constraint violation
        if (error.code === "23505") {
          return res.status(409).json({
            status: "error",
            message: "This worker is already assigned to this project in the same role",
          });
        }
        console.error("[construction-assignments] POST error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      // Also invalidate construction_projects cache since assignment counts changed
      try {
        const { invalidateCacheByKey } = await import("../lib/cacheMiddleware.js");
        invalidateCacheByKey("construction_projects");
      } catch (cacheErr) {
        console.warn("[construction-assignments] Could not invalidate projects cache:", cacheErr.message);
      }

      res.status(201).json({
        status: "success",
        message: "Assignment created successfully",
        data,
      });
    } catch (err) {
      console.error("[construction-assignments] POST exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // PUT /api/construction/assignments/:id - Update assignment
  // ==============================================
  router.put("/:id", invalidateCache("construction_assignments"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid assignment ID" });
      }

      const {
        project_id,
        contact_id,
        role,
        start_date,
        end_date,
        pay_rate,
        bill_rate,
        rate_type,
        status,
        notes,
        metadata,
      } = req.body;

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {};
      if (project_id !== undefined) payload.project_id = project_id && isValidUUID(project_id) ? project_id : null;
      if (contact_id !== undefined) payload.contact_id = contact_id && isValidUUID(contact_id) ? contact_id : null;
      if (role !== undefined) payload.role = role.trim();
      if (start_date !== undefined) payload.start_date = toDate(start_date);
      if (end_date !== undefined) payload.end_date = toDate(end_date);
      if (pay_rate !== undefined) payload.pay_rate = toNumeric(pay_rate);
      if (bill_rate !== undefined) payload.bill_rate = toNumeric(bill_rate);
      if (rate_type !== undefined) payload.rate_type = rate_type;
      if (status !== undefined) payload.status = status;
      if (notes !== undefined) payload.notes = toNullableString(notes);
      if (metadata !== undefined) payload.metadata = metadata;

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ status: "error", message: "No fields to update" });
      }

      const { data, error } = await supabase
        .from("construction_assignments")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Assignment not found" });
        }
        if (error.code === "23505") {
          return res.status(409).json({
            status: "error",
            message: "This worker is already assigned to this project in the same role",
          });
        }
        console.error("[construction-assignments] PUT error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        message: "Assignment updated successfully",
        data,
      });
    } catch (err) {
      console.error("[construction-assignments] PUT exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // DELETE /api/construction/assignments/:id - Delete assignment
  // ==============================================
  router.delete("/:id", invalidateCache("construction_assignments"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid assignment ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("construction_assignments")
        .delete()
        .eq("id", id)
        .select("id, project_id")
        .maybeSingle();

      if (error) {
        console.error("[construction-assignments] DELETE error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      if (!data) {
        return res.status(404).json({ status: "error", message: "Assignment not found" });
      }

      // Also invalidate construction_projects cache
      try {
        const { invalidateCacheByKey } = await import("../lib/cacheMiddleware.js");
        invalidateCacheByKey("construction_projects");
      } catch (cacheErr) {
        console.warn("[construction-assignments] Could not invalidate projects cache:", cacheErr.message);
      }

      res.json({
        status: "success",
        message: "Assignment deleted successfully",
        data: { id: data.id },
      });
    } catch (err) {
      console.error("[construction-assignments] DELETE exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // GET /api/construction/assignments/by-project/:projectId - Get all assignments for a project
  // ==============================================
  router.get("/by-project/:projectId", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!isValidUUID(projectId)) {
        return res.status(400).json({ status: "error", message: "Invalid project ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error, count } = await supabase
        .from("construction_assignments")
        .select(
          `
          *,
          worker:contacts!contact_id(id, first_name, last_name, email, phone, worker_role)
        `,
          { count: "exact" }
        )
        .eq("project_id", projectId)
        .order("role", { ascending: true });

      if (error) {
        console.error("[construction-assignments] GET by-project error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        data: {
          assignments: data || [],
          total: count || 0,
        },
      });
    } catch (err) {
      console.error("[construction-assignments] GET by-project exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // GET /api/construction/assignments/by-worker/:contactId - Get all assignments for a worker
  // ==============================================
  router.get("/by-worker/:contactId", async (req, res) => {
    try {
      const { contactId } = req.params;
      if (!isValidUUID(contactId)) {
        return res.status(400).json({ status: "error", message: "Invalid contact ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error, count } = await supabase
        .from("construction_assignments")
        .select(
          `
          *,
          project:construction_projects!project_id(id, project_name, site_name, status, account_id,
            account:accounts!account_id(id, name)
          )
        `,
          { count: "exact" }
        )
        .eq("contact_id", contactId)
        .order("start_date", { ascending: false });

      if (error) {
        console.error("[construction-assignments] GET by-worker error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        data: {
          assignments: data || [],
          total: count || 0,
        },
      });
    } catch (err) {
      console.error("[construction-assignments] GET by-worker exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  return router;
}
