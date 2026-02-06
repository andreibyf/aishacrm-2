# C.A.R.E. System Setup Guide

**Version:** 3.0.x  
**Last Updated:** February 6, 2026  
**Purpose:** Complete guide for configuring C.A.R.E. (Customer Adaptive Response Engine)

---

## Overview

C.A.R.E. configuration is **100% UI-driven** through the Workflow Builder. No manual API calls, SQL inserts, or environment variable configuration is required for per-tenant setup.

### Configuration Architecture

**Two-Level Configuration Model:**

1. **System-Wide Settings** (One-Time Setup)
   - Controlled by environment variables (Doppler)
   - Enables/disables C.A.R.E. features globally
   - Set once per environment (production, development, staging)

2. **Per-Tenant Settings** (UI-Driven)
   - Configured via Workflow Builder interface
   - Automatically synced to `care_workflow_config` database table
   - No manual intervention required

---

## System-Wide Setup (One-Time)

### Environment Variables (via Doppler)

Configure these variables in your Doppler project for each environment:

#### Production Environment (`prd_prd` config)

```bash
AI_TRIGGERS_WORKER_ENABLED=true              # Enable automatic trigger detection
AI_TRIGGERS_WORKER_INTERVAL_MS=15000         # Poll every 15 seconds
CARE_STATE_WRITE_ENABLED=true                # Allow state persistence globally
CARE_WORKFLOW_TRIGGERS_ENABLED=true          # Allow workflow webhook triggers globally
CARE_AUTONOMY_ENABLED=false                  # Master kill switch for autonomous actions (default: false)
CARE_SHADOW_MODE=true                        # System-wide observe-only mode (default: true)
```

#### Development Environment (`dev_personal` config)

```bash
AI_TRIGGERS_WORKER_ENABLED=false             # Disable automatic polling (manual triggers only)
AI_TRIGGERS_WORKER_INTERVAL_MS=15000         # Polling interval (if enabled)
CARE_STATE_WRITE_ENABLED=true                # Allow state persistence
CARE_WORKFLOW_TRIGGERS_ENABLED=true          # Allow workflow triggers
CARE_AUTONOMY_ENABLED=false                  # Master kill switch for autonomous actions (default: false)
CARE_SHADOW_MODE=true                        # System-wide observe-only mode (default: true)
```

### What Each Variable Does

| Variable | Purpose | Production | Development |
|----------|---------|------------|-------------|
| `AI_TRIGGERS_WORKER_ENABLED` | Enable background worker to automatically detect triggers | `true` | `false` |
| `AI_TRIGGERS_WORKER_INTERVAL_MS` | How often worker polls for triggers (milliseconds) | `15000` | `15000` |
| `CARE_STATE_WRITE_ENABLED` | Allow C.A.R.E. to write relationship state changes to database | `true` | `true` |
| `CARE_WORKFLOW_TRIGGERS_ENABLED` | Allow C.A.R.E. to send webhook notifications to workflows | `true` | `true` |
| `CARE_AUTONOMY_ENABLED` | **Master kill switch** for autonomous actions (requires explicit opt-in) | `false` | `false` |
| `CARE_SHADOW_MODE` | System-wide observe-only mode (logs decisions but never executes) | `true` | `true` |

**Note**: These control **system behavior**, not per-tenant configuration. Per-tenant settings come from the Workflow Builder UI.

#### Autonomy Safety Gates

For C.A.R.E. to execute autonomous actions (without human approval), **ALL** of these must be true:

1. ✅ `CARE_AUTONOMY_ENABLED=true` (system-wide kill switch)
2. ✅ `CARE_SHADOW_MODE=false` (not in observe-only mode)
3. ✅ Entity has `hands_off_enabled=true` (per-lead/contact flag)
4. ✅ No open escalations for the entity
5. ✅ Action not on prohibited list

**If ANY gate fails → Action is blocked or escalated to human.**

**Safe Defaults** (when variables not set in Doppler):
- `CARE_AUTONOMY_ENABLED` defaults to `false` (no autonomous actions)
- `CARE_SHADOW_MODE` defaults to `true` (observe-only)
- This means C.A.R.E. will **only log and observe**, never execute actions

**Shadow Mode Behavior:**
- **System-wide** (`CARE_SHADOW_MODE=true`): Global observe-only, overrides all tenant settings
- **Per-tenant** (CARE Start node config): Tenant-specific shadow mode (only applies if system-wide is `false`)
- Use system-wide shadow mode for initial deployment, then enable per-tenant for gradual rollout

