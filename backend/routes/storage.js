/**
 * Storage Routes
 * File upload/download backed by Supabase Storage (with optional tenant scoping)
 */

import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

// Multer memory storage to forward buffer to Supabase
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Supabase service client (backend-only)
function getSupabaseAdmin() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or Service Role Key not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Resolve target bucket name with a sensible default
function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "tenant-assets";
}

// Build a tenant-aware storage key
function buildObjectKey({ tenantId, originalName }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = (originalName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const scope = tenantId || "global";
  return `uploads/${scope}/${yyyy}/${mm}/${ts}_${rand}_${safeName}`;
}

export default function createStorageRoutes(_pgPool) {
  const router = express.Router();

  // POST /api/storage/upload - Upload file to Supabase Storage
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message: "No file provided",
        });
      }

      // Try to infer tenant_id from header, query, or body
      const tenantId = req.headers["x-tenant-id"]?.toString() ||
        req.query.tenant_id?.toString() ||
        req.body?.tenant_id?.toString() ||
        null;

      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      const objectKey = buildObjectKey({
        tenantId,
        originalName: req.file.originalname,
      });

      // Upload buffer to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectKey, req.file.buffer, {
          contentType: req.file.mimetype || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Prefer public URL (bucket should be public). If not public, we can sign.
      const { data: publicUrlData } = supabase.storage.from(bucket)
        .getPublicUrl(objectKey);
      let fileUrl = publicUrlData?.publicUrl || null;

      if (!fileUrl) {
        // Fallback: generate a short-lived signed URL (1 day)
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectKey, 60 * 60 * 24);
        if (signErr) throw signErr;
        fileUrl = signed?.signedUrl;
      }

      return res.json({
        status: "success",
        message: "File uploaded",
        data: {
          file_url: fileUrl,
          filename: objectKey,
          bucket,
          tenant_id: tenantId,
        },
      });
    } catch (error) {
      console.error("[storage.upload] Error:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Upload failed",
      });
    }
  });

  // GET /api/storage/download/:fileId - Placeholder for future use
  router.get("/download/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;
      res.json({
        status: "success",
        message: "Download handler not implemented (use public/signed URLs)",
        data: { fileId },
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // DELETE /api/storage/:fileId - Delete from Supabase Storage
  router.delete("/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;
      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();

      const { error: delErr } = await supabase.storage.from(bucket).remove([
        fileId,
      ]);
      if (delErr) throw delErr;

      res.json({
        status: "success",
        message: "File deleted",
        data: { fileId },
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  return router;
}
