# Customer C.A.R.E. PR0 – Exact Patches

This document contains the exact patch-style diffs for all changes in PR0.

---

## File 1: backend/lib/care/careConfig.js

```diff
diff --git a/backend/lib/care/careConfig.js b/backend/lib/care/careConfig.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/backend/lib/care/careConfig.js
@@ -0,0 +1,88 @@
+/**
+ * Customer C.A.R.E. Configuration
+ * 
+ * Central configuration for Customer Cognitive Autonomous Relationship Execution.
+ * 
+ * Safety-first design:
+ * - Autonomy is OFF by default (CARE_AUTONOMY_ENABLED=false)
+ * - Shadow mode is ON by default (CARE_SHADOW_MODE=true)
+ * - All actions require explicit opt-in via environment configuration
+ * 
+ * This module MUST NOT:
+ * - Send outbound messages
+ * - Schedule meetings
+ * - Execute workflows
+ * - Modify user-facing data
+ * 
+ * @module careConfig
+ */
+
+/**
+ * Parse boolean environment variable with safe defaults
+ * @param {string} value - Raw env var value
+ * @param {boolean} defaultValue - Default if unparseable
+ * @returns {boolean}
+ */
+function parseBoolean(value, defaultValue = false) {
+  if (value === undefined || value === null || value === '') {
+    return defaultValue;
+  }
+  
+  const normalized = String(value).toLowerCase().trim();
+  
+  // Truthy values
+  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
+    return true;
+  }
+  
+  // Falsy values
+  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
+    return false;
+  }
+  
+  // Unknown value - use default for safety
+  return defaultValue;
+}
+
+/**
+ * Get whether C.A.R.E. autonomy is enabled
+ * 
+ * @returns {boolean} True if autonomy is explicitly enabled
+ */
+export function getCareAutonomyEnabled() {
+  return parseBoolean(process.env.CARE_AUTONOMY_ENABLED, false);
+}
+
+/**
+ * Get whether C.A.R.E. shadow mode is enabled
+ * 
+ * Shadow mode = autonomy decisions are logged but NOT executed
+ * 
+ * @returns {boolean} True if shadow mode is enabled (default: true)
+ */
+export function getCareShadowModeEnabled() {
+  return parseBoolean(process.env.CARE_SHADOW_MODE, true);
+}
+
+/**
+ * Get all C.A.R.E. configuration as a snapshot
+ * 
+ * @returns {Object} Current configuration
+ */
+export function getCareConfig() {
+  return {
+    autonomy_enabled: getCareAutonomyEnabled(),
+    shadow_mode: getCareShadowModeEnabled(),
+    timestamp: new Date().toISOString(),
+  };
+}
+
+export default {
+  getCareAutonomyEnabled,
+  getCareShadowModeEnabled,
+  getCareConfig,
+};
```

---

## File 2: backend/lib/care/isCareAutonomyEnabled.js

