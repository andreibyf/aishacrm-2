/**
 * Braid Execution Module
 * Core tool execution engine with caching, security, and monitoring
 */

import { executeBraid } from '../../../braid-llm-kit/sdk/index.js';
import jwt from 'jsonwebtoken';
import { CRM_POLICIES } from './policies.js';
import { TOOL_REGISTRY } from './registry.js';
import { TOOL_CACHE_TTL, generateBraidCacheKey } from './registry.js';
import { trackRealtimeMetrics, logAuditEntry, extractEntityType } from './metrics.js';
import { createBackendDeps, filterSensitiveFields, validateToolArgs, isValidUUID } from './utils.js';
import { objectToPositionalArgs, normalizeToolArgs } from './analysis.js';
import cacheManager from '../cacheManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, '..', '..', '..', 'braid-llm-kit', 'examples', 'assistant');

/**
 * SECURITY: Verification token that must be passed to unlock tool execution.
 * This acts as a "key" that can only be obtained after tenant authorization passes.
 * The token is a simple object with verified: true to prevent accidental bypasses.
 */
export const TOOL_ACCESS_TOKEN = Object.freeze({
  verified: true,
  timestamp: Date.now(),
  source: 'tenant-authorization'
});

/**
 * Validates the tool access token before allowing execution.
 * @param {Object} accessToken - The access token to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateToolAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'object') {
    return false;
  }
  // Must have verified: true explicitly set
  if (accessToken.verified !== true) {
    return false;
  }
  // Must have a valid source identifier
  if (accessToken.source !== 'tenant-authorization') {
    return false;
  }
  return true;
}

/**
 * Execute a Braid tool
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments for the tool
 * @param {Object} tenantRecord - The tenant record (must be pre-authorized)
 * @param {string} userId - The user ID
 * @param {Object} accessToken - REQUIRED: Security token proving tenant authorization passed (default: false = denied)
 */