---

## Per-Tenant Setup (UI-Driven)

### Step 1: Open Workflow Builder

1. Log in to AiSHA CRM
2. Navigate to **Workflows** in the main menu
3. Click **"Create New Workflow"** button

### Step 2: Add CARE Start Node

1. From the **Node Library** panel on the left, locate the **"CARE Start"** trigger node
2. Drag the **"CARE Start"** node onto the workflow canvas
3. Position it as the first node in your workflow

### Step 3: Configure CARE Start Node

Click on the **CARE Start** node to open its configuration panel:

#### Required Settings

- **Tenant ID** (required)
  - Enter the tenant's UUID (e.g., `a11dfb63-4b18-4eb8-872e-747af2e37c46`)
  - This links the workflow to a specific tenant
  - Must be a valid UUID from the `tenants` table

#### Optional Settings (with Defaults)

- **Enabled** (toggle, default: `true`)
  - Turn C.A.R.E. on/off for this tenant
  - Disable to pause C.A.R.E. without deleting workflow

- **Shadow Mode** (toggle, default: `true`)
  - When `true`: C.A.R.E. observes and logs but doesn't trigger workflows
  - When `false`: C.A.R.E. actively triggers workflows
  - **Recommended**: Keep enabled for initial testing

- **State Write Enabled** (toggle, default: `false`)
  - When `true`: C.A.R.E. can update relationship states in database
  - When `false`: C.A.R.E. only proposes state changes (doesn't write)
  - **Recommended**: Start with disabled, enable after testing

- **Webhook Timeout** (number, default: `3000`)
  - Maximum time (milliseconds) to wait for workflow webhook response
  - Increase if workflows are slow to respond
  - Range: 1000-30000 ms

- **Max Retries** (number, default: `2`)
  - Number of retry attempts if webhook fails
  - Increase for unreliable network conditions
  - Range: 0-5

### Step 4: Build Your Workflow

Add additional nodes to define what happens when C.A.R.E. detects a trigger:

**Example Workflow Steps:**

1. **CARE Start** (trigger) → Receives C.A.R.E. trigger payload
2. **Filter** → Check trigger type (e.g., `lead_stagnant` only)
3. **Create Task** → Assign follow-up task to sales rep
4. **Send Email** → Notify manager of stagnant lead
5. **Log Activity** → Record C.A.R.E. intervention in CRM

### Step 5: Save Workflow

1. Click the **"Save Workflow"** button in the top toolbar
2. Backend automatically executes `syncCareWorkflowConfig()` function:
   - Finds the CARE Start node in your workflow
   - Extracts configuration from node settings
   - Upserts entry in `care_workflow_config` table
   - Generates webhook URL: `http://backend:3001/api/workflows/{workflow_id}/webhook`
   - Links workflow to C.A.R.E. system

**No manual API calls or SQL inserts required!** Everything is handled automatically.

---

## Important Constraints

### One C.A.R.E. Workflow Per Tenant

The `care_workflow_config` table has a **PRIMARY KEY on `tenant_id`**, meaning:

- Each tenant can have **multiple workflows** with CARE Start nodes
- Only the **most recently saved** workflow becomes active
- Saving a new CARE workflow **overwrites** the previous configuration
- Previous workflows remain in the database but are **not triggered by C.A.R.E.**

**Example Scenario:**

```
1. Create "Stagnant Lead Response" workflow with CARE Start → Save
   → care_workflow_config points to this workflow

2. Create "Hot Lead Escalation" workflow with CARE Start → Save
   → care_workflow_config now points to THIS workflow
   → "Stagnant Lead Response" workflow is no longer triggered by C.A.R.E.
```

**Recommendation**: Design **one comprehensive C.A.R.E. workflow** per tenant that handles all trigger types using conditional logic.

---

## Removing C.A.R.E. Configuration

To completely disable C.A.R.E. for a tenant:

1. Open the active C.A.R.E. workflow in Workflow Builder
2. Delete the **CARE Start** node from the canvas
3. Click **"Save Workflow"**
4. Backend automatically deletes the `care_workflow_config` entry
5. C.A.R.E. no longer triggers workflows for this tenant

**Alternative**: Keep the CARE Start node but toggle **"Enabled"** to `false` in node settings.

---

## Verification & Troubleshooting

### Verify Configuration

**Database Query** (via Supabase SQL Editor or backend):

```sql
SELECT 
  tenant_id, 
  workflow_id, 
  webhook_url, 
  is_enabled, 
  shadow_mode, 
  state_write_enabled,
  webhook_timeout_ms, 
  webhook_max_retries
FROM care_workflow_config
WHERE tenant_id = 'YOUR_TENANT_UUID';
```

**Expected Result** (if configured):

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "workflow_id": "da91c58e-6ecf-4e5d-aa54-edcfaffc0b3f",
  "webhook_url": "http://backend:3001/api/workflows/da91c58e-6ecf-4e5d-aa54-edcfaffc0b3f/webhook",
  "is_enabled": true,
  "shadow_mode": true,
  "state_write_enabled": false,
  "webhook_timeout_ms": 3000,
  "webhook_max_retries": 2
}
```

### Integration Test (Backend)

```javascript
// Test C.A.R.E. configuration retrieval
import { getCareConfigForTenant } from './lib/care/careTenantConfig.js';

