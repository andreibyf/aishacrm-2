/**
 * Workers Routes
 * CRUD operations for contractors/temp labor
 */

import express from "express";
import {
  enforceEmployeeDataScope,
  validateTenantAccess,
} from "../middleware/validateTenant.js";
import { tenantScopedId } from "../middleware/tenantScopedId.js";
import { cacheList, invalidateCache } from "../lib/cacheMiddleware.js";
import logger from '../lib/logger.js';

export default function createWorkersRoutes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  const toNullableString = (value) => {
    if (value === null || value === undefined || value === "") return null;
    return String(value).trim();
  };

  const toNumeric = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  };

  const isValidUUID = (str) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  };

  // ==============================================
  // GET /api/workers - List all workers
  // ==============================================
  router.get("/", cacheList("workers", 180), async (req, res) => {
    try {
      const { tenant_id, status, worker_type, primary_skill, limit, offset } = req.query;
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("workers")
        .select("*", { count: "exact" })
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });

      if (tenant_id && isValidUUID(tenant_id)) {
        q = q.eq("tenant_id", tenant_id);
      }
      if (status) {
        q = q.eq("status", status);
      }
      if (worker_type) {
        q = q.eq("worker_type", worker_type);
      }
      if (primary_skill) {
        q = q.eq("primary_skill", primary_skill);
      }
      if (limit) {
        q = q.limit(parseInt(limit, 10));
      }
      if (offset) {
        q = q.range(parseInt(offset, 10), parseInt(offset, 10) + (parseInt(limit, 10) || 50) - 1);
      }

      const { data, error, count } = await q;

      if (error) {
        logger.error("[workers] GET error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        data: {
          workers: data || [],
          total: count || 0,
        },
      });
    } catch (err) {
      logger.error("[workers] GET exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // GET /api/workers/:id - Get single worker
  // ==============================================
  router.get("/:id", tenantScopedId(), async (req, res) => {
    try {
      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      let q = supabase
        .from("workers")
        .select("*")
        .eq("id", req.idScope.id);

      if (req.idScope.tenant_id) {
        q = q.eq("tenant_id", req.idScope.tenant_id);
      }

      const { data, error } = await q.single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Worker not found" });
        }
        logger.error("[workers] GET/:id error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({ status: "success", data });
    } catch (err) {
      logger.error("[workers] GET/:id exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // POST /api/workers - Create worker
  // ==============================================
  router.post("/", invalidateCache("workers"), async (req, res) => {
    try {
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        phone,
        worker_type,
        status,
        primary_skill,
        skills,
        certifications,
        default_pay_rate,
        default_rate_type,
        available_from,
        available_until,
        emergency_contact_name,
        emergency_contact_phone,
        notes,
        metadata,
        created_by,
      } = req.body;

      if (!tenant_id || !isValidUUID(tenant_id)) {
        return res.status(400).json({ status: "error", message: "Valid tenant_id is required" });
      }
      if (!first_name || !first_name.trim()) {
        return res.status(400).json({ status: "error", message: "first_name is required" });
      }
      if (!last_name || !last_name.trim()) {
        return res.status(400).json({ status: "error", message: "last_name is required" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {
        tenant_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: toNullableString(email),
        phone: toNullableString(phone),
        worker_type: worker_type || "Contractor",
        status: status || "Active",
        primary_skill: toNullableString(primary_skill),
        skills: skills || [],
        certifications: certifications || [],
        default_pay_rate: toNumeric(default_pay_rate),
        default_rate_type: default_rate_type || "hourly",
        available_from: available_from || null,
        available_until: available_until || null,
        emergency_contact_name: toNullableString(emergency_contact_name),
        emergency_contact_phone: toNullableString(emergency_contact_phone),
        notes: toNullableString(notes),
        metadata: metadata || {},
        created_by: created_by && isValidUUID(created_by) ? created_by : null,
      };

      const { data, error } = await supabase
        .from("workers")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        logger.error("[workers] POST error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.status(201).json({
        status: "success",
        message: "Worker created successfully",
        data,
      });
    } catch (err) {
      logger.error("[workers] POST exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // PUT /api/workers/:id - Update worker
  // ==============================================
  router.put("/:id", invalidateCache("workers"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid worker ID" });
      }

      const {
        first_name,
        last_name,
        email,
        phone,
        worker_type,
        status,
        primary_skill,
        skills,
        certifications,
        default_pay_rate,
        default_rate_type,
        available_from,
        available_until,
        emergency_contact_name,
        emergency_contact_phone,
        notes,
        metadata,
      } = req.body;

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const payload = {};
      if (first_name !== undefined) payload.first_name = first_name.trim();
      if (last_name !== undefined) payload.last_name = last_name.trim();
      if (email !== undefined) payload.email = toNullableString(email);
      if (phone !== undefined) payload.phone = toNullableString(phone);
      if (worker_type !== undefined) payload.worker_type = worker_type;
      if (status !== undefined) payload.status = status;
      if (primary_skill !== undefined) payload.primary_skill = toNullableString(primary_skill);
      if (skills !== undefined) payload.skills = skills;
      if (certifications !== undefined) payload.certifications = certifications;
      if (default_pay_rate !== undefined) payload.default_pay_rate = toNumeric(default_pay_rate);
      if (default_rate_type !== undefined) payload.default_rate_type = default_rate_type;
      if (available_from !== undefined) payload.available_from = available_from;
      if (available_until !== undefined) payload.available_until = available_until;
      if (emergency_contact_name !== undefined) payload.emergency_contact_name = toNullableString(emergency_contact_name);
      if (emergency_contact_phone !== undefined) payload.emergency_contact_phone = toNullableString(emergency_contact_phone);
      if (notes !== undefined) payload.notes = toNullableString(notes);
      if (metadata !== undefined) payload.metadata = metadata;

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ status: "error", message: "No fields to update" });
      }

      const { data, error } = await supabase
        .from("workers")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ status: "error", message: "Worker not found" });
        }
        logger.error("[workers] PUT error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      res.json({
        status: "success",
        message: "Worker updated successfully",
        data,
      });
    } catch (err) {
      logger.error("[workers] PUT exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ==============================================
  // DELETE /api/workers/:id - Delete worker
  // ==============================================
  router.delete("/:id", invalidateCache("workers"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUUID(id)) {
        return res.status(400).json({ status: "error", message: "Invalid worker ID" });
      }

      const { getSupabaseClient } = await import("../lib/supabase-db.js");
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("workers")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        logger.error("[workers] DELETE error:", error);
        return res.status(500).json({ status: "error", message: error.message });
      }

      if (!data) {
        return res.status(404).json({ status: "error", message: "Worker not found" });
      }

      res.json({
        status: "success",
        message: "Worker deleted successfully",
        data: { id: data.id },
      });
    } catch (err) {
      logger.error("[workers] DELETE exception:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  return router;
}
