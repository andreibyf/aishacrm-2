/**
 * Storage Routes
 * File upload/download backed by Supabase Storage (with optional tenant scoping)
 */

import express from "express";
import multer from "multer";
import { getSupabaseAdmin, getBucketName } from "../lib/supabaseFactory.js";

// Multer memory storage to forward buffer to Supabase
const upload = multer({ storage: multer.memoryStorage() });

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

  /**
   * @openapi
   * /api/storage/upload:
   *   post:
   *     summary: Upload a file to storage
   *     description: Uploads a file to Supabase Storage, returning a public or signed URL.
   *     tags: [storage]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       200:
   *         description: File uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: No file provided
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

      console.log("[storage.upload] Upload request:", {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        tenantId,
        headers: req.headers["x-tenant-id"],
      });

      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      const objectKey = buildObjectKey({
        tenantId,
        originalName: req.file.originalname,
      });

      console.log("[storage.upload] Uploading to:", {
        bucket,
        objectKey,
        tenantId,
      });

      // Upload buffer to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectKey, req.file.buffer, {
          contentType: req.file.mimetype || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        console.error("[storage.upload] Supabase upload error:", uploadError);
        throw uploadError;
      }

      console.log("[storage.upload] Upload successful:", objectKey);

      // Prefer public URL (bucket should be public). If not accessible, fall back to a signed URL.
      const { data: publicUrlData } = supabase.storage.from(bucket)
        .getPublicUrl(objectKey);
      let fileUrl = publicUrlData?.publicUrl || null;

      // Validate public URL accessibility with a lightweight HEAD request.
      // Some Supabase projects may have a private bucket with a computed public URL that 403s.
      let isPublicAccessible = false;
      if (fileUrl) {
        try {
          const resp = await fetch(fileUrl, { method: "HEAD" });
          isPublicAccessible = resp.ok;
        } catch {
          isPublicAccessible = false;
        }
      }

      if (!fileUrl || !isPublicAccessible) {
        // Fallback: generate a signed URL. Use the maximum allowed duration (7 days).
        // Note: The frontend should avoid appending cache-busting params to signed URLs.
        const expiresIn = 60 * 60 * 24 * 7; // 7 days
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectKey, expiresIn);
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

  /**
   * @openapi
   * /api/storage/signed-url:
   *   post:
   *     summary: Generate a signed URL
   *     description: Returns a signed URL for a storage object when public access is unavailable.
   *     tags: [storage]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               file_uri:
   *                 type: string
   *                 description: Object key/path in the bucket
   *               filepath:
   *                 type: string
   *                 description: Alias for file_uri
   *     responses:
   *       200:
   *         description: Signed URL returned
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing file identifier
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/storage/signed-url - Generate signed URL for a file
  router.post("/signed-url", async (req, res) => {
    try {
      const { file_uri, filepath } = req.body;
      const objectKey = file_uri || filepath;

      if (!objectKey) {
        return res.status(400).json({
          status: "error",
          message: "file_uri or filepath is required",
        });
      }

      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      const expiresIn = 60 * 60 * 24 * 7; // 7 days

      // First try to get public URL
      const { data: publicUrlData } = supabase.storage.from(bucket)
        .getPublicUrl(objectKey);
      
      let fileUrl = publicUrlData?.publicUrl || null;
      let isPublicAccessible = false;

      // Check if public URL is accessible
      if (fileUrl) {
        try {
          const resp = await fetch(fileUrl, { method: "HEAD" });
          isPublicAccessible = resp.ok;
        } catch {
          isPublicAccessible = false;
        }
      }

      // If not publicly accessible, create signed URL
      if (!fileUrl || !isPublicAccessible) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectKey, expiresIn);
        
        if (signErr) {
          console.error("[storage.signed-url] Error creating signed URL:", signErr);
          throw signErr;
        }
        
        fileUrl = signed?.signedUrl;
      }

      if (!fileUrl) {
        return res.status(404).json({
          status: "error",
          message: "Could not generate URL for file",
        });
      }

      return res.json({
        status: "success",
        data: {
          signed_url: fileUrl,
          expires_in: expiresIn,
        },
      });
    } catch (error) {
      console.error("[storage.signed-url] Error:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to generate signed URL",
      });
    }
  });

  /**
   * @openapi
   * /api/storage/download/{fileId}:
   *   get:
   *     summary: Download file placeholder
   *     description: Placeholder endpoint; actual downloads use public or signed URLs.
   *     tags: [storage]
   *     parameters:
   *       - in: path
   *         name: fileId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Placeholder response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
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

  /**
   * @openapi
   * /api/storage/bucket:
   *   get:
   *     summary: Get bucket info
   *     description: Returns storage bucket details and whether it is public.
   *     tags: [storage]
   *     responses:
   *       200:
   *         description: Bucket information
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Bucket not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/storage/bucket - Return current bucket info and public status
  router.get("/bucket", async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const bucket = getBucketName();
      let info = null;
      try {
        const { data, error } = await supabase.storage.getBucket(bucket);
        if (!error && data) info = data;
      } catch {
        // ignore, fall back to listBuckets below
      }
      if (!info) {
        try {
          const { data: list } = await supabase.storage.listBuckets();
          info = Array.isArray(list) ? list.find((b) => b.name === bucket) : null;
        } catch {
          // ignore
        }
      }
      if (!info) {
        return res.status(404).json({
          status: "error",
          message: `Bucket '${bucket}' not found`,
        });
      }
        /**
         * @openapi
         * /api/storage/{fileId}:
         *   delete:
         *     summary: Delete a file from storage
         *     description: Deletes a file by object key from the configured Supabase bucket.
         *     tags: [storage]
         *     parameters:
         *       - in: path
         *         name: fileId
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: File deleted
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/Success'
         */
      return res.json({
        status: "success",
        data: {
          name: info.name,
          public: info.public === true,
          created_at: info.created_at || null,
          file_size_limit: info.file_size_limit || null,
        },
      });
    } catch (error) {
      console.error("[storage.bucket] Error:", error);
      return res.status(500).json({ status: "error", message: error.message });
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
