/**
 * Project Management Routes
 * Full CRUD operations for projects and milestones
 * Generalized project tracking with team assignments
 */

import express from "express";
import {
  enforceEmployeeDataScope,
  validateTenantAccess,
} from "../middleware/validateTenant.js";
import { tenantScopedId } from "../middleware/tenantScopedId.js";
import { cacheList, invalidateCache } from "../lib/cacheMiddleware.js";
import logger from '../lib/logger.js';
import { toNullableString, toNumeric } from '../lib/typeConversions.js';

export default function createConstructionProjectsRoutes(_pgPool) {
  const router = express.Router();

  // Apply tenant validation to all routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  // Helper functions
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
  router.get("/", cacheList("projects", 180), async (req, res) => {
    try {
      const { tenant_id, status, account_id, limit, offset } = req.query;
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("projects")
        .select(
          `
          *,
          account:accounts!account_id(id, name),
          lead:leads!lead_id(id, first_name, last_name, company),
          project_manager:contacts!project_manager_contact_id(id, first_name, last_name, email),
          supervisor:contacts!supervisor_contact_id(id, first_name, last_name, email),
          assignments:project_assignments(
            id,
            worker_id,
            role,
            start_date,
            end_date,
            pay_rate,
            bill_rate,
            rate_type,
            status,
            worker:workers(id, first_name, last_name, worker_type, primary_skill)
          )
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
        logger.error("[construction-projects] GET error:", error);
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
      logger.error("[construction-projects] GET exception:", err);
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
        .from("projects")
        .select(
          `
          *,
          account:accounts!account_id(id, name, metadata),
          lead:leads!lead_id(id, first_name, last_name, company),
          project_manager:contacts!project_manager_contact_id(id, first_name, last_name, email, phone),
          supervisor:contacts!supervisor_contact_id(id, first_name, last_name, email, phone),
          assignments:project_assignments(
            id, worker_id, role, start_date, end_date, pay_rate, bill_rate, rate_type, status, notes,
            worker:workers!worker_id(id, first_name, last_name, email, phone, worker_type, primary_skill)
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
        logger.error("[construction-projects] GET/:id error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({ status: "success", data });
    } catch (err) {
      logger.error("[construction-projects] GET/:id exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // POST /api/construction/projects - Create project
  // ==============================================
  router.post("/", invalidateCache("projects"), async (req, res) => {
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
        .from("projects")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        logger.error("[construction-projects] POST error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.status(201).json({
        status: "success",
        message: "Project created successfully",
        data,
      });
    } catch (err) {
      logger.error("[construction-projects] POST exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // PUT /api/construction/projects/:id - Update project
  // ==============================================
  router.put("/:id", invalidateCache("projects"), async (req, res) => {
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
        .from("projects")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Project not found" });
        }
        logger.error("[construction-projects] PUT error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        message: "Project updated successfully",
        data,
      });
    } catch (err) {
      logger.error("[construction-projects] PUT exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // DELETE /api/construction/projects/:id - Delete project
  // ==============================================
  router.delete("/:id", invalidateCache("projects"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid project ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        logger.error("[construction-projects] DELETE error:", error);
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
      logger.error("[construction-projects] DELETE exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // MILESTONE ROUTES
  // ==============================================

  // GET /api/construction/projects/:projectId/milestones - List milestones for a project
  router.get("/:projectId/milestones", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!isValidUUID(projectId)) {
        return res.status(400).json({ status: "error", message: "Invalid project ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false });

      if (error) {
        logger.error("[milestones] GET error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({ status: "success", data: data || [] });
    } catch (err) {
      logger.error("[milestones] GET exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // POST /api/construction/projects/:projectId/milestones - Create milestone
  router.post("/:projectId/milestones", invalidateCache("project_milestones"), async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!isValidUUID(projectId)) {
        return res.status(400).json({ status: "error", message: "Invalid project ID" });
      }

      const { tenant_id, title, description, due_date, status, sort_order } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ status: "error", message: "Title is required" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      // Verify project exists and get tenant_id if not provided
      const { data: project } = await supabase
        .from("projects")
        .select("id, tenant_id")
        .eq("id", projectId)
        .single();

      if (!project) {
        return res.status(404).json({ status: "error", message: "Project not found" });
      }

      const payload = {
        project_id: projectId,
        tenant_id: tenant_id || project.tenant_id,
        title: title.trim(),
        description: toNullableString(description),
        due_date: toDate(due_date),
        status: status || "pending",
        sort_order: sort_order ?? 0,
        created_by: req.user?.id || null,
      };

      const { data, error } = await supabase
        .from("project_milestones")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        logger.error("[milestones] POST error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.status(201).json({
        status: "success",
        message: "Milestone created successfully",
        data,
      });
    } catch (err) {
      logger.error("[milestones] POST exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // PUT /api/construction/projects/:projectId/milestones/:milestoneId - Update milestone
  router.put("/:projectId/milestones/:milestoneId", invalidateCache("project_milestones"), async (req, res) => {
    try {
      const { projectId, milestoneId } = req.params;
      if (!isValidUUID(projectId) || !isValidUUID(milestoneId)) {
        return res.status(400).json({ status: "error", message: "Invalid ID" });
      }

      const { title, description, due_date, status, sort_order, completed_at } = req.body;

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {};
      if (title !== undefined) payload.title = title.trim();
      if (description !== undefined) payload.description = toNullableString(description);
      if (due_date !== undefined) payload.due_date = toDate(due_date);
      if (status !== undefined) {
        payload.status = status;
        // Auto-set completed_at when status changes to completed
        if (status === "completed" && completed_at === undefined) {
          payload.completed_at = new Date().toISOString();
        } else if (status !== "completed") {
          payload.completed_at = null;
        }
      }
      if (completed_at !== undefined) payload.completed_at = completed_at;
      if (sort_order !== undefined) payload.sort_order = sort_order;

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ status: "error", message: "No fields to update" });
      }

      const { data, error } = await supabase
        .from("project_milestones")
        .update(payload)
        .eq("id", milestoneId)
        .eq("project_id", projectId)
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Milestone not found" });
        }
        logger.error("[milestones] PUT error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        message: "Milestone updated successfully",
        data,
      });
    } catch (err) {
      logger.error("[milestones] PUT exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // DELETE /api/construction/projects/:projectId/milestones/:milestoneId - Delete milestone
  router.delete("/:projectId/milestones/:milestoneId", invalidateCache("project_milestones"), async (req, res) => {
    try {
      const { projectId, milestoneId } = req.params;
      if (!isValidUUID(projectId) || !isValidUUID(milestoneId)) {
        return res.status(400).json({ status: "error", message: "Invalid ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("project_milestones")
        .delete()
        .eq("id", milestoneId)
        .eq("project_id", projectId)
        .select("id")
        .maybeSingle();

      if (error) {
        logger.error("[milestones] DELETE error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      if (!data) {
        return res.status(404).json({ status: "error", message: "Milestone not found" });
      }

      res.json({
        status: "success",
        message: "Milestone deleted successfully",
        data: { id: data.id },
      });
    } catch (err) {
      logger.error("[milestones] DELETE exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  return router;
}
