/**
 * Cloudflare R2 helper (S3-compatible) - server-side use only.
 *
 * Env vars:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *   (optional) R2_ENDPOINT  - defaults to https://<accountId>.r2.cloudflarestorage.com
 *
 * Notes:
 * - Keep credentials server-side. Prefer presigned URLs later if you want direct browser uploads.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { randomUUID, createHash } from "crypto";

/** @returns {string} */
function getR2Endpoint() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const explicit = process.env.R2_ENDPOINT;
  if (explicit) return explicit;
  if (!accountId) throw new Error("R2_ACCOUNT_ID is required (or set R2_ENDPOINT)");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** @returns {string} */
export function getR2Bucket() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET is required");
  return bucket;
}

/** @returns {S3Client} */
export function getR2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
  }

  return new S3Client({
    region: "auto",
    endpoint: getR2Endpoint(),
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Build a tenant-scoped R2 key.
 * @param {{tenantId: string, kind: string, ext?: string}} args
 */
export function buildTenantKey({ tenantId, kind, ext = "json" }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const id = randomUUID();
  return `tenants/${tenantId}/${kind}/${yyyy}/${mm}/${dd}/${id}.${ext}`;
}

/**
 * Upload a buffer to R2.
 * @param {{key: string, body: Buffer, contentType: string}} args
 */
export async function putObject({ key, body, contentType }) {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const sha256 = createHash("sha256").update(body).digest("hex");

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return { bucket, key, sizeBytes: body.length, sha256, contentType };
}

/**
 * Fetch an object from R2. Returns Buffer.
 * @param {{key: string}} args
 */
export async function getObject({ key }) {
  const client = getR2Client();
  const bucket = getR2Bucket();

  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  // resp.Body is a ReadableStream in Node; convert to Buffer
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  return {
    bucket,
    key,
    body,
    contentType: resp.ContentType || "application/octet-stream",
    contentLength: resp.ContentLength ?? body.length,
    etag: resp.ETag || null,
  };
}

/**
 * Basic connectivity check.
 * Attempts HeadBucket, then ListObjectsV2 (max 1) as fallback.
 */
export async function checkR2Access() {
  const client = getR2Client();
  const bucket = getR2Bucket();

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true, method: "HeadBucket" };
  } catch (_e) {
    // Some R2 configurations can reject HeadBucket; try list as a more permissive call
    try {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      return { ok: true, method: "ListObjectsV2" };
    } catch (e2) {
      return { ok: false, method: "HeadBucket/ListObjectsV2", error: String(e2?.message || e2) };
    }
  }
}