export async function executeBraidTool(toolName, args, tenantRecord, userId = null, accessToken = false) {
  // DEBUG: Log create_lead calls to debug field scrambling
  if (toolName === 'create_lead') {
    console.log('🔍 [DEBUG] create_lead called with args:', JSON.stringify(args, null, 2));
  }
  
  // SECURITY: Verify the access token before any tool execution
  // This is the "key to the toolshed" - without it, no tools can be accessed
  if (!validateToolAccessToken(accessToken)) {
    console.error('[Braid Security] Tool execution DENIED - invalid or missing access token', {
      toolName,
      hasToken: !!accessToken,
      tokenVerified: accessToken?.verified,
      tokenSource: accessToken?.source,
      tenantId: tenantRecord?.id || tenantRecord?.tenant_id,
      userId
    });
    return {
      tag: 'Err',
      error: { 
        type: 'AuthorizationError', 
        message: "I'm sorry, but I cannot execute this action without proper authorization. Please ensure you're logged in and have access to this tenant." 
      }
    };
  }

  const config = TOOL_REGISTRY[toolName];
  if (!config) {
    return {
      tag: 'Err',
      error: { type: 'UnknownTool', message: `Tool '${toolName}' not found in registry` }
    };
  }

  // === INPUT VALIDATION (Issue #6 from braid-refactoring-issues.md) ===
  const tenantUuidCandidate = tenantRecord?.id || tenantRecord?.tenant_id || null;
  const validation = validateToolArgs(toolName, args, {
    tenantUuid: tenantUuidCandidate,
    userId,
    confirmDelete: args?.confirmed === true || args?.force === true
  });
  if (!validation.valid) {
    console.warn('[Braid Validation] Tool args invalid', { toolName, errors: validation.errors });
    return {
      tag: 'Err',
      error: {
        type: 'ValidationError',
        message: validation.errors.join('; ')
      }
    };
  }
  if (validation.warnings.length > 0) {
    console.warn('[Braid Validation] Warnings:', { toolName, warnings: validation.warnings });
  }
  
  const braidPath = path.join(TOOLS_DIR, config.file);
  // Attach execution context so audit logs include tenant/user and tenant isolation has data
  const basePolicy = CRM_POLICIES[config.policy];
  
  // Extract user info from access token for audit logging and created_by fields
  const userRole = accessToken?.user_role || 'user';
  const userEmail = accessToken?.user_email || null;
  const userName = accessToken?.user_name || null;
  // Use userName for created_by (more readable), fallback to email
  const createdBy = userName || userEmail || null;
  
  // === ROLE-BASED ACCESS CONTROL ===
  // Check if the tool requires specific roles and verify user has permission
  if (basePolicy?.required_roles && basePolicy.required_roles.length > 0) {
    const hasRequiredRole = basePolicy.required_roles.includes(userRole);
    
    if (!hasRequiredRole) {
      console.warn('[Braid Security] Tool execution DENIED - insufficient role', {
        toolName,
        policy: config.policy,
        requiredRoles: basePolicy.required_roles,
        userRole,
        userId,
        tenantId: tenantRecord?.id
      });
      return {
        tag: 'Err',
        error: {
          type: 'InsufficientPermissions',
          message: `This operation requires ${basePolicy.required_roles.join(' or ')} role. Your current role (${userRole}) does not have permission.`
        }
      };
    }
  }

  // === RATE LIMITING ===
  // Check rate limits based on policy tool class
  if (basePolicy?.rate_limit) {
    const rateLimitKey = `braid:ratelimit:${tenantRecord?.id}:${userId || 'anonymous'}:${basePolicy.tool_class || 'default'}`;
    try {
      const currentCount = await cacheManager.get(rateLimitKey) || 0;
      const limit = basePolicy.rate_limit.requests_per_minute;
      
      if (currentCount >= limit) {
        console.warn('[Braid Security] Rate limit exceeded', {
          toolName,
          toolClass: basePolicy.tool_class,
          currentCount,
          limit,
          userId,
          tenantId: tenantRecord?.id
        });
        return {
          tag: 'Err',
          error: {
            type: 'RateLimitExceeded',
            message: `Rate limit exceeded for ${basePolicy.tool_class} operations. Please wait a moment before trying again.`,
            retryAfter: 60
          }
        };
      }
      
      // Increment the counter (TTL of 60 seconds for per-minute limiting)
      await cacheManager.set(rateLimitKey, currentCount + 1, 60);
    } catch (rateLimitErr) {
      // Don't block on rate limit errors, just log
      console.warn('[Braid Security] Rate limit check failed:', rateLimitErr.message);
    }
  }

  // === DELETE CONFIRMATION CHECK ===
  // For DELETE_OPERATIONS policy, require explicit confirmation
  if (basePolicy?.requires_confirmation && toolName.includes('delete')) {
    const confirmationProvided = args?.confirmed === true || args?.force === true;
    if (!confirmationProvided) {
      console.log('[Braid Security] Delete operation requires confirmation', { toolName, userId });
      return {
        tag: 'Err',
        error: {
          type: 'ConfirmationRequired',
          message: `This delete operation requires confirmation. Please provide { confirmed: true } to proceed.`,
          action: 'confirm_delete',
          toolName
        }
      };
    }
  }

  const policy = {
    ...basePolicy,
    context: {
      ...(basePolicy?.context || {}),
      tenant_id: tenantRecord?.tenant_id || null,
      user_id: userId || null
    }
  };
  // CRITICAL: Use tenantRecord.id (UUID) not tenant_id (slug) for API calls
  const tenantUuid = tenantRecord?.id || tenantRecord?.tenant_id || null;
  
  // Generate internal service JWT for server-to-server API calls
  const internalToken = jwt.sign(
    { sub: userId, tenant_id: tenantUuid, internal: true },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  // Use CRM_BACKEND_URL (set in docker-compose) or BACKEND_URL or sensible default
  // Inside Docker: CRM_BACKEND_URL=http://backend:3001
  // Outside Docker: BACKEND_URL=http://localhost:4001
  const backendUrl = process.env.CRM_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:4001';
  // Pass createdBy (userName or email) for created_by field injection in POST requests
  const deps = createBackendDeps(backendUrl, tenantUuid, userId, internalToken, createdBy);

  // Normalize arguments into a single object for Braid
  const normalizedArgs = normalizeToolArgs(toolName, args, tenantRecord);

  // Convert object args to positional array based on function signature
  const positionalArgs = objectToPositionalArgs(toolName, normalizedArgs);

  console.log(`[Braid Tool] Executing ${toolName}`, {
    braidPath,
    function: config.function,
    tenantUuid,
    argsPreview: JSON.stringify(positionalArgs).substring(0, 200)
  });

  // Check Redis cache for READ_ONLY tools
  const isReadOnly = config.policy === 'READ_ONLY';
  const cacheKey = generateBraidCacheKey(toolName, tenantUuid, normalizedArgs);

  if (isReadOnly) {
    try {
      const cachedResult = await cacheManager.get(cacheKey);
      if (cachedResult !== null) {
        console.log(`[Braid Tool] Cache HIT for ${toolName}`, { cacheKey: cacheKey.substring(0, 60) });
        
        // Track cache hit in real-time metrics
        trackRealtimeMetrics(tenantUuid, toolName, true, true, 0);
        
        // Log cache hit to audit (async, don't await)
        logAuditEntry({
          toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
          normalizedArgs, result: cachedResult, executionTimeMs: 0, cacheHit: true, supabase: deps.supabase
        });
        
        return cachedResult;
      }
      console.log(`[Braid Tool] Cache MISS for ${toolName}`, { cacheKey: cacheKey.substring(0, 60) });
    } catch (cacheErr) {
      // Cache errors should never block tool execution
      console.warn(`[Braid Tool] Cache lookup failed for ${toolName}:`, cacheErr.message);
    }
  }

  // Start timing for audit
  const startTime = Date.now();
  
  try {
    const result = await executeBraid(
      braidPath,
      config.function,
      policy,
      deps,
      positionalArgs,
      { cache: false, timeout: 30000 } // Disable in-memory cache, use Redis instead
    );
    
    console.log(`[Braid Tool] ${toolName} completed`, {
      resultTag: result?.tag,
      hasError: !!result?.error,
      errorType: result?.error?.type,
      errorMsg: result?.error?.message?.substring?.(0, 200),
      // For search/list operations, log result count for debugging
      resultCount: Array.isArray(result?.value) ? result.value.length : (result?.value?.length !== undefined ? result.value.length : 'N/A'),
      resultPreview: Array.isArray(result?.value) ? result.value.slice(0, 2).map(r => r?.first_name || r?.name || r?.id) : 'N/A'
    });

    // Cache successful READ_ONLY results in Redis
    if (isReadOnly && result?.tag === 'Ok') {
      try {
        const ttl = TOOL_CACHE_TTL[toolName] || TOOL_CACHE_TTL.DEFAULT;
        await cacheManager.set(cacheKey, result, ttl);
        console.log(`[Braid Tool] Cached ${toolName} result for ${ttl}s`);
      } catch (cacheErr) {
        // Cache errors should never block tool execution
        console.warn(`[Braid Tool] Cache store failed for ${toolName}:`, cacheErr.message);
      }
    }

    // Invalidate cache for WRITE operations (ensures fresh data after mutations)
    if (!isReadOnly && result?.tag === 'Ok') {
      try {
        // Determine which entity type was modified
        const entityPatterns = {
          lead: /^(create|update|delete|qualify|convert)_lead/,
          account: /^(create|update|delete)_account/,
          contact: /^(create|update|delete)_contact/,
          opportunity: /^(create|update|delete|mark_opportunity)_opportunity/,
          activity: /^(create|update|delete|mark_activity|schedule)_(activity|meeting)/,
          note: /^(create|update|delete)_note/,
          bizdev: /^(create|update|delete|promote|archive)_bizdev/,
        };

        let invalidatedEntity = null;
        for (const [entity, pattern] of Object.entries(entityPatterns)) {
          if (pattern.test(toolName)) {
            invalidatedEntity = entity;
            break;
          }
        }

        if (invalidatedEntity && tenantUuid) {
          // Invalidate all braid cache keys for this tenant and entity type
          const _pattern = `braid:${tenantUuid}:*${invalidatedEntity}*`;
          console.log(`[Braid Tool] Invalidating cache for ${invalidatedEntity} (tenant: ${tenantUuid?.substring(0, 8)}...)`);
          await cacheManager.invalidateTenant(tenantUuid, 'braid');
        }
      } catch (cacheErr) {
        // Cache errors should never block tool execution
        console.warn(`[Braid Tool] Cache invalidation failed for ${toolName}:`, cacheErr.message);
      }
    }

    // Calculate execution time
    const executionTimeMs = Date.now() - startTime;

    // Track real-time metrics (Redis)
    trackRealtimeMetrics(tenantUuid, toolName, result?.tag === 'Ok', false, executionTimeMs);

    // Log to audit (async, don't await to avoid blocking response)
    logAuditEntry({
      toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
      normalizedArgs, result, executionTimeMs, cacheHit: false, supabase: deps.supabase
    });

    // Apply field-level filtering based on user role (mask sensitive data)
    if (result?.tag === 'Ok' && result?.value) {
      const entityType = extractEntityType(toolName);
      if (entityType) {
        const filteredValue = filterSensitiveFields(result.value, entityType, userRole);
        return { ...result, value: filteredValue };
      }
    }

    return result;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    console.error(`[Braid Tool] ${toolName} EXCEPTION`, error.message, error.stack?.substring?.(0, 300));
    
    const errorResult = {
      tag: 'Err',
      error: { type: 'ExecutionError', message: error.message, stack: error.stack }
    };
    
    // Track error in real-time metrics
    trackRealtimeMetrics(tenantUuid, toolName, false, false, executionTimeMs);

    // Log error to audit (async, don't await)
    logAuditEntry({
      toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
      normalizedArgs, result: errorResult, executionTimeMs, cacheHit: false, supabase: deps.supabase
    });
    
    return errorResult;
  }
}