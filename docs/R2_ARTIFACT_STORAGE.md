# R2 Artifact Storage

## Overview

AiSHA CRM now supports **Cloudflare R2-backed artifact storage** for large AI-generated payloads. This prevents Postgres JSON bloat and enables scalable, immutable storage of:

- AI chat transcripts
- Agent execution traces
- Memory snapshots
- Tool call payloads
- Large variable-sized AI outputs

**Architecture:**
- **Postgres:** Stores lightweight pointer metadata in `artifact_refs` table (tenant-scoped, RLS-enabled)
- **R2:** Stores actual payload as immutable object (S3-compatible storage)
- **Backend:** Routes requests, enforces tenant isolation, manages uploads/retrievals

---

## Setup

### 1. Create Cloudflare R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2 Object Storage**
3. Click **Create bucket**
4. Name: `aishacrm-artifacts` (or your preferred name)
5. Location: Choose closest to your users

### 2. Generate R2 API Tokens

1. In R2 dashboard, go to **Manage R2 API Tokens**
2. Click **Create API Token**
3. Permissions: **Object Read & Write**
4. TTL: **Forever** (or set appropriate expiration)
5. Copy:
   - **Access Key ID**
   - **Secret Access Key**
6. Note your **Account ID** (found in R2 overview or URL)

### 3. Configure Environment Variables

Add to `backend/.env` or your secrets manager (Doppler):

```bash
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=aishacrm-artifacts

# Optional: Override default endpoint
# R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

**Security Note:** NEVER commit `.env` files. Use Doppler or platform secret management in production.

### 4. Run Database Migration

```bash
# Using Supabase SQL Editor
# Paste contents of backend/migrations/107_artifact_refs.sql

# OR via psql
psql $DATABASE_URL -f backend/migrations/107_artifact_refs.sql

# OR via backend script
cd backend && node run-migration.js 107_artifact_refs.sql
```

This creates:
- `artifact_refs` table with tenant_id, kind, r2_key, metadata
- Indexes for fast lookups: `(tenant_id, kind, created_at)`, `(entity_type, entity_id)`
- RLS policy matching existing backend patterns

### 5. Verify Configuration

```bash
curl http://localhost:4001/api/storage/r2/check | jq .
```

**Expected Response (Configured):**
```json
{
  "status": "ok",
  "r2": {
    "ok": true,
    "method": "HeadBucket"
  },
  "env": {
    "R2_ACCOUNT_ID": true,
    "R2_ACCESS_KEY_ID": true,
    "R2_SECRET_ACCESS_KEY": true,
    "R2_BUCKET": true
  }
}
```

**Expected Response (Not Configured):**
```json
{
  "status": "ok",
  "r2": {
    "ok": false,
    "reason": "missing_env",
    "missing": ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", ...]
  }
}
```

---

## API Endpoints

### Check R2 Status

```bash
GET /api/storage/r2/check
```

**Example:**
```bash
curl http://localhost:4001/api/storage/r2/check | jq .
```

---

### Store Artifact

```bash
POST /api/storage/artifacts
Content-Type: application/json
x-tenant-id: <tenant-uuid>

{
  "kind": "chat_transcript",
  "entity_type": "conversation",
  "entity_id": "uuid",
  "payload": { "messages": [...], "metadata": {...} },
  "content_type": "application/json"
}
```

**Example:**
```bash
curl -X POST http://localhost:4001/api/storage/artifacts \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: a11dfb63-4b18-4eb8-872e-747af2e37c46" \
  -d '{
    "kind": "chat_transcript",
    "entity_type": "conversation",
    "entity_id": "12345678-1234-1234-1234-123456789012",
    "payload": {
      "messages": [
        {"role": "user", "content": "What are my pending leads?"},
        {"role": "assistant", "content": "You have 5 pending leads..."}
      ],
      "metadata": {"duration_ms": 1234}
    }
  }' | jq .
```

**Response (201):**
```json
{
  "status": "ok",
  "artifact": {
    "id": "artifact-uuid",
    "tenant_id": "tenant-uuid",
    "kind": "chat_transcript",
    "entity_type": "conversation",
    "entity_id": "entity-uuid",
    "r2_key": "tenants/<tenant>/chat_transcript/2026/01/06/<uuid>.json",
    "content_type": "application/json",
    "size_bytes": 512,
    "sha256": "abc123...",
    "created_at": "2026-01-06T12:00:00Z"
  }
}
```

---

### Retrieve Artifact

```bash
GET /api/storage/artifacts/:id?tenant_id=<uuid>
x-tenant-id: <tenant-uuid>
```

**Example:**
```bash
curl "http://localhost:4001/api/storage/artifacts/artifact-uuid" \
  -H "x-tenant-id: a11dfb63-4b18-4eb8-872e-747af2e37c46" | jq .