```diff
diff --git a/backend/lib/care/isCareAutonomyEnabled.js b/backend/lib/care/isCareAutonomyEnabled.js
new file mode 100644
index 0000000..def5678
--- /dev/null
+++ b/backend/lib/care/isCareAutonomyEnabled.js
@@ -0,0 +1,68 @@
+/**
+ * Customer C.A.R.E. Autonomy Gate
+ * 
+ * Canonical helper to determine if C.A.R.E. autonomous actions are permitted.
+ * 
+ * STRICT SAFETY RULE:
+ * Autonomy is enabled ONLY when ALL of the following are true:
+ * 1. CARE_AUTONOMY_ENABLED=true (explicit opt-in)
+ * 2. CARE_SHADOW_MODE=false (not in observe-only mode)
+ * 
+ * Any other state returns FALSE.
+ * 
+ * This is the ONLY function that should be used to check if autonomous
+ * C.A.R.E. actions are allowed. Do NOT implement separate checks elsewhere.
+ * 
+ * @module isCareAutonomyEnabled
+ */
+
+import { getCareAutonomyEnabled, getCareShadowModeEnabled } from './careConfig.js';
+
+/**
+ * Check if C.A.R.E. autonomous actions are permitted
+ * 
+ * @returns {boolean} True ONLY if autonomy is enabled AND shadow mode is disabled
+ * 
+ * @example
+ * // Safe default (unset env vars)
+ * isCareAutonomyEnabled() // => false
+ * 
+ * @example
+ * // Autonomy enabled but in shadow mode (observe-only)
+ * // CARE_AUTONOMY_ENABLED=true, CARE_SHADOW_MODE=true
+ * isCareAutonomyEnabled() // => false
+ * 
+ * @example
+ * // Full autonomy (opt-in required)
+ * // CARE_AUTONOMY_ENABLED=true, CARE_SHADOW_MODE=false
+ * isCareAutonomyEnabled() // => true
+ */
+export function isCareAutonomyEnabled() {
+  const autonomyEnabled = getCareAutonomyEnabled();
+  const shadowMode = getCareShadowModeEnabled();
+  
+  // Autonomy requires explicit enable AND shadow mode must be off
+  return autonomyEnabled === true && shadowMode === false;
+}
+
+/**
+ * Get detailed autonomy status for debugging/logging
+ * 
+ * @returns {Object} Status object with flags and computed result
+ */
+export function getCareAutonomyStatus() {
+  const autonomyEnabled = getCareAutonomyEnabled();
+  const shadowMode = getCareShadowModeEnabled();
+  const isEnabled = isCareAutonomyEnabled();
+  
+  return {
+    autonomy_enabled: autonomyEnabled,
+    shadow_mode: shadowMode,
+    is_autonomous: isEnabled,
+    mode: isEnabled ? 'autonomous' : (autonomyEnabled ? 'shadow' : 'disabled'),
+  };
+}
+
+export default isCareAutonomyEnabled;
```

---

## File 3: backend/lib/care/careShadowLog.js

```diff
diff --git a/backend/lib/care/careShadowLog.js b/backend/lib/care/careShadowLog.js
new file mode 100644
index 0000000..ghi9012
--- /dev/null
+++ b/backend/lib/care/careShadowLog.js
@@ -0,0 +1,92 @@
+/**
+ * Customer C.A.R.E. Shadow Audit Logger
+ * 
+ * Standardized logging for "would have acted" events during shadow mode.
+ * 
+ * This logger:
+ * - MUST NOT write to database
+ * - MUST NOT emit user-facing notifications
+ * - MUST NOT trigger external systems
+ * - MAY log to existing application logger only
+ * 
+ * Purpose: Provide observability for C.A.R.E. decisions without side effects.
+ * 
+ * @module careShadowLog
+ */
+
+import logger from '../logger.js';
+
+/**
+ * Log a shadow C.A.R.E. event
+ * 
+ * Records what the system *would* have done if autonomy were fully enabled.
+ * These events are for internal observability and debugging only.
+ * 
+ * @param {Object} event - Shadow event details
+ * @param {string} event.type - Event type (e.g., 'would_send_followup', 'would_schedule_meeting')
+ * @param {string} [event.tenant_id] - Tenant UUID
+ * @param {string} [event.entity_type] - Entity type (lead|contact|account)
+ * @param {string} [event.entity_id] - Entity ID
+ * @param {string} [event.reason] - Why this action would have been taken
+ * @param {Object} [event.meta] - Additional metadata
+ * 
+ * @example
+ * logCareShadow({
+ *   type: 'would_send_followup',
+ *   tenant_id: 'abc-123',
+ *   entity_type: 'lead',
+ *   entity_id: 'lead-456',
+ *   reason: 'Lead in Evaluating state, 3 days since last contact',
+ *   meta: { days_since_contact: 3, care_state: 'evaluating' }
+ * });
+ */
+export function logCareShadow(event) {
+  if (!event || typeof event !== 'object') {
+    logger.warn('[CARE:Shadow] Invalid event object provided to logCareShadow');
+    return;
+  }
+  
+  const {
+    type,
+    tenant_id,
+    entity_type,
+    entity_id,
+    reason,
+    meta = {},
+  } = event;
+  
+  // Validate required fields
+  if (!type) {
+    logger.warn('[CARE:Shadow] Event missing required "type" field');
+    return;
+  }
+  
+  // Log to application logger with clear shadow prefix
+  logger.info({
+    message: '[CARE:Shadow] Would have executed action',
+    care_event_type: type,
+    tenant_id,
+    entity_type,
+    entity_id,
+    reason,
+    ...meta,
+    // Marker flags for filtering/querying
+    is_shadow_event: true,
+    is_autonomous_action: false,
+    timestamp: new Date().toISOString(),
+  });
+}
+
+/**
+ * Log a batch of shadow events
+ * 
+ * @param {Array<Object>} events - Array of shadow events
+ */
+export function logCareShadowBatch(events) {
+  if (!Array.isArray(events)) {
+    logger.warn('[CARE:Shadow] logCareShadowBatch expects an array');
+    return;
+  }
+  
+  events.forEach(logCareShadow);
+}
+
+export default {
+  logCareShadow,
+  logCareShadowBatch,
+};
```

