# Production API Key Error Fix

## Problem Statement

Production environment was returning the following error when making AI chat requests:

```json
{
  "status": "error",
  "message": "401 Incorrect API key provided: sk-proj-************************************************...KLAA."
}
```

The error indicated that an OpenAI API key was being passed to OpenAI's API, but OpenAI was rejecting it as invalid.

## Root Cause Analysis

The issue was caused by **malformed API keys stored in the database** that contained:
- Trailing newlines (`\n`)
- Carriage returns (`\r`)
- Tab characters (`\t`)
- Leading/trailing whitespace

These invisible characters were being included when API keys were copy-pasted from the OpenAI dashboard or other sources, causing OpenAI to reject them as invalid.

## Solution

Implemented comprehensive API key validation and cleaning across the entire resolution chain:

### 1. API Key Resolution (`backend/lib/aiEngine/keyResolver.js`)

**Added aggressive key cleaning:**
```javascript
const trimmedKey = String(k).replace(/[\r\n\t]/g, '').trim();
```

This removes:
- Newlines (`\n`)
- Carriage returns (`\r`)
- Tab characters (`\t`)
- Leading/trailing spaces

**Added format validation for OpenAI keys:**
- Must start with `sk-`
- Length must be between 20-300 characters
- If validation fails, falls back to next key source instead of returning invalid key

**Applied to all key sources:**
1. ✅ `tenant_integrations` table (per-tenant keys)
2. ✅ `system_settings` table (system-level keys)
3. ✅ `users` table (legacy admin keys)
4. ✅ Environment variables (`OPENAI_API_KEY`, etc.)

### 2. Request Handler Validation (`backend/routes/ai.js`)

**Added pre-flight validation before creating OpenAI client:**
```javascript
// Check key exists
if (!keyToUse || keyToUse.trim().length === 0) {
  return res.status(501).json({ 
    status: 'error', 
    message: 'API key not configured for provider...'
  });
}

// Validate OpenAI key format
if (effectiveProvider === 'openai') {
  if (!trimmedKey.startsWith('sk-')) {
    return res.status(501).json({ 
      status: 'error', 
      message: 'Invalid OpenAI API key configuration...'
    });
  }
  if (trimmedKey.length < 20 || trimmedKey.length > 300) {
    return res.status(501).json({ 
      status: 'error', 
      message: 'Invalid OpenAI API key configuration (unusual length)...'
    });
  }
}
```

This prevents invalid keys from reaching OpenAI's API, providing clearer error messages to users.

### 3. Enhanced Logging

**Added detailed logging at every step:**

```javascript
console.log('[AIEngine][KeyResolver] API key resolution:', {
  provider: 'openai',
  tenantSlug: 'my-tenant',
  hasExplicitKey: false,
  hasHeaderKey: false,
  hasUserKey: false,
  resolvedKeyExists: true,
  resolvedKeyLength: 164,
  resolvedKeyPrefix: 'sk-proj'
});
```

This helps diagnose:
- Which key source was used
- Whether the key was found
- Basic validation of the key format
- The full resolution path

### 4. Test Suite

Created comprehensive test suite (`backend/__tests__/ai/apiKeyValidation.test.js`):
- ✅ Removes newlines and tabs
- ✅ Removes leading/trailing whitespace
- ✅ Handles CRLF line endings
- ✅ Preserves valid keys
- ✅ Validates sk- prefix
- ✅ Validates reasonable length
- ✅ Rejects malformed keys

## How to Fix Existing Keys

If you have existing API keys in production that are causing this error:

### Option 1: Update via Supabase Dashboard

1. Go to Supabase Dashboard → Table Editor → `tenant_integrations`
2. Find the row with the malformed API key
3. Edit the `api_credentials` JSONB field
4. Ensure the `api_key` field has NO newlines, tabs, or extra spaces
5. Save the changes

### Option 2: Update via SQL

```sql
-- Check current key (will show invisible characters)
SELECT 
  id,
  tenant_id,
  api_credentials->>'api_key' as api_key,
  length(api_credentials->>'api_key') as key_length
FROM tenant_integrations
WHERE integration_type = 'openai_llm';

-- Update to clean key (replace YOUR_KEY with actual key)
UPDATE tenant_integrations
SET api_credentials = jsonb_set(
  api_credentials,
  '{api_key}',
  to_jsonb(trim(both from 'YOUR_KEY'::text))
)
WHERE integration_type = 'openai_llm'
  AND tenant_id = 'your-tenant-slug';
```

### Option 3: Re-enter via UI

If the system has a UI for managing API keys:
1. Delete the existing key
2. Copy the key from OpenAI dashboard
3. **IMPORTANT:** Paste into a text editor first and verify no extra characters
4. Copy the cleaned key and paste into the CRM
5. Save

## Prevention

The fix automatically cleans keys going forward, so this issue should not recur. However, best practices:

1. **Always trim keys when copy-pasting:**
   - Copy from OpenAI dashboard
   - Paste into a text editor first
   - Remove any extra whitespace/newlines
   - Then paste into CRM

2. **Validate keys before saving:**
   - Check they start with `sk-`
   - Check length is reasonable (typically 51-164 characters)
   - No invisible characters

3. **Use environment variables when possible:**
   - Environment variables are less prone to copy-paste errors
   - Doppler automatically handles trimming

## Testing

To test the fix works:

```bash
# Run the validation test suite
cd backend
node --test __tests__/ai/apiKeyValidation.test.js

# Should see all 9 tests pass:
# ✓ API key cleaning - removes newlines and tabs
# ✓ API key cleaning - removes leading/trailing whitespace
# ✓ API key cleaning - handles multiple newlines
# ✓ API key cleaning - preserves valid key
# ✓ API key validation - accepts sk- prefix
# ✓ API key validation - accepts reasonable length
# ✓ API key validation - rejects too short key
# ✓ API key validation - rejects wrong prefix
# ✓ API key cleaning - handles CRLF line endings
```

## Monitoring

After deploying to production, monitor logs for these new messages:

**Success path:**
```
[AIEngine][KeyResolver] Using tenant-specific API key from tenant_integrations for provider: openai
[AI Chat] API key resolution: { resolvedKeyExists: true, resolvedKeyLength: 164, ... }
```

**Error path (key needs fixing):**
```
[AIEngine][KeyResolver] Invalid OpenAI API key format in tenant_integrations (must start with sk-)
[AIEngine][KeyResolver] Suspicious OpenAI API key length: 500 (expected 20-300 chars)
[AI Chat] ERROR: Invalid OpenAI API key format (must start with sk-)
```

## Rollout

This fix is **non-breaking** and can be deployed immediately:
- ✅ Existing valid keys continue to work
- ✅ Malformed keys are automatically cleaned
- ✅ Better error messages for truly invalid keys
- ✅ Improved logging for debugging

## Related Files

- `backend/lib/aiEngine/keyResolver.js` - Core key resolution logic
- `backend/routes/ai.js` - Chat endpoint validation
- `backend/__tests__/ai/apiKeyValidation.test.js` - Test suite
- `BUGFIX_API_KEY_ERROR.md` - This document

## Summary

The production API key error has been fixed by:
1. **Cleaning** all API keys to remove invisible characters
2. **Validating** keys before passing to OpenAI
3. **Logging** the resolution path for debugging
4. **Testing** the fix with a comprehensive test suite

Users will now see clearer error messages if their keys are invalid, and the system will automatically clean keys that have formatting issues but are otherwise valid.