```

**Response (200):**
```json
{
  "status": "ok",
  "artifact": {
    "id": "artifact-uuid",
    "tenant_id": "tenant-uuid",
    "kind": "chat_transcript",
    "r2_key": "tenants/<tenant>/chat_transcript/2026/01/06/<uuid>.json",
    "size_bytes": 512,
    "created_at": "2026-01-06T12:00:00Z"
  },
  "payload": {
    "messages": [...],
    "metadata": {...}
  }
}
```

**Query Parameters:**
- `raw=1` — Return raw bytes (sets `Content-Type` from artifact metadata)

---

## Tenant Isolation

**Multi-Tenant Safety is CRITICAL:**

1. **Middleware Enforcement:**
   - All routes use `req.tenant.id` from `validateTenantAccess` middleware
   - Never trust client-supplied `tenant_id` in production (use for dev only with guards)

2. **Database RLS:**
   - `artifact_refs` table has RLS enabled
   - Service role policy allows backend full access
   - Tenant scoping enforced in application code

3. **R2 Key Naming:**
   - Pattern: `tenants/<tenant-uuid>/<kind>/<YYYY>/<MM>/<DD>/<random-uuid>.json`
   - Prevents cross-tenant access even if tenant isolation fails

4. **Route Validation:**
   - GET `/artifacts/:id` validates `artifact.tenant_id === req.tenant.id`
   - Prevents artifact enumeration attacks

---

## Allowed Kinds

**Recommended artifact kinds** (add to allowlist as needed):

- `chat_transcript` — AI assistant conversation history
- `agent_trace` — Tool execution logs, reasoning steps
- `memory_snapshot` — AI memory state at point in time
- `tool_call_payload` — Large tool responses (e.g., document analysis)
- `attachment` — User-uploaded files linked to entities
- `workflow_state` — Automation execution history

**Pattern:** Use `snake_case`, be specific, avoid generic names like `data` or `payload`.

---

## Migration Strategy

**For existing Postgres JSON blobs:**

1. **Keep old data as-is** — No need to backfill
2. **New writes go to R2** — Update AI routes to use artifact storage
3. **Read path handles both:**
   ```javascript
   // Prefer R2, fallback to Postgres for legacy
   const transcript = await getArtifact(conversationId) || conversation.transcript_json;
   ```

4. **Optional backfill** (for large tenants):
   ```javascript
   // One-time migration script
   for (const conv of largeConversations) {
     const artifact = await createArtifact({
       kind: 'chat_transcript',
       entity_type: 'conversation',
       entity_id: conv.id,
       payload: conv.transcript_json
     });
     await db.update('conversations', conv.id, { 
       transcript_json: null, // Clear Postgres blob
       artifact_id: artifact.id // Link to R2
     });
   }
   ```

---

## Cost Considerations

**Cloudflare R2 Pricing (as of 2026):**

- **Storage:** $0.015/GB/month
- **Class A Operations (writes):** $4.50 per million
- **Class B Operations (reads):** $0.36 per million
- **Egress:** **FREE** (no bandwidth charges)

**Comparison to Postgres JSON:**
- Supabase Pro: $25/mo for 8GB database
- Large AI transcripts (10MB each) → 800 conversations max before upgrade
- R2: 1000 x 10MB = 10GB = **$0.15/month** + $0.005 in operations
- **Savings:** ~$25/month per 10GB of AI data

**When to use R2:**
- Payloads > 100KB (chat transcripts, traces, large documents)
- Variable/unpredictable growth (AI output sizes)
- Compliance/archival (immutable storage)

**When to use Postgres:**
- Small metadata (<10KB)
- Frequently updated data
- Transactional integrity required

### Automatic Metadata Offloading

The AI chat system automatically offloads large metadata to R2 using a **two-phase strategy**:

1. **Phase 1:** `tool_interactions` arrays are always offloaded (often large)
   - Creates `tool_interactions_ref` pointer in Postgres
   - Preserves `tool_interactions_count` for quick access

2. **Phase 2:** If remaining metadata exceeds threshold → offload entire metadata
   - Creates `artifact_metadata_ref` pointer
   - Keeps minimal envelope (model, iterations, usage, entity IDs)

**Threshold Configuration:**
```bash
# Default: 8KB (8000 bytes) - tuned for Postgres TOAST efficiency
AI_ARTIFACT_META_THRESHOLD_BYTES=8000
```

> **Note:** The 100KB guideline above is for **architectural decisions** (choosing R2 vs Postgres for new features). The 8KB implementation threshold is for **metadata column optimization** to keep `conversation_messages.metadata` fast and small.

---

## Troubleshooting

### "R2_ACCOUNT_ID is required"

**Fix:** Add env vars to `backend/.env` or Doppler config.

```bash
# Check if env vars are loaded
docker exec aishacrm-backend sh -c 'printenv | grep R2_'
```

### "Bucket not found" / HeadBucket fails

**Causes:**
1. Bucket name mismatch: `R2_BUCKET` must match Cloudflare dashboard
2. Wrong Account ID in endpoint URL
3. API token doesn't have bucket access

**Fix:**
```bash
# Verify bucket exists
curl "https://api.cloudflare.com/client/v4/accounts/$R2_ACCOUNT_ID/r2/buckets" \
  -H "Authorization: Bearer $R2_ACCESS_KEY_ID"
```

### "Artifact not found" for valid UUID

**Causes:**
1. Tenant isolation: artifact belongs to different tenant
2. Migration not applied: `artifact_refs` table missing

**Fix:**
```bash
# Check table exists
psql $DATABASE_URL -c "\d artifact_refs"

# Verify artifact tenant
psql $DATABASE_URL -c "SELECT id, tenant_id FROM artifact_refs WHERE id = 'artifact-uuid'"
```

### Tests fail with "missing migration"

**Fix:** Run migration before tests:
```bash
cd backend
node apply-single-sql.js migrations/107_artifact_refs.sql
```

---

## Security Checklist

- [ ] R2 credentials in Doppler/secrets manager (not `.env` committed to git)
- [ ] `validateTenantAccess` middleware applied to `/api/storage/artifacts` routes
- [ ] RLS enabled on `artifact_refs` table
- [ ] Service role key used for backend (not anon key)
- [ ] Artifact retrieval validates `tenant_id` match
- [ ] R2 bucket is private (not public-read)
- [ ] CORS configured on R2 bucket if using presigned URLs
- [ ] Rate limiting enabled on storage endpoints

---

## Production Deployment

**Checklist:**

1. **Secrets Management:**
   ```bash
   doppler secrets set R2_ACCOUNT_ID <value>
   doppler secrets set R2_ACCESS_KEY_ID <value>
   doppler secrets set R2_SECRET_ACCESS_KEY <value>
   doppler secrets set R2_BUCKET aishacrm-artifacts-prod
   ```

2. **Run Migration:**
   ```bash
   # Supabase SQL Editor
   # Paste backend/migrations/107_artifact_refs.sql
   # Click "Run"
   ```

3. **Verify Health:**
   ```bash
   curl https://api.aishacrm.com/api/storage/r2/check
   # Expect: { "r2": { "ok": true } }
   ```

4. **Update AI Routes:**
   - Modify `/api/ai/chat` to store transcripts via `/api/storage/artifacts`
   - Update `backend/lib/aiMemory/memoryStore.js` to use artifact storage
   - Add artifact cleanup cron (e.g., delete artifacts > 90 days for non-premium tenants)

5. **Monitor:**
   - Cloudflare R2 dashboard: Operations, storage usage
   - Backend logs: Search for `[storage.artifacts]` errors
   - Database: `SELECT COUNT(*), SUM(size_bytes) FROM artifact_refs GROUP BY kind;`

---

## Further Reading

- **Cloudflare R2 Docs:** https://developers.cloudflare.com/r2/
- **AiSHA Architecture:** `docs/AI_ARCHITECTURE_AISHA_AI.md`
- **Backend Testing:** `backend/__tests__/routes/storage.route.test.js`
- **Migration File:** `backend/migrations/107_artifact_refs.sql`

---

**Questions?** See `docs/AISHA_CRM_DEVELOPER_MANUAL.md` or file an issue.