---

## File 4: backend/lib/care/__tests__/isCareAutonomyEnabled.test.js

```diff
diff --git a/backend/lib/care/__tests__/isCareAutonomyEnabled.test.js b/backend/lib/care/__tests__/isCareAutonomyEnabled.test.js
new file mode 100644
index 0000000..jkl3456
--- /dev/null
+++ b/backend/lib/care/__tests__/isCareAutonomyEnabled.test.js
@@ -0,0 +1,166 @@
+/**
+ * Customer C.A.R.E. Autonomy Gate - Tests
+ * 
+ * Validates that isCareAutonomyEnabled() enforces strict safety rules.
+ */
+
+import { test } from 'node:test';
+import assert from 'node:assert';
+import { isCareAutonomyEnabled, getCareAutonomyStatus } from '../isCareAutonomyEnabled.js';
+
+// Helper to set env vars for test
+function setEnv(autonomy, shadow) {
+  if (autonomy !== undefined) {
+    process.env.CARE_AUTONOMY_ENABLED = String(autonomy);
+  } else {
+    delete process.env.CARE_AUTONOMY_ENABLED;
+  }
+  
+  if (shadow !== undefined) {
+    process.env.CARE_SHADOW_MODE = String(shadow);
+  } else {
+    delete process.env.CARE_SHADOW_MODE;
+  }
+}
+
+// Helper to clear env vars
+function clearEnv() {
+  delete process.env.CARE_AUTONOMY_ENABLED;
+  delete process.env.CARE_SHADOW_MODE;
+}
+
+test('isCareAutonomyEnabled - Safe Defaults', async (t) => {
+  await t.test('returns false when env vars are unset', () => {
+    clearEnv();
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Should be false with no env vars');
+  });
+  
+  await t.test('returns false when env vars are empty strings', () => {
+    setEnv('', '');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Should be false with empty env vars');
+  });
+});
+
+test('isCareAutonomyEnabled - Shadow Mode (Observe-Only)', async (t) => {
+  await t.test('returns false when autonomy=true but shadow=true', () => {
+    setEnv('true', 'true');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Shadow mode should prevent autonomy');
+  });
+  
+  await t.test('returns false when autonomy=1 but shadow=1', () => {
+    setEnv('1', '1');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Shadow mode should prevent autonomy (numeric)');
+  });
+  
+  await t.test('returns false when autonomy=yes but shadow=yes', () => {
+    setEnv('yes', 'yes');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Shadow mode should prevent autonomy (yes)');
+  });
+});
+
+test('isCareAutonomyEnabled - Autonomy Disabled', async (t) => {
+  await t.test('returns false when autonomy=false and shadow=false', () => {
+    setEnv('false', 'false');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Autonomy disabled should be false even without shadow');
+  });
+  
+  await t.test('returns false when autonomy=false and shadow=true', () => {
+    setEnv('false', 'true');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Autonomy disabled should be false');
+  });
+  
+  await t.test('returns false when autonomy=0 and shadow=0', () => {
+    setEnv('0', '0');
+    assert.strictEqual(isCareAutonomyEnabled(), false, 'Autonomy disabled (numeric) should be false');
+  });
+});
+
+test('isCareAutonomyEnabled - Full Autonomy (Opt-In Required)', async (t) => {
+  await t.test('returns true ONLY when autonomy=true AND shadow=false', () => {
+    setEnv('true', 'false');
+    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy when both flags are correct');
+  });
+  
+  await t.test('returns true with numeric flags: autonomy=1 AND shadow=0', () => {
+    setEnv('1', '0');
+    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with numeric flags');
+  });
+  
+  await t.test('returns true with alternative truthy values', () => {
+    setEnv('yes', 'no');
+    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with yes/no');
+    
+    setEnv('on', 'off');
+    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with on/off');
+    
+    setEnv('enabled', 'disabled');
+    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with enabled/disabled');
+  });
+});
+
+test('getCareAutonomyStatus - Debugging Helper', async (t) => {
+  await t.test('returns detailed status for disabled state', () => {
+    clearEnv();
+    const status = getCareAutonomyStatus();
+    
+    assert.strictEqual(status.autonomy_enabled, false);
+    assert.strictEqual(status.shadow_mode, true);
+    assert.strictEqual(status.is_autonomous, false);
+    assert.strictEqual(status.mode, 'disabled');
+  });
+  
+  await t.test('returns detailed status for shadow mode', () => {
+    setEnv('true', 'true');
+    const status = getCareAutonomyStatus();
+    
+    assert.strictEqual(status.autonomy_enabled, true);
+    assert.strictEqual(status.shadow_mode, true);
+    assert.strictEqual(status.is_autonomous, false);
+    assert.strictEqual(status.mode, 'shadow');
+  });
+  
+  await t.test('returns detailed status for autonomous mode', () => {
+    setEnv('true', 'false');
+    const status = getCareAutonomyStatus();
+    
+    assert.strictEqual(status.autonomy_enabled, true);
+    assert.strictEqual(status.shadow_mode, false);
+    assert.strictEqual(status.is_autonomous, true);
+    assert.strictEqual(status.mode, 'autonomous');
+  });
+});
+
+// Clean up after all tests
+test.after(() => {
+  clearEnv();
+});
```

