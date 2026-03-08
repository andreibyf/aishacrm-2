// Core HTTP client for backend API communication
// Extracted from src/api/entities.js
import { createMockUser, isLocalDevMode } from '../mockData';
import { apiHealthMonitor } from '../../utils/apiHealthMonitor';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { logDev } from '../../utils/devLogger';
import { getBackendUrl } from '../backendUrl';

// Build version marker for deployment verification.
// Always read from runtime window._env_ to avoid browser cache issues
export const getBuildVersion = () => {
  return (
    (typeof window !== 'undefined' && window._env_ && window._env_.APP_BUILD_VERSION) || 'dev-local'
  );
};
// Initialize with runtime value
export const ENTITIES_BUILD_VERSION = getBuildVersion();
logDev('[Entities] Build version:', ENTITIES_BUILD_VERSION);

// Use centralized backend URL resolution (consistent with all APIs)
// In production: https://api.aishacrm.com
// In development: http://localhost:4001
export const BACKEND_URL = getBackendUrl();
logDev('[Entities] Backend URL:', BACKEND_URL);

// Helper to properly pluralize entity names for API endpoints
export const pluralize = (entityName) => {
  const name = entityName.toLowerCase();

  // Special cases for irregular plurals
  const irregularPlurals = {
    opportunity: 'opportunities',
    activity: 'activities',
    employee: 'employees',
    user: 'users', // Prevent double 's'
    users: 'users', // Already plural
    systemlog: 'system-logs',
    'system-logs': 'system-logs', // Already plural
    'system-logs/bulk': 'system-logs/bulk', // Preserve exact path for bulk endpoint
    auditlog: 'audit-logs',
    'audit-logs': 'audit-logs', // Already plural
    notification: 'notifications',
    apikey: 'apikeys',
    cashflow: 'cashflow',
    workflow: 'workflows',
    workflowexecution: 'workflowexecutions',
    modulesettings: 'modulesettings', // Already plural
    tenantintegration: 'tenantintegrations',
    bizdevsource: 'bizdevsources',
    tenant: 'tenants',
    systembranding: 'systembrandings',
    synchealth: 'synchealths',
    cronjob: 'cron/jobs', // Backend uses /api/cron/jobs not /api/cronjobs
  };

  if (irregularPlurals[name]) {
    return irregularPlurals[name];
  }

  // Default: just add 's'
  return name + 's';
};

// Helper to generate a safe local-dev fallback result to keep UI responsive
/**
 * Get authenticated fetch options (credentials + Authorization header).
 * Use this in entity overrides that make raw fetch() calls instead of callBackendAPI.
 * @param {Object} [extraHeaders={}] - Additional headers to merge
 * @returns {Promise<{credentials: string, headers: Object}>}
 */
export const getAuthFetchOptions = async (extraHeaders = {}) => {
  const options = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  };
  if (isSupabaseConfigured()) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        options.headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Continue without token — cookie auth as fallback
    }
  }
  return options;
};

export const makeDevFallback = (entityName, method, data, id) => {
  const now = new Date().toISOString();
  const lname = entityName.toLowerCase();
  switch (method) {
    case 'GET':
      // List/filter returns empty array; get-by-id returns null
      return id ? null : [];
    case 'POST':
      return {
        id: `local-${lname}-${Date.now()}`,
        ...data,
        created_at: now,
        updated_at: now,
      };
    case 'PUT':
      return { id, ...data, updated_at: now };
    case 'DELETE':
      return { id, deleted: true };
    default:
      return null;
  }
};

// Helper to call independent backend API
export const callBackendAPI = async (entityName, method, data = null, id = null) => {
  // ENTRY POINT DEBUG - log exactly what we receive
  if (method === 'POST') {
    logDev('[callBackendAPI ENTRY]', {
      entityName,
      method,
      dataReceived: data,
      dataKeys: data ? Object.keys(data) : null,
      id,
    });
  }

  // DEBUG: WorkflowExecution GET requests for CARE history debugging
  if (entityName === 'WorkflowExecution' && method === 'GET') {
    console.log('[callBackendAPI DEBUG] WorkflowExecution GET:', {
      entityName,
      method,
      dataReceived: data,
      dataKeys: data ? Object.keys(data) : null,
      id,
    });
  }

  // Diagnostic logging for key entities during tests
  const isOpportunity = entityName === 'Opportunity';
  const isActivity = entityName === 'Activity';
  const isAccount = entityName === 'Account' || entityName === 'Customer';
  const isContact = entityName === 'Contact';
  const isLead = entityName === 'Lead';
  const isDebugEntity =
    isOpportunity || isActivity || entityName === 'Employee' || isAccount || isContact;

  // Use V2 API paths for all core CRM entities (better performance + AI support)
  const entityPath = isOpportunity
    ? 'v2/opportunities'
    : isActivity
      ? 'v2/activities'
      : isAccount
        ? 'v2/accounts'
        : isContact
          ? 'v2/contacts'
          : isLead
            ? 'v2/leads'
            : pluralize(entityName);
  let url = `${BACKEND_URL}/api/${entityPath}`;

  // MongoDB operators that should be wrapped in 'filter' parameter
  const MONGO_OPERATORS = [
    '$or',
    '$and',
    '$nor',
    '$not',
    '$in',
    '$nin',
    '$all',
    '$regex',
    '$options',
  ];

  /**
   * Check if a value contains MongoDB operators (nested detection)
   * @param {*} value - Value to check
   * @returns {boolean} True if value contains MongoDB operators
   */
  const containsMongoOperators = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).some((k) => MONGO_OPERATORS.includes(k));
    }
    if (Array.isArray(value)) {
      return value.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          Object.keys(item).some((k) => MONGO_OPERATORS.includes(k)),
      );
    }
    return false;
  };

  // Determine tenant_id preference order:
  // 1) Explicit data.tenant_id (including null to indicate cross-tenant reads for superadmin)
  // 2) URL param (?tenant=...)
  // 3) Persisted TenantContext selection (localStorage: selected_tenant_id)
  // 4) Local dev mock user (when isLocalDevMode())
  // 5) Otherwise: null (do NOT fall back to "6cb4c008-4847-426a-9a2e-918ad70e7b69" in production)

  const getSelectedTenantFromClient = () => {
    try {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);

        // For the UnitTests page, always force the dedicated test tenant UUID
        if (url.pathname.toLowerCase().includes('unittests')) {
          return '11111111-1111-1111-1111-111111111111';
        }

        const urlTenant = url.searchParams.get('tenant');
        if (urlTenant) return urlTenant;
        const stored = localStorage.getItem('selected_tenant_id');
        if (stored) return stored;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const mockUser = isLocalDevMode() ? createMockUser() : null;

  // Entities that don't require tenant_id (logging, system operations, user management)
  const optionalTenantEntities = ['SystemLog', 'ImportLog', 'AuditLog', 'User'];
  const requiresTenantId = !optionalTenantEntities.includes(entityName);

  // Resolve tenant_id - MANDATORY FOR CRM DATA OPERATIONS
  // Security-first: tenant_id is REQUIRED for all CRM data access (but optional for logging/system operations)
  const resolveTenantId = async () => {
    // 1) Explicit in data (required for database operations)
    if (data && Object.prototype.hasOwnProperty.call(data, 'tenant_id')) {
      const explicit = data.tenant_id;
      if (requiresTenantId && !explicit) {
        throw new Error(
          `SECURITY: tenant_id is required for ${method} ${entityName}. Superadmins must select a tenant context.`,
        );
      }
      return explicit;
    }

    // 2) URL/localStorage selection (user selected a tenant)
    const clientSelected = getSelectedTenantFromClient();
    if (clientSelected) return clientSelected;

    // 3) Cached effective user tenant
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('effective_user_tenant_id');
        if (cached && cached !== '') return cached;
      }
    } catch {
      /* noop */
    }

    // 4) Supabase user profile lookup - get user's assigned tenant
    if (isSupabaseConfigured()) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && user.email) {
          const resp = await fetch(
            `${BACKEND_URL}/api/users?email=${encodeURIComponent(user.email)}`,
          );
          if (resp.ok) {
            const json = await resp.json();
            const rawUsers = json.data?.users || json.data || json;
            const users = Array.isArray(rawUsers) ? rawUsers : [];
            const exact = users.find(
              (u) => (u.email || '').toLowerCase() === user.email.toLowerCase(),
            );
            const tenant = exact?.tenant_id;

            if (!tenant) {
              throw new Error(
                `SECURITY: User ${user.email} has no tenant assigned. Database access requires tenant context.`,
              );
            }

            try {
              if (typeof window !== 'undefined') {
                localStorage.setItem('effective_user_tenant_id', tenant);
              }
            } catch {
              /* noop */
            }
            return tenant;
          }
        }
      } catch (err) {
        if (err.message.includes('SECURITY')) throw err;
        // Ignore other auth lookup errors and continue
      }
    }

    // 5) Local dev mock user
    if (mockUser?.tenant_id) return mockUser.tenant_id;

    // 6) For optional-tenant entities (logging, system), allow null
    if (!requiresTenantId) return null;

    // 7) NO FALLBACK - Enforce tenant requirement for CRM data
    throw new Error(
      `SECURITY: No tenant_id available for ${method} ${entityName}. This database operation requires tenant context. Please select a tenant or ensure you are assigned to one.`,
    );
  };

  const tenantId = await resolveTenantId();

  if (requiresTenantId && !tenantId) {
    throw new Error(
      `SECURITY: tenant_id is mandatory. Operation ${method} ${entityName} cannot proceed without tenant context.`,
    );
  }

  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Send cookies for auth
  };

  // Add Supabase access token to Authorization header for cross-domain requests
  // This allows api.aishacrm.com to authenticate requests even though cookies are domain-locked
  if (isSupabaseConfigured()) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        options.headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      // If session retrieval fails, continue without token (will use cookie auth as fallback)
      if (import.meta.env.DEV) {
        console.warn(
          '[Auth] Failed to get Supabase session for Authorization header:',
          err.message,
        );
      }
    }
  }

  if (method === 'GET') {
    if (id) {
      // GET by ID - append ID to URL and add tenant_id as query parameter
      url += `/${id}`;
      const params = new URLSearchParams();
      // MANDATORY: Always include tenant_id for tenant isolation
      params.append('tenant_id', tenantId);
      url += `?${params.toString()}`;
    } else {
      // GET list/filter - convert to query params
      const params = new URLSearchParams();
      // MANDATORY: Always include tenant_id for tenant isolation
      params.append('tenant_id', tenantId);

      // Add filter parameters if provided
      if (data && Object.keys(data).length > 0) {
        // First, extract status.$nin as exclude_status (WAF-safe alternative to MongoDB operators in URL)
        // This prevents Cloudflare from blocking requests that look like NoSQL injection
        let processedData = { ...data };
        if (
          processedData.status &&
          typeof processedData.status === 'object' &&
          processedData.status.$nin
        ) {
          const excludeList = processedData.status.$nin;
          if (Array.isArray(excludeList) && excludeList.length > 0) {
            params.append('exclude_status', excludeList.join(','));
          }
          delete processedData.status; // Remove from data to avoid duplicate filter
        }

        // Detect MongoDB-style operators that need to be wrapped in 'filter' parameter
        const hasMongoOperators = Object.keys(processedData).some((key) =>
          MONGO_OPERATORS.includes(key),
        );
        const hasNestedMongoOperators = Object.values(processedData).some((value) =>
          containsMongoOperators(value),
        );

        if (hasMongoOperators || hasNestedMongoOperators) {
          // Wrap complex MongoDB-style filters in 'filter' parameter
          const filterObj = {};
          const directParams = {};

          Object.entries(processedData).forEach(([key, value]) => {
            if (key !== 'tenant_id') {
              // MongoDB operators go into filter object
              if (MONGO_OPERATORS.includes(key) || containsMongoOperators(value)) {
                filterObj[key] = value;
              } else {
                // Simple parameters stay as direct query params
                directParams[key] = value;
              }
            }
          });

          // Add filter parameter if we have MongoDB operators
          if (Object.keys(filterObj).length > 0) {
            params.append('filter', JSON.stringify(filterObj));
          }

          // Add direct parameters
          Object.entries(directParams).forEach(([key, value]) => {
            params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
          });
        } else {
          // No MongoDB operators - use original behavior
          Object.entries(processedData).forEach(([key, value]) => {
            if (key !== 'tenant_id') {
              // Don't duplicate tenant_id
              // DEBUG: Log WorkflowExecution parameter processing
              if (entityName === 'WorkflowExecution') {
                console.log(`[callBackendAPI DEBUG] Adding parameter: ${key} = ${value}`);
              }
              params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
            }
          });
        }
      }

      // DEBUG: Log final URL for WorkflowExecution
      if (entityName === 'WorkflowExecution') {
        console.log('[callBackendAPI DEBUG] Final URL params:', params.toString());
      }

      url += params.toString() ? `?${params.toString()}` : '';
    }
  } else if (id && (method === 'PUT' || method === 'DELETE' || method === 'PATCH')) {
    // Only append ID for update/delete operations, NOT for POST
    url += `/${id}`;
    if (data && method !== 'DELETE') {
      // Preserve explicit tenant_id if provided, otherwise use default
      const bodyData = data.tenant_id !== undefined ? data : { ...data, tenant_id: tenantId };
      options.body = JSON.stringify(bodyData);
    }

    // MANDATORY: All PUT/PATCH/DELETE requests include tenant_id as query parameter
    if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      const delimiter = url.includes('?') ? '&' : '?';
      url += `${delimiter}tenant_id=${encodeURIComponent(tenantId)}`;
    }
  } else if (data && method !== 'GET') {
    // POST and other methods - include data in body, no ID in URL
    const bodyData = data.tenant_id !== undefined ? data : { ...data, tenant_id: tenantId };
    options.body = JSON.stringify(bodyData);
  }

  if (isDebugEntity) {
    logDev('[API Debug] Preparing request', {
      entity: entityName,
      method,
      id,
      initialUrl: url,
      incomingDataKeys: data ? Object.keys(data) : [],
    });
  }

  // Enhanced debug for all POST requests during tests
  if (method === 'POST' || isDebugEntity) {
    logDev('[API Debug] Final request configuration', {
      entity: entityName,
      method,
      url,
      hasBody: !!options.body,
      bodyPreview: options.body
        ? (() => {
            try {
              const parsed = JSON.parse(options.body);
              return {
                keys: Object.keys(parsed),
                stage: parsed.stage,
                tenant_id: parsed.tenant_id,
                first_name: parsed.first_name,
                last_name: parsed.last_name,
                name: parsed.name,
                fullBody: parsed,
              };
            } catch {
              return 'unparseable';
            }
          })()
        : null,
    });
  }

  let response;
  try {
    response = await fetch(url, options);
    if (isDebugEntity) {
      logDev('[API Debug] Fetch completed', {
        url,
        status: response.status,
        statusText: response.statusText,
        method,
        id,
      });
    }
  } catch (error) {
    // Network errors (connection refused, DNS failure, etc)
    apiHealthMonitor.reportNetworkError(url, {
      entityName,
      method,
      tenantId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    // In local dev, return safe fallback instead of throwing hard
    if (isLocalDevMode()) {
      console.warn(`[Local Dev Mode] Backend unreachable for ${method} ${url}. Using fallback.`);
      return makeDevFallback(entityName, method, data, id);
    }
    throw new Error(`Network error: ${error.message}`);
  }

  // Distinguish genuine network/HTTP errors from empty-success responses
  if (!response.ok) {
    const errorText = await response.text();
    const errorContext = {
      entityName,
      method,
      tenantId,
      statusCode: response.status,
      statusText: response.statusText,
      timestamp: new Date().toISOString(),
    };

    // Report different error types to health monitor
    if (response.status === 404) {
      // Distinguish "resource not found" (valid endpoint, missing record) from
      // "endpoint not found" (route doesn't exist). Backend resource-not-found
      // responses return structured JSON with status/message fields, while
      // Express route misses return plain text like "Cannot DELETE /api/...".
      let isResourceNotFound = false;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed && (parsed.status === 'error' || parsed.message)) {
          isResourceNotFound = true;
        }
      } catch {
        // Not JSON — likely a genuine missing endpoint (Express default 404)
      }
      if (!isResourceNotFound) {
        apiHealthMonitor.reportMissingEndpoint(url, errorContext);
      }
    } else if (response.status === 401 || response.status === 403) {
      apiHealthMonitor.reportAuthError(url, response.status, errorContext);
    } else if (response.status === 400) {
      apiHealthMonitor.reportValidationError(url, errorContext);
    } else if (response.status === 429) {
      apiHealthMonitor.reportRateLimitError(url, errorContext);
    } else if (response.status >= 500 && response.status < 600) {
      apiHealthMonitor.reportServerError(url, response.status, errorContext);
    }
    // In local dev, gracefully degrade for non-ok statuses
    if (isLocalDevMode()) {
      console.warn(
        `[Local Dev Mode] ${method} ${url} failed (${response.status}). Using fallback.`,
      );
      return makeDevFallback(entityName, method, data, id);
    }
    // Enhanced Opportunity-specific logging
    if (isDebugEntity) {
      console.error('[API Debug] Request failed', {
        url,
        method,
        id,
        status: response.status,
        statusText: response.statusText,
        errorSnippet: errorText?.slice(0, 300),
        tenantId,
      });
    }
    throw new Error(`Backend API error: ${response.statusText} - ${errorText}`);
  }

  let result;
  try {
    // Handle empty 200 responses gracefully (treat as empty array for list ops)
    const text = await response.text();
    if (!text) {
      if (method === 'GET' && !id) {
        return []; // Empty list success
      }
      return null; // Single-entity empty success
    }
    result = JSON.parse(text);
  } catch (e) {
    if (isOpportunity) {
      console.warn('[API Debug] Failed to parse JSON response', { url, error: e.message });
    }
    throw e;
  }

  // CRITICAL DEBUG: Log all POST responses to understand data structure
  if (method === 'POST') {
    logDev('[callBackendAPI POST Response]', {
      entityName,
      url,
      status: result?.status,
      hasData: !!result?.data,
      dataType: Array.isArray(result?.data) ? 'array' : typeof result?.data,
      dataKeys:
        result?.data && typeof result?.data === 'object' && !Array.isArray(result?.data)
          ? Object.keys(result.data)
          : null,
      hasId: result?.data && Object.prototype.hasOwnProperty.call(result.data, 'id'),
      fullData: result?.data,
    });
  }

  if (isDebugEntity) {
    // Log stage-related fields if present
    const stageVal = result?.data?.stage || result?.stage;
    logDev('[API Debug] Parsed response JSON', {
      url,
      hasData: !!result?.data,
      topLevelKeys: Object.keys(result || {}),
      stage: stageVal,
    });
  }

  // Backend returns { status: "success", data: { entityName: [...] } }
  // Extract the actual data array/object
  if (result.status === 'success' && result.data) {
    // CRITICAL: Check for single entity response FIRST (by presence of 'id' field)
    // This must come before checking for array keys to avoid false positives
    // (e.g., workflow responses have 'nodes', 'connections' arrays but are single entities)
    if (!Array.isArray(result.data) && Object.prototype.hasOwnProperty.call(result.data, 'id')) {
      return result.data;
    }

    // For list/filter operations, data contains { entityName: [...] }
    const entityKey = Object.keys(result.data).find(
      (key) => key !== 'tenant_id' && Array.isArray(result.data[key]),
    );
    if (entityKey && Array.isArray(result.data[entityKey])) {
      // Activities: return full object (has counts sub-object)
      if (
        entityKey === 'activities' &&
        (result.data.counts || typeof result.data.total === 'number')
      ) {
        return result.data; // Preserve { activities: [...], counts, total, limit, offset }
      }
      const arr = result.data[entityKey];
      // Attach pagination metadata to the array so callers can access total count
      // This is backward-compatible: arr still works as a normal array
      if (typeof result.data.total === 'number') {
        arr._total = result.data.total;
        arr._limit = result.data.limit;
        arr._offset = result.data.offset;
      }
      // Attach inline stats if present (e.g. leads by status, opportunities by stage)
      if (result.data.stats && typeof result.data.stats === 'object') {
        arr._stats = result.data.stats;
      }
      return arr;
    }
    // For single item operations without id (edge case handling)
    if (!Array.isArray(result.data)) {
      // Known wrapper keys for single-entity responses
      const wrapperKeys = new Set([
        'employee',
        'account',
        'contact',
        'lead',
        'opportunity',
        'user',
        'tenant',
        'activity',
        'workflow',
        'workflowexecution',
        'opportunities',
        'employees',
        'accounts',
        'contacts',
        'users',
        'tenants',
        'activities',
        'workflows',
        'workflowexecutions',
      ]);

      logDev('[API Debug] Checking response format:', {
        isArray: Array.isArray(result.data),
        hasId: result.data && Object.prototype.hasOwnProperty.call(result.data, 'id'),
        keys: result.data ? Object.keys(result.data) : null,
      });

      // Prefer unwrapping a known wrapper key
      const knownWrapperKey = Object.keys(result.data).find(
        (key) =>
          key !== 'tenant_id' &&
          wrapperKeys.has(key) &&
          result.data[key] &&
          typeof result.data[key] === 'object' &&
          !Array.isArray(result.data[key]),
      );
      if (knownWrapperKey) {
        return result.data[knownWrapperKey];
      }

      // As a last resort, if the object has exactly one nested object value, unwrap that
      const nestedObjects = Object.keys(result.data).filter(
        (key) =>
          key !== 'tenant_id' &&
          result.data[key] &&
          typeof result.data[key] === 'object' &&
          !Array.isArray(result.data[key]),
      );
      if (nestedObjects.length === 1) {
        return result.data[nestedObjects[0]];
      }

      // Default: return as-is
      return result.data;
    }
  }

  // SAFETY CHECK: Always return an array for GET list operations
  if (method === 'GET' && !id) {
    if (!Array.isArray(result)) {
      // Log to window for debugging
      if (typeof window !== 'undefined') {
        window.__ENTITY_DEBUG = window.__ENTITY_DEBUG || [];
        window.__ENTITY_DEBUG.push({
          timestamp: new Date().toISOString(),
          entity: entityName,
          method,
          expectedArray: true,
          gotType: typeof result,
          gotValue: result,
        });
        if (import.meta.env.DEV) {
          alert(
            `ENTITY ERROR: ${entityName}.filter() returned ${typeof result} instead of array. Check window.__ENTITY_DEBUG`,
          );
        }
      }

      console.warn(
        `[callBackendAPI] Expected array for GET ${entityName}, got:`,
        typeof result,
        result,
      );
      // If it's an object with an array property, try to extract it
      if (result && typeof result === 'object') {
        const arrayProp = Object.keys(result).find((key) => Array.isArray(result[key]));
        if (arrayProp) {
          console.warn(`[callBackendAPI] Extracting array from property: ${arrayProp}`);
          return result[arrayProp];
        }
      }
      return []; // Fail-safe: return empty array
    }
  }

  return result;
};