const config = await getCareConfigForTenant('YOUR_TENANT_UUID');
console.log('C.A.R.E. Config:', config);
console.log('Config Source:', config._source); // Should be "database"
```

**Expected Output:**

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "workflow_id": "da91c58e-6ecf-4e5d-aa54-edcfaffc0b3f",
  "webhook_url": "http://backend:3001/api/workflows/.../webhook",
  "is_enabled": true,
  "shadow_mode": true,
  "state_write_enabled": false,
  "webhook_timeout_ms": 3000,
  "webhook_max_retries": 2,
  "_source": "database"  // ← Confirms database-first configuration
}
```

---

## Troubleshooting

### "C.A.R.E. workflow not triggering"

**Possible Causes:**

1. **Workflow not saved**: Ensure you clicked "Save Workflow" after adding CARE Start node
2. **Configuration not enabled**: Check `is_enabled` in database or node settings
3. **Shadow mode active**: Verify `shadow_mode` is `false` if you want active triggering
4. **Worker disabled**: Check `AI_TRIGGERS_WORKER_ENABLED` environment variable (production only)
5. **No triggers detected**: C.A.R.E. only fires when trigger conditions are met

**Diagnostic Steps:**

```sql
-- Check if config exists
SELECT * FROM care_workflow_config WHERE tenant_id = 'YOUR_TENANT_UUID';

-- Check recent C.A.R.E. audit logs
SELECT * FROM care_audit_log 
WHERE tenant_id = 'YOUR_TENANT_UUID' 
ORDER BY ts DESC 
LIMIT 10;

-- Check workflow execution history
SELECT * FROM workflow_executions 
WHERE workflow_id = 'YOUR_WORKFLOW_UUID' 
ORDER BY started_at DESC 
LIMIT 10;
```

### "Saved C.A.R.E. workflow but config not updated"

**Possible Causes:**

1. **Backend error**: Check backend logs for `syncCareWorkflowConfig` errors
2. **Missing tenant_id**: CARE Start node must have tenant_id configured
3. **Workflow save failed**: Verify workflow save API returned success (status 200/201)

**Diagnostic Steps:**

```bash
# Check backend logs for sync errors
docker logs aishacrm-backend --tail=100 | grep -i "syncCareWorkflowConfig"

# Or in production
ssh andreibyf@147.189.173.237
docker logs aishacrm-backend --tail=100 | grep -i "syncCareWorkflowConfig"
```

### "Multiple C.A.R.E. workflows for same tenant"

**This is normal behavior!** The `care_workflow_config` table has a PRIMARY KEY constraint on `tenant_id`, meaning:

- You can create multiple workflows with CARE Start nodes
- Only the **most recently saved** workflow is active
- Previous workflows remain in database but are **not triggered by C.A.R.E.**

**Solution**: Design one comprehensive workflow per tenant, or archive old workflows after creating new ones.

### "Configuration shows wrong workflow_id"

This means you saved a **different** workflow after the one you're looking at. The active C.A.R.E. workflow is always the **most recently saved** workflow with a CARE Start node.

**To fix:**

1. Open the workflow you want to be active
2. Click "Save Workflow" (even if unchanged)
3. This workflow becomes the active C.A.R.E. workflow

---

## Best Practices

### 1. Start with Shadow Mode Enabled

- **Recommended**: Keep `shadow_mode: true` when first setting up C.A.R.E.
- Allows you to observe what C.A.R.E. would do without actually triggering workflows
- Review `care_audit_log` table to see detected triggers and proposed actions
- Disable shadow mode only after verifying behavior is correct

### 2. Test with Manual Triggers First

Development environment has `AI_TRIGGERS_WORKER_ENABLED=false` by default, so:

- Use Manual Trigger feature in Workflow Builder UI
- Test different trigger payloads
- Verify workflow executes correctly
- Check audit logs for expected behavior

### 3. Design Comprehensive Workflows

Since each tenant can only have **one active C.A.R.E. workflow**:

- Use **Filter** nodes to handle different trigger types
- Add conditional logic for different escalation levels
- Create reusable sub-workflows for common actions
- Avoid creating separate workflows for each trigger type

### 4. Monitor Audit Logs

C.A.R.E. logs all decisions to `care_audit_log` table:

```sql
SELECT 
  event_type,
  trigger_type,
  entity_type,
  entity_id,
  reason,
  policy_gate_result,
  ts
FROM care_audit_log
WHERE tenant_id = 'YOUR_TENANT_UUID'
ORDER BY ts DESC
LIMIT 50;
```

Review logs regularly to:
- Verify triggers are being detected
- Identify false positives or missed triggers
- Optimize workflow logic based on actual behavior

### 5. Use Descriptive Workflow Names

Name workflows clearly to indicate they're C.A.R.E.-enabled:

- ✅ Good: "C.A.R.E. Lead Response Automation"
- ✅ Good: "Customer Health Monitoring (C.A.R.E.)"
- ❌ Bad: "New Workflow 1"
- ❌ Bad: "Test"

This helps identify active C.A.R.E. workflows when multiple exist.

---

## Advanced Configuration

### Custom Webhook Secrets (Optional)

By default, C.A.R.E. webhooks are sent without authentication (internal service-to-service calls). For external integrations or enhanced security:

1. **Backend**: Add `webhook_secret` to CARE Start node config (UI update required)
2. **Receiver**: Verify HMAC signature using secret
3. **Storage**: Secret stored in `care_workflow_config.webhook_secret` column

**Note**: This feature requires UI update to expose webhook_secret field in CARE Start node configuration panel.

### State Persistence Strategy

When `state_write_enabled: true`, C.A.R.E. can update relationship states in the database:

**Conservative Approach** (Recommended for initial setup):
```javascript
state_write_enabled: false  // C.A.R.E. only proposes state changes
```

**Aggressive Approach** (After validation):
```javascript
state_write_enabled: true   // C.A.R.E. automatically updates states
```

**Hybrid Approach** (Best Practice):
- Start with `state_write_enabled: false`
- Monitor proposed state changes in audit logs
- Enable `state_write_enabled: true` for specific trigger types only
- Use workflow conditional logic to control when states are written

---

## Migration from Legacy Configuration

If you previously configured C.A.R.E. via environment variables or manual database inserts:

### Old Approach (Deprecated)

```bash
# ❌ OLD: Environment variables for per-tenant config
CARE_WORKFLOW_ESCALATION_WEBHOOK_URL=https://...
CARE_WORKFLOW_WEBHOOK_SECRET=secret
```

### New Approach (Current)

1. **Remove** environment variables from `.env` or Doppler (system-wide vars only)
2. **Create** workflow with CARE Start node in Workflow Builder
3. **Configure** node settings in UI panel
4. **Save** workflow → Automatic database sync

**No manual API calls or SQL required!**

---

## Summary

**C.A.R.E. Configuration Checklist:**

- [✓] System-wide environment variables set in Doppler (one-time)
- [✓] Workflow created with CARE Start node
- [✓] CARE Start node configured (tenant_id, enabled, shadow_mode, etc.)
- [✓] Workflow saved → Automatic sync to `care_workflow_config` table
- [✓] Database entry verified via SQL query
- [✓] Integration tested via backend script
- [✓] Audit logs monitored for trigger detection
- [✓] Shadow mode disabled when ready for production

**You're ready to use C.A.R.E.!** 🎉

---

## Support

For additional help:

- **Documentation**: [CARE_CUSTOMER_ADAPTIVE_RESPONSE_ENGINE.md](./CARE_CUSTOMER_ADAPTIVE_RESPONSE_ENGINE.md)
- **Backend Code**: `backend/lib/care/` directory
- **Workflow Sync**: `backend/routes/workflows.js` → `syncCareWorkflowConfig()`
- **Database Schema**: `care_workflow_config` table definition