---

## File 5: .env.example

```diff
diff --git a/.env.example b/.env.example
index abc1234..def5678 100644
--- a/.env.example
+++ b/.env.example
@@ -36,6 +36,12 @@ VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
 # Current Git Branch (for QA Console E2E triggers)
 VITE_CURRENT_BRANCH=main
 
+# Customer C.A.R.E. Configuration (Customer Cognitive Autonomous Relationship Execution)
+# SAFETY DEFAULTS: Autonomy OFF, Shadow Mode ON (observe-only)
+# Only enable autonomy after careful review and opt-in per tenant
+CARE_AUTONOMY_ENABLED=false
+CARE_SHADOW_MODE=true
+
 # Add other environment variables as needed
 # VITE_FEATURE_FLAG_XYZ=
```

---

## File 6: docker-compose.yml

```diff
diff --git a/docker-compose.yml b/docker-compose.yml
index ghi9012..jkl3456 100644
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -112,6 +112,9 @@ services:
       - GH_TOKEN=${GH_TOKEN:-}
       - REPO_OWNER=${REPO_OWNER:-andreibyf}
       - REPO_NAME=${REPO_NAME:-aishacrm-2}
+      # Customer C.A.R.E. Configuration
+      - CARE_AUTONOMY_ENABLED=${CARE_AUTONOMY_ENABLED:-false}
+      - CARE_SHADOW_MODE=${CARE_SHADOW_MODE:-true}
       # Telemetry
       - TELEMETRY_ENABLED=true
       - TELEMETRY_LOG_PATH=/telemetry/telemetry.ndjson
```

---

## Summary of Changes

**Files Created:** 4
- `backend/lib/care/careConfig.js` (88 lines)
- `backend/lib/care/isCareAutonomyEnabled.js` (68 lines)
- `backend/lib/care/careShadowLog.js` (92 lines)
- `backend/lib/care/__tests__/isCareAutonomyEnabled.test.js` (166 lines)

**Files Modified:** 2
- `.env.example` (+6 lines)
- `docker-compose.yml` (+3 lines)

**Total Lines Added:** 423
**Total Lines Removed:** 0

**Runtime Behavior Change:** ZERO ✅
