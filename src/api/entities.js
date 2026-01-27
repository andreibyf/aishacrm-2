// Import mock data utilities at the top for use throughout
import { createMockUser, isLocalDevMode } from "./mockData";
import { apiHealthMonitor } from "../utils/apiHealthMonitor";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { logDev } from "../utils/devLogger";
import { getBackendUrl } from "./backendUrl";

// Re-export for use by other components
export { supabase, isSupabaseConfigured };

// Build version marker for deployment verification.
// Always read from runtime window._env_ to avoid browser cache issues
export const getBuildVersion = () => {
  return (typeof window !== 'undefined' && window._env_ && window._env_.APP_BUILD_VERSION) || 'dev-local';
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
const pluralize = (entityName) => {
  const name = entityName.toLowerCase();

  // Special cases for irregular plurals
  const irregularPlurals = {
    "opportunity": "opportunities",
    "activity": "activities",
    "employee": "employees",
    "user": "users", // Prevent double 's'
    "users": "users", // Already plural
    "systemlog": "system-logs",
    "system-logs": "system-logs", // Already plural
    "system-logs/bulk": "system-logs/bulk", // Preserve exact path for bulk endpoint
    "auditlog": "audit-logs",
    "audit-logs": "audit-logs", // Already plural
    "notification": "notifications",
    "apikey": "apikeys",
    "cashflow": "cashflow",
    "workflow": "workflows",
    "workflowexecution": "workflowexecutions",
    "modulesettings": "modulesettings", // Already plural
    "tenantintegration": "tenantintegrations",
    "bizdevsource": "bizdevsources",
    "tenant": "tenants",
    "systembranding": "systembrandings",
    "synchealth": "synchealths",
    "cronjob": "cron/jobs", // Backend uses /api/cron/jobs not /api/cronjobs
  };

  if (irregularPlurals[name]) {
    return irregularPlurals[name];
  }

  // Default: just add 's'
  return name + "s";
};

// Helper to generate a safe local-dev fallback result to keep UI responsive
const makeDevFallback = (entityName, method, data, id) => {
  const now = new Date().toISOString();
  const lname = entityName.toLowerCase();
  switch (method) {
    case "GET":
      // List/filter returns empty array; get-by-id returns null
      return id ? null : [];
    case "POST":
      return {
        id: `local-${lname}-${Date.now()}`,
        ...data,
        created_at: now,
        updated_at: now,
      };
    case "PUT":
      return { id, ...data, updated_at: now };
    case "DELETE":
      return { id, deleted: true };
    default:
      return null;
  }
};

// Helper to call independent backend API
const callBackendAPI = async (entityName, method, data = null, id = null) => {
  // ENTRY POINT DEBUG - log exactly what we receive
  if (method === 'POST') {
    logDev('[callBackendAPI ENTRY]', {
      entityName,
      method,
      dataReceived: data,
      dataKeys: data ? Object.keys(data) : null,
      id
    });
  }

  // DEBUG: WorkflowExecution GET requests for CARE history debugging
  if (entityName === 'WorkflowExecution' && method === 'GET') {
    console.log('[callBackendAPI DEBUG] WorkflowExecution GET:', {
      entityName,
      method,
      dataReceived: data,
      dataKeys: data ? Object.keys(data) : null,
      id
    });
  }
  
  // Diagnostic logging for key entities during tests
  const isOpportunity = entityName === 'Opportunity';
  const isActivity = entityName === 'Activity';
  const isAccount = entityName === 'Account' || entityName === 'Customer';
  const isContact = entityName === 'Contact';
  const isLead = entityName === 'Lead';
  const isDebugEntity = isOpportunity || isActivity || entityName === 'Employee' || isAccount || isContact;
  
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
  const MONGO_OPERATORS = ['$or', '$and', '$nor', '$not', '$in', '$nin', '$all', '$regex', '$options'];
  
  /**
   * Check if a value contains MongoDB operators (nested detection)
   * @param {*} value - Value to check
   * @returns {boolean} True if value contains MongoDB operators
   */
  const containsMongoOperators = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).some(k => MONGO_OPERATORS.includes(k));
    }
    if (Array.isArray(value)) {
      return value.some(item => 
        item && typeof item === 'object' && Object.keys(item).some(k => MONGO_OPERATORS.includes(k))
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
        throw new Error(`SECURITY: tenant_id is required for ${method} ${entityName}. Superadmins must select a tenant context.`);
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
    } catch { /* noop */ }

    // 4) Supabase user profile lookup - get user's assigned tenant
    if (isSupabaseConfigured()) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
          const resp = await fetch(`${BACKEND_URL}/api/users?email=${encodeURIComponent(user.email)}`);
          if (resp.ok) {
            const json = await resp.json();
            const rawUsers = json.data?.users || json.data || json;
            const users = Array.isArray(rawUsers) ? rawUsers : [];
            const exact = users.find(u => (u.email || '').toLowerCase() === user.email.toLowerCase());
            const tenant = exact?.tenant_id;
            
            if (!tenant) {
              throw new Error(`SECURITY: User ${user.email} has no tenant assigned. Database access requires tenant context.`);
            }

            try {
              if (typeof window !== 'undefined') {
                localStorage.setItem('effective_user_tenant_id', tenant);
              }
            } catch { /* noop */ }
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
    throw new Error(`SECURITY: No tenant_id available for ${method} ${entityName}. This database operation requires tenant context. Please select a tenant or ensure you are assigned to one.`);
  };

  const tenantId = await resolveTenantId();
  
  if (requiresTenantId && !tenantId) {
    throw new Error(`SECURITY: tenant_id is mandatory. Operation ${method} ${entityName} cannot proceed without tenant context.`);
  }

  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
    credentials: 'include', // Send cookies for auth
  };

  // Add Supabase access token to Authorization header for cross-domain requests
  // This allows api.aishacrm.com to authenticate requests even though cookies are domain-locked
  if (isSupabaseConfigured()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        options.headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      // If session retrieval fails, continue without token (will use cookie auth as fallback)
      if (import.meta.env.DEV) {
        console.warn('[Auth] Failed to get Supabase session for Authorization header:', err.message);
      }
    }
  }

  if (method === "GET") {
    if (id) {
      // GET by ID - append ID to URL and add tenant_id as query parameter
      url += `/${id}`;
      const params = new URLSearchParams();
      // MANDATORY: Always include tenant_id for tenant isolation
      params.append("tenant_id", tenantId);
      url += `?${params.toString()}`;
    } else {
      // GET list/filter - convert to query params
      const params = new URLSearchParams();
      // MANDATORY: Always include tenant_id for tenant isolation
      params.append("tenant_id", tenantId);

      // Add filter parameters if provided
      if (data && Object.keys(data).length > 0) {
        // First, extract status.$nin as exclude_status (WAF-safe alternative to MongoDB operators in URL)
        // This prevents Cloudflare from blocking requests that look like NoSQL injection
        let processedData = { ...data };
        if (processedData.status && typeof processedData.status === 'object' && processedData.status.$nin) {
          const excludeList = processedData.status.$nin;
          if (Array.isArray(excludeList) && excludeList.length > 0) {
            params.append('exclude_status', excludeList.join(','));
          }
          delete processedData.status; // Remove from data to avoid duplicate filter
        }
        
        // Detect MongoDB-style operators that need to be wrapped in 'filter' parameter
        const hasMongoOperators = Object.keys(processedData).some(key => MONGO_OPERATORS.includes(key));
        const hasNestedMongoOperators = Object.values(processedData).some(value => containsMongoOperators(value));
        
        if (hasMongoOperators || hasNestedMongoOperators) {
          // Wrap complex MongoDB-style filters in 'filter' parameter
          const filterObj = {};
          const directParams = {};
          
          Object.entries(processedData).forEach(([key, value]) => {
            if (key !== "tenant_id") {
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
            params.append(
              key,
              typeof value === "object" ? JSON.stringify(value) : value
            );
          });
        } else {
          // No MongoDB operators - use original behavior
          Object.entries(processedData).forEach(([key, value]) => {
            if (key !== "tenant_id") { // Don't duplicate tenant_id
              // DEBUG: Log WorkflowExecution parameter processing
              if (entityName === 'WorkflowExecution') {
                console.log(`[callBackendAPI DEBUG] Adding parameter: ${key} = ${value}`);
              }
              params.append(
                key,
                typeof value === "object" ? JSON.stringify(value) : value,
              );
            }
          });
        }
      }
      
      // DEBUG: Log final URL for WorkflowExecution
      if (entityName === 'WorkflowExecution') {
        console.log('[callBackendAPI DEBUG] Final URL params:', params.toString());
      }
      
      url += params.toString() ? `?${params.toString()}` : "";
    }
  } else if (
    id && (method === "PUT" || method === "DELETE" || method === "PATCH")
  ) {
    // Only append ID for update/delete operations, NOT for POST
    url += `/${id}`;
    if (data && method !== "DELETE") {
      // Preserve explicit tenant_id if provided, otherwise use default
      const bodyData = data.tenant_id !== undefined
        ? data
        : { ...data, tenant_id: tenantId };
      options.body = JSON.stringify(bodyData);
    }

    // MANDATORY: All PUT/PATCH/DELETE requests include tenant_id as query parameter
    if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      const delimiter = url.includes('?') ? '&' : '?';
      url += `${delimiter}tenant_id=${encodeURIComponent(tenantId)}`;
    }
  } else if (data && method !== "GET") {
    // POST and other methods - include data in body, no ID in URL
    const bodyData = data.tenant_id !== undefined
      ? data
      : { ...data, tenant_id: tenantId };
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
      bodyPreview: options.body ? (() => { try { const parsed = JSON.parse(options.body); return { keys: Object.keys(parsed), stage: parsed.stage, tenant_id: parsed.tenant_id, first_name: parsed.first_name, last_name: parsed.last_name, name: parsed.name, fullBody: parsed }; } catch { return 'unparseable'; } })() : null,
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
      console.warn(
        `[Local Dev Mode] Backend unreachable for ${method} ${url}. Using fallback.`,
      );
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
      apiHealthMonitor.reportMissingEndpoint(url, errorContext);
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
        errorSnippet: errorText?.slice(0,300),
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
      dataKeys: result?.data && typeof result?.data === 'object' && !Array.isArray(result?.data) 
        ? Object.keys(result.data) 
        : null,
      hasId: result?.data && Object.prototype.hasOwnProperty.call(result.data, 'id'),
      fullData: result?.data
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
  if (result.status === "success" && result.data) {
    // CRITICAL: Check for single entity response FIRST (by presence of 'id' field)
    // This must come before checking for array keys to avoid false positives
    // (e.g., workflow responses have 'nodes', 'connections' arrays but are single entities)
    if (!Array.isArray(result.data) && Object.prototype.hasOwnProperty.call(result.data, 'id')) {
      return result.data;
    }

    // For list/filter operations, data contains { entityName: [...] }
    const entityKey = Object.keys(result.data).find((key) =>
      key !== "tenant_id" && Array.isArray(result.data[key])
    );
    if (entityKey && Array.isArray(result.data[entityKey])) {
      // Only activities responses should return the full object with counts/total
      if (entityKey === 'activities' && (result.data.counts || typeof result.data.total === 'number')) {
        return result.data; // Preserve { activities: [...], counts, total, limit, offset }
      }
      return result.data[entityKey]; // All other entities: return plain array
    }
    // For single item operations without id (edge case handling)
    if (!Array.isArray(result.data)) {

      // Known wrapper keys for single-entity responses
      const wrapperKeys = new Set([
        'employee', 'account', 'contact', 'lead', 'opportunity', 'user', 'tenant', 'activity', 'workflow', 'workflowexecution', 'opportunities', 'employees', 'accounts', 'contacts', 'users', 'tenants', 'activities', 'workflows', 'workflowexecutions'
      ]);

      logDev('[API Debug] Checking response format:', {
        isArray: Array.isArray(result.data),
        hasId: result.data && Object.prototype.hasOwnProperty.call(result.data, 'id'),
        keys: result.data ? Object.keys(result.data) : null
      });

      // Prefer unwrapping a known wrapper key
      const knownWrapperKey = Object.keys(result.data).find((key) =>
        key !== 'tenant_id' && wrapperKeys.has(key) &&
        result.data[key] && typeof result.data[key] === 'object' && !Array.isArray(result.data[key])
      );
      if (knownWrapperKey) {
        return result.data[knownWrapperKey];
      }

      // As a last resort, if the object has exactly one nested object value, unwrap that
      const nestedObjects = Object.keys(result.data).filter((key) =>
        key !== 'tenant_id' && result.data[key] && typeof result.data[key] === 'object' && !Array.isArray(result.data[key])
      );
      if (nestedObjects.length === 1) {
        return result.data[nestedObjects[0]];
      }

      // Default: return as-is
      return result.data;
    }
  }

  // SAFETY CHECK: Always return an array for GET list operations
  if (method === "GET" && !id) {
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
        alert(`ENTITY ERROR: ${entityName}.filter() returned ${typeof result} instead of array. Check window.__ENTITY_DEBUG`);
      }
      
      console.warn(`[callBackendAPI] Expected array for GET ${entityName}, got:`, typeof result, result);
      // If it's an object with an array property, try to extract it
      if (result && typeof result === 'object') {
        const arrayProp = Object.keys(result).find(key => Array.isArray(result[key]));
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

// Create a standard entity object that calls our independent backend API
const createEntity = (entityName) => {
  return {
    // Add filter method as alias for list with better parameter handling
    filter: async (filterObj, sortField, _limit) => {
      // Merge sort field into filter object if provided
      const queryObj = sortField 
        ? { ...filterObj, sort: sortField }
        : filterObj;
      console.log(`[Entity.filter] ${entityName} CALLING with sort:`, sortField, 'queryObj:', queryObj);
      const result = await callBackendAPI(entityName, "GET", queryObj);
      console.log(`[Entity.filter] ${entityName}:`, { type: typeof result, isArray: Array.isArray(result), length: result?.length });
      return result;
    },
    // List method - handle both string orderBy and object filters
    list: async (filterObjOrOrderBy, _sortField, _limit) => {
      // If first param is a string starting with - or contains only alphanumeric/underscore, treat as orderBy
      if (typeof filterObjOrOrderBy === 'string') {
        return callBackendAPI(entityName, "GET", { orderBy: filterObjOrOrderBy });
      }
      return callBackendAPI(entityName, "GET", filterObjOrOrderBy);
    },
    // Get by ID
    get: async (id) => {
      return callBackendAPI(entityName, "GET", null, id);
    },
    // Create
    create: async (data) => {
      return callBackendAPI(entityName, "POST", data);
    },
    // Update
    update: async (id, data) => {
      // For Opportunities explicitly append tenant_id as query param to avoid body-only ambiguity
      if (entityName === 'Opportunity') {
        const enriched = { ...data };
        return await callBackendAPI(entityName, "PUT", enriched, id);
      }
      return callBackendAPI(entityName, "PUT", data, id);
    },
    // Delete
    delete: async (id) => {
      return callBackendAPI(entityName, "DELETE", null, id);
    },
    // Bulk create
    bulkCreate: async (items) => {
      if (!Array.isArray(items)) {
        throw new Error("bulkCreate requires an array of items");
      }
      return Promise.all(
        items.map((item) => callBackendAPI(entityName, "POST", item)),
      );
    },
  };
};

export const Contact = createEntity("Contact");

// Account entity - use standard createEntity with tenant resolution
export const Account = createEntity("Account");

// Customer is a UI alias for Account - both use the same backend endpoint
export const Customer = createEntity("Customer");

export const Lead = {
  ...createEntity("Lead"),

  // Optimized stats endpoint - returns aggregated counts by status
  async getStats(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.tenant_id) params.append('tenant_id', filter.tenant_id);
      if (filter.assigned_to !== undefined) params.append('assigned_to', filter.assigned_to);
      if (filter.is_test_data !== undefined) params.append('is_test_data', String(filter.is_test_data));

      const response = await fetch(`${BACKEND_URL}/api/v2/leads/stats?${params}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error("[Lead.getStats] Error:", error);
      return {
        total: 0,
        new: 0,
        contacted: 0,
        qualified: 0,
        unqualified: 0,
        converted: 0,
        lost: 0,
      };
    }
  },
};

export const Opportunity = {
  ...createEntity("Opportunity"),
  
  // Optimized stats endpoint - returns aggregated counts by stage
  async getStats(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.tenant_id) params.append('tenant_id', filter.tenant_id);
      if (filter.stage) params.append('stage', filter.stage);
      if (filter.assigned_to !== undefined) params.append('assigned_to', filter.assigned_to);
      if (filter.is_test_data !== undefined) params.append('is_test_data', filter.is_test_data);

      const response = await fetch(`${BACKEND_URL}/api/v2/opportunities/stats?${params}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error("[Opportunity.getStats] Error:", error);
      return {
        total: 0,
        prospecting: 0,
        qualification: 0,
        proposal: 0,
        negotiation: 0,
        closed_won: 0,
        closed_lost: 0,
      };
    }
  },

  // Optimized count endpoint - returns total count without fetching all records
  async getCount(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.tenant_id) params.append('tenant_id', filter.tenant_id);
      if (filter.stage && filter.stage !== 'all') params.append('stage', filter.stage);
      if (filter.assigned_to !== undefined) params.append('assigned_to', filter.assigned_to);
      if (filter.is_test_data !== undefined) params.append('is_test_data', filter.is_test_data);
      if (filter.$or || filter.searchTerm) {
        // Convert search term to filter format
        const searchFilter = filter.$or ? { $or: filter.$or } : null;
        if (searchFilter) {
          params.append('filter', JSON.stringify(searchFilter));
        }
      }

      const response = await fetch(`${BACKEND_URL}/api/v2/opportunities/count?${params}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data.count;
    } catch (error) {
      console.error("[Opportunity.getCount] Error:", error);
      return 0;
    }
  },
};

export const Activity = createEntity("Activity");

// WAF-safe search for Activities using POST body instead of URL query params
// This avoids Cloudflare/Nginx WAF blocking MongoDB-style operators in URLs
Activity.search = async function(searchParams = {}) {
  const {
    q,
    fields = ['subject', 'body', 'notes'],
    limit = 50,
    offset = 0,
    status,
    type,
    assigned_to,
    related_to,
    related_id,
    date_from,
    date_to,
    sort_by = 'due_date',
    sort_order = 'desc',
    tenant_id
  } = searchParams;

  // Get tenant_id from params, localStorage, or URL
  let tenantId = tenant_id;
  if (!tenantId && typeof window !== 'undefined') {
    tenantId = localStorage.getItem('selected_tenant_id') || 
               new URL(window.location.href).searchParams.get('tenant');
  }
  
  if (!tenantId) {
    throw new Error('tenant_id is required for Activity.search');
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/v2/activities/search?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q,
        fields,
        limit,
        offset,
        status,
        type,
        assigned_to,
        related_to,
        related_id,
        date_from,
        date_to,
        sort_by,
        sort_order,
        tenant_id: tenantId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (result.status === 'success') {
      return result.data.activities || [];
    }
    
    throw new Error(result.message || 'Search failed');
  } catch (error) {
    logDev('[Activity.search] Error:', error);
    throw error;
  }
};

// Tenant entity - direct backend API calls
export const Tenant = {
  async list(orderBy = "display_order") {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Handle {status: 'success', data: {tenants: [...], total: N}} format
      if (result.status === "success" && result.data && result.data.tenants) {
        const tenants = result.data.tenants;

        // Sort by requested field
        if (orderBy) {
          return tenants.sort((a, b) => {
            if (a[orderBy] < b[orderBy]) return -1;
            if (a[orderBy] > b[orderBy]) return 1;
            return 0;
          });
        }

        return tenants;
      }

      // Fallback: return data directly if format is different
      return result.data || result;
    } catch (error) {
      console.error("[Tenant.list] Error fetching tenants:", error);
      return [];
    }
  },

  async get(id) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Handle {status: 'success', data: {...}} format
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.get] Error fetching tenant ${id}:`, error);
      throw error;
    }
  },

  async create(data) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error("[Tenant.create] Error creating tenant:", error);
      throw error;
    }
  },

  async update(id, data) {
    try {
      logDev("[Tenant.update] Updating tenant:", id, "with data:", data);

      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      logDev(
        "[Tenant.update] Response status:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Tenant.update] Error response:", errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      logDev("[Tenant.update] Response data:", result);
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.update] Error updating tenant ${id}:`, error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.delete] Error deleting tenant ${id}:`, error);
      throw error;
    }
  },
};

export const Notification = createEntity("Notification");

export const FieldCustomization = createEntity("FieldCustomization");

export const ModuleSettings = createEntity("ModuleSettings");

// AuditLog entity - direct backend API calls
export const AuditLog = {
  async list(filters = {}, _orderBy = "-created_at", limit = 100) {
    try {
      // Use centralized, normalized BACKEND_URL

      // Build query parameters
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append("tenant_id", filters.tenant_id);
      if (filters.user_email) params.append("user_email", filters.user_email);
      if (filters.action) params.append("action", filters.action);
      if (filters.entity_type) {
        params.append("entity_type", filters.entity_type);
      }
      if (filters.entity_id) params.append("entity_id", filters.entity_id);
      if (limit) params.append("limit", limit);
      params.append("offset", filters.offset || 0);

      const url = `${BACKEND_URL}/api/audit-logs?${params}`;
      logDev("[AuditLog.list] Fetching from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      logDev(
        "[AuditLog.list] Response status:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      logDev("[AuditLog.list] Response data:", result);

      // Handle {status: 'success', data: {'audit-logs': [...], total: N}} format
      if (
        result.status === "success" && result.data && result.data["audit-logs"]
      ) {
        logDev(
          "[AuditLog.list] Returning",
          result.data["audit-logs"].length,
          "audit logs",
        );
        return result.data["audit-logs"];
      }

      // Fallback: return data directly if format is different
      logDev("[AuditLog.list] Using fallback return format");
      return result.data || result;
    } catch (error) {
      console.error("[AuditLog.list] Error fetching audit logs:", error);
      return [];
    }
  },

  async get(id) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit-logs/${id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[AuditLog.get] Error fetching audit log ${id}:`, error);
      throw error;
    }
  },

  async create(data) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error("[AuditLog.create] Error creating audit log:", error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit-logs/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[AuditLog.delete] Error deleting audit log ${id}:`, error);
      throw error;
    }
  },

  async clear(filters = {}) {
    try {
      // Use centralized, normalized BACKEND_URL

      // Build query parameters for bulk delete
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append("tenant_id", filters.tenant_id);
      if (filters.user_email) params.append("user_email", filters.user_email);
      if (filters.entity_type) {
        params.append("entity_type", filters.entity_type);
      }
      if (filters.older_than_days) {
        params.append("older_than_days", filters.older_than_days);
      }

      const response = await fetch(`${BACKEND_URL}/api/audit-logs?${params}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error("[AuditLog.clear] Error clearing audit logs:", error);
      throw error;
    }
  },
};

export const Note = createEntity("Note");

export const SubscriptionPlan = createEntity("SubscriptionPlan");

export const Subscription = createEntity("Subscription");

export const Webhook = createEntity("Webhook");

export const TestReport = createEntity("TestReport");

export const TenantIntegration = createEntity("TenantIntegration");

export const Announcement = createEntity("Announcement");

export const DataManagementSettings = createEntity("DataManagementSettings");

export const Employee = createEntity("Employee");

export const DocumentationFile = createEntity("DocumentationFile");

export const UserInvitation = createEntity("UserInvitation");

export const GuideContent = createEntity("GuideContent");

export const AICampaign = createEntity("AICampaign");

export const ApiKey = createEntity("ApiKey");

export const CashFlow = createEntity("CashFlow");

export const CronJob = createEntity("CronJob");

// Add run now functionality to CronJob
CronJob.runNow = async (id) => {
  const baseUrl = getBackendUrl();
  const response = await fetch(`${baseUrl}/api/cron/jobs/${id}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to run job' }));
    throw new Error(error.message || 'Failed to run job');
  }

  return response.json();
};

export const PerformanceLog = createEntity("PerformanceLog");

export const EmailTemplate = createEntity("EmailTemplate");

export const SystemBranding = createEntity("SystemBranding");

export const Checkpoint = createEntity("Checkpoint");

export const SyncHealth = createEntity("SyncHealth");

export const ContactHistory = createEntity("ContactHistory");

export const LeadHistory = createEntity("LeadHistory");

export const OpportunityHistory = createEntity("OpportunityHistory");

export const DailySalesMetrics = createEntity("DailySalesMetrics");

export const MonthlyPerformance = createEntity("MonthlyPerformance");

export const UserPerformanceCache = createEntity("UserPerformanceCache");

export const ImportLog = createEntity("ImportLog");

export const BizDevSource = {
  ...createEntity("BizDevSource"),
  schema: async () => {
    // Import and return the full BizDevSource schema
    const { BizDevSourceSchema } = await import('../entities/BizDevSource.js');
    return BizDevSourceSchema;
  },
  /**
   * Override create to handle response format properly
   */
  create: async (data) => {
    try {
      const tenant_id = data?.tenant_id || data?.tenantId;
      if (!tenant_id) {
        throw new Error('tenant_id is required for BizDevSource.create');
      }
      const url = `${BACKEND_URL}/api/bizdevsources`;
      logDev('[BizDevSource.create] POST', { url, tenant_id });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      logDev('[BizDevSource.create] Response', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BizDevSource.create] Error', errorData);
        throw new Error(errorData.message || `Failed to create BizDevSource: ${response.status}`);
      }
      const result = await response.json();
      logDev('[BizDevSource.create] Success', result);
      return result.data || result;
    } catch (err) {
      console.error('[BizDevSource.create] Exception', err);
      throw err;
    }
  },
  /**
   * Override update to ensure tenant_id is passed via query string per backend route requirements.
   * Generic createEntity update doesn't append tenant_id, causing 400 errors.
   */
  update: async (id, data) => {
    try {
      const tenant_id = data?.tenant_id || data?.tenantId;
      if (!tenant_id) {
        throw new Error('tenant_id is required for BizDevSource.update');
      }
      const url = `${BACKEND_URL}/api/bizdevsources/${id}?tenant_id=${encodeURIComponent(tenant_id)}`;
      logDev('[BizDevSource.update] PUT', { url, id, tenant_id });
      // Exclude tenant_id from body (route expects it only in query for validation)
      const { tenant_id: _omit, tenantId: _omit2, ...rest } = data || {};
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rest),
      });
      logDev('[BizDevSource.update] Response', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BizDevSource.update] Error', errorData);
        throw new Error(errorData.message || `Failed to update BizDevSource: ${response.status}`);
      }
      const result = await response.json();
      logDev('[BizDevSource.update] Success', result);
      return result.data || result;
    } catch (err) {
      console.error('[BizDevSource.update] Exception', err);
      throw err;
    }
  },
  /**
   * Promote a BizDev source to a Lead (v3.0.0 workflow)
   * @param {string} id - BizDev source ID
   * @param {string} tenant_id - Tenant ID
   * @returns {Promise<{lead: Object, account: Object, bizdev_source_id: string, lead_type: string}>}
   */
  promote: async (id, tenant_id) => {
    try {
      const url = `${BACKEND_URL}/api/bizdevsources/${id}/promote`;
      const startedAt = performance.now();
      logDev('[BizDevSource.promote] Making API call:', { url, id, tenant_id, startedAt });

      // Abort after 8s to avoid infinite spinner when network stalls
      const controller = new AbortController();
      const timeoutMs = 8000;
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Keep source after promotion so UI can gray it out and stats reflect immediately
          body: JSON.stringify({ tenant_id, delete_source: false }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        const elapsed = Math.round(performance.now() - startedAt);
        if (fetchErr?.name === 'AbortError') {
          console.error('[BizDevSource.promote] Timeout abort', { id, tenant_id, elapsed, timeoutMs });
          throw new Error('PROMOTE_TIMEOUT');
        }
        console.error('[BizDevSource.promote] Network fetch error before response', { error: fetchErr, elapsed });
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }

      const afterFetch = performance.now();
      logDev('[BizDevSource.promote] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        elapsedMs: Math.round(afterFetch - startedAt)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BizDevSource.promote] API error:', { errorData, status: response.status });
        // Distinguish production safety guard / rate limit / generic errors
        const isGuard = errorData?.code === 'PRODUCTION_SAFETY_GUARD' || response.status === 403;
        const isRateLimit = response.status === 429;
        if (isGuard) {
          throw new Error('PROMOTE_BLOCKED_PRODUCTION_GUARD');
        }
        if (isRateLimit) {
          throw new Error('PROMOTE_RATE_LIMITED');
        }
        throw new Error(errorData.message || `Failed to promote bizdev source: ${response.status}`);
      }

      const parseStarted = performance.now();
      const result = await response.json();
      logDev('[BizDevSource.promote] Success:', { result, parseElapsedMs: Math.round(performance.now() - parseStarted) });
      return result.data;
    } catch (error) {
      console.error('[BizDevSource.promote] Error:', error);
      throw error;
    }
  },
};

export const ArchiveIndex = createEntity("ArchiveIndex");

export const IndustryMarketData = createEntity("IndustryMarketData");

export const ClientRequirement = createEntity("ClientRequirement");

// SystemLog with safe fallback to suppress connection errors in local dev when backend is down
const baseSystemLog = createEntity("SystemLog");
export const SystemLog = {
  ...baseSystemLog,
  create: async (data) => {
    if (isLocalDevMode()) {
      // Silent fallback: don't try to POST to backend if it's not running
      // Just log to console and return success
      logDev("[Local Dev Mode] SystemLog.create (not persisted):", data);
      return {
        id: `local-log-${Date.now()}`,
        ...data,
        created_at: new Date().toISOString(),
      };
    }
    return baseSystemLog.create(data);
  },
};

export const Workflow = createEntity("Workflow");

export const WorkflowExecution = createEntity("WorkflowExecution");

// ============================================
// SUPABASE AUTHENTICATION
// ============================================
// Using Supabase Auth instead of Base44 for independent authentication

const baseUserEntity = createEntity("User");

export const User = {
  // Entity-style methods (needed by reports/ProductivityAnalytics)
  ...baseUserEntity,

  /**
   * Get current authenticated user
   * Uses Supabase Auth with local dev fallback
   */
  me: async () => {
    // TEMP: Disable cookie auth, use Supabase fallback
    const skipCookieAuth = true;
    
    // First, try cookie-based session via backend (disabled for now)
    try {
      let meResp = null;
      if (!skipCookieAuth) {
        meResp = await fetch(`${BACKEND_URL}/api/auth/me`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      } else {
        throw new Error('Cookie auth disabled');
      }
      if (meResp && meResp.ok) {
        const meJson = await meResp.json();
        const payload = meJson?.data?.user || {};
        const email = (payload.email || '').toLowerCase();
        const table = payload.table === 'employees' ? 'employees' : 'users';

        // Fetch user/employee record from backend to enrich profile
        let userData = null;
        try {
          if (table === 'users') {
            const r = await fetch(`${BACKEND_URL}/api/users?email=${encodeURIComponent(email)}`);
            if (r.ok) {
              const j = await r.json();
              const raw = j.data?.users || j.data || j;
              const list = Array.isArray(raw) ? raw.filter(u => (u.email || '').toLowerCase() === email) : [];
              if (list.length > 0) userData = list[0];
            }
          }
          if (!userData) {
            const r = await fetch(`${BACKEND_URL}/api/employees?email=${encodeURIComponent(email)}`);
            if (r.ok) {
              const j = await r.json();
              const raw = j.data || j;
              const list = Array.isArray(raw) ? raw.filter(u => (u.email || '').toLowerCase() === email) : [];
              if (list.length > 0) userData = list[0];
            }
          }
        } catch (e) {
          console.warn('[Cookie Auth] Backend user lookup failed:', e?.message || e);
        }

        if (!email) return null;

        // Map to normalized user object (prefer DB values)
        return {
          id: payload.sub,
          email,
          // No Supabase user_metadata in cookie mode; include minimal object
          user_metadata: {},
          created_at: undefined,
          updated_at: undefined,
          // Tenant: prefer DB value when present, else cookie payload
          tenant_id: (userData?.tenant_id !== undefined && userData?.tenant_id !== null)
            ? userData.tenant_id
            : (payload.tenant_id ?? null),
          ...(userData && {
            employee_id: userData.id,
            first_name: userData.first_name,
            last_name: userData.last_name,
            full_name: (userData.full_name) || `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || undefined,
            display_name: userData.display_name || (userData.full_name) || `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || undefined,
            role: (userData.role || '').toLowerCase(),
            status: userData.status,
            permissions: userData.metadata?.permissions || [],
            access_level: userData.metadata?.access_level,
            is_superadmin: (userData.role || '').toLowerCase() === 'superadmin',
            can_manage_users: userData.metadata?.can_manage_users || false,
            can_manage_settings: userData.metadata?.can_manage_settings || false,
            crm_access: true,
            navigation_permissions: userData.navigation_permissions || {},
          }),
        };
      }
    } catch (cookieErr) {
      // Fall through to Supabase path
      if (import.meta.env.DEV) {
        console.debug('[User.me] Cookie auth probe failed, attempting Supabase path:', cookieErr?.message || cookieErr);
      }
    }

    // Production: Use Supabase Auth as fallback
    if (isSupabaseConfigured()) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          console.error("[Supabase Auth] Error getting user:", error);
          return null;
        }

        if (!user) {
          logDev("[Supabase Auth] No authenticated user");
          return null;
        }

        // Fetch user record from database to get permissions and tenant_id
        // Try users table first (for SuperAdmins/Admins), then employees table
        let userData = null;
        try {
          // First, try users table (for SuperAdmins and Admins)
          let response = await fetch(
            `${BACKEND_URL}/api/users?email=${encodeURIComponent(user.email)}`,
          );
          if (response.ok) {
            const result = await response.json();
            logDev('[User.me] RAW API response:', result); // DEBUG: See what backend actually returns
            const rawUsers = result.data?.users || result.data || result;
            const users = Array.isArray(rawUsers) ? rawUsers.filter(u => (u.email || '').toLowerCase() === user.email.toLowerCase()) : [];

            // Defensive: filter out test-pattern identities unless in E2E mode
            const isE2EMode = (typeof window !== 'undefined' && localStorage.getItem('E2E_TEST_MODE') === 'true');
            const testEmailPatterns = [ /audit\.test\./i, /e2e\.temp\./i, /@playwright\.test$/i, /@example\.com$/i ];
            const safeUsers = isE2EMode ? users : users.filter(u => !testEmailPatterns.some(re => re.test(u.email || '')));

            if (safeUsers.length > 0) {
              // Prefer a global superadmin/admin record
              const preferred =
                safeUsers.find(u => u.tenant_id === null && ['superadmin','admin'].includes((u.role || '').toLowerCase())) ||
                safeUsers.find(u => u.tenant_id === null) ||
                safeUsers.find(u => ['superadmin','admin'].includes((u.role || '').toLowerCase())) ||
                safeUsers[0];

              userData = preferred;
              logDev('[Supabase Auth] User record selected (exact match filtering):', { email: userData.email, role: userData.role, tenant_id: userData.tenant_id });
            } else if (rawUsers && rawUsers.length > 0) {
              console.warn('[Supabase Auth] Raw users returned but none passed filtering; possible test-pattern suppression or mismatch.', { requested: user.email, rawCount: rawUsers.length });
            }
          }

          // If not found in users table, try employees table
          if (!userData) {
            response = await fetch(
              `${BACKEND_URL}/api/employees?email=${
                encodeURIComponent(user.email)
              }`,
            );
            if (response.ok) {
              const result = await response.json();
              const employees = result.data || result;
              if (employees && employees.length > 0) {
                userData = employees[0];
                logDev(
                  "[Supabase Auth] User data loaded from employees table:",
                  userData.role,
                  userData.metadata?.access_level,
                );
              } else {
                console.warn(
                  "[Supabase Auth] No user or employee record found for:",
                  user.email,
                );
              }
            } else {
              console.error(
                "[Supabase Auth] Failed to fetch user data:",
                response.status,
                response.statusText,
              );
            }
          }

          // If still not found, auto-create CRM record from auth metadata and re-fetch
          if (!userData) {
            logDev(
              "[Supabase Auth] Ensuring CRM user record exists for:",
              user.email,
            );
            try {
              const syncResp = await fetch(
                `${BACKEND_URL}/api/users/sync-from-auth`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: user.email }),
                },
              );
              if (syncResp.ok) {
                // Re-try lookup in users table first, then employees
                let retry = await fetch(
                  `${BACKEND_URL}/api/users?email=${
                    encodeURIComponent(user.email)
                  }`,
                );
                if (retry.ok) {
                  const r = await retry.json();
                  const listRaw = r.data?.users || r.data || r;
                  const list = Array.isArray(listRaw) ? listRaw.filter(u => (u.email || '').toLowerCase() === user.email.toLowerCase()) : [];
                  const isE2EMode = (typeof window !== 'undefined' && localStorage.getItem('E2E_TEST_MODE') === 'true');
                  const testEmailPatterns = [ /audit\.test\./i, /e2e\.temp\./i, /@playwright\.test$/i, /@example\.com$/i ];
                  const safe = isE2EMode ? list : list.filter(u => !testEmailPatterns.some(re => re.test(u.email || '')));
                  if (safe && safe.length > 0) {
                    userData = safe[0];
                  }
                }
                if (!userData) {
                  retry = await fetch(
                    `${BACKEND_URL}/api/employees?email=${
                      encodeURIComponent(user.email)
                    }`,
                  );
                  if (retry.ok) {
                    const r2 = await retry.json();
                    const list2Raw = r2.data || r2;
                    const list2 = Array.isArray(list2Raw) ? list2Raw.filter(u => (u.email || '').toLowerCase() === user.email.toLowerCase()) : [];
                    const isE2EMode = (typeof window !== 'undefined' && localStorage.getItem('E2E_TEST_MODE') === 'true');
                    const testEmailPatterns = [ /audit\.test\./i, /e2e\.temp\./i, /@playwright\.test$/i, /@example\.com$/i ];
                    const safe2 = isE2EMode ? list2 : list2.filter(u => !testEmailPatterns.some(re => re.test(u.email || '')));
                    if (safe2 && safe2.length > 0) {
                      userData = safe2[0];
                    }
                  }
                }
              } else {
                const txt = await syncResp.text();
                console.warn(
                  "[Supabase Auth] sync-from-auth failed:",
                  syncResp.status,
                  txt,
                );
              }
            } catch (syncError) {
              console.warn(
                "[Supabase Auth] Could not auto-create CRM record:",
                syncError.message,
              );
            }
          }
        } catch (err) {
          console.error(
            "[Supabase Auth] Error fetching user data:",
            err.message,
          );
        }

        // Map Supabase user to our User format with database data
        // IMPORTANT: Merge order ensures DATABASE values override Supabase user_metadata
        return {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          created_at: user.created_at,
          updated_at: user.updated_at,
          // Bring in any custom fields from auth metadata FIRST (lowest priority)
          ...(user.user_metadata || {}),
          // Then set tenant_id with DB-first precedence
          tenant_id: (userData?.tenant_id !== undefined && userData?.tenant_id !== null)
            ? userData.tenant_id
            : (user.user_metadata?.tenant_id ?? null),
          // Finally, include database user data LAST so it overrides metadata
          ...(userData && {
            employee_id: userData.id,
            first_name: userData.first_name,
            last_name: userData.last_name,
            // Derive full/display names from DB when present
            full_name: (userData.full_name) || `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || undefined,
            display_name: userData.display_name || (userData.full_name) || `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || undefined,
            role: (userData.role || "").toLowerCase(), // Normalize role to lowercase
            status: userData.status,
            permissions: userData.metadata?.permissions || [],
            access_level: userData.metadata?.access_level,
            is_superadmin: (userData.role || "").toLowerCase() === "superadmin",
            can_manage_users: userData.metadata?.can_manage_users || false,
            can_manage_settings: userData.metadata?.can_manage_settings || false,
            crm_access: true, // Grant CRM access to authenticated users with records
            navigation_permissions: userData.navigation_permissions || {}, // CRITICAL: Include navigation_permissions from backend
          }),
        };
      } catch (err) {
        console.error("[Supabase Auth] Exception in me():", err);
        return null;
      }
    }

    // No authentication system configured
    console.error("[Auth] No authentication system configured");
    throw new Error(
      "Authentication system not configured. Please configure Supabase.",
    );
  },

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   */
  signIn: async (email, password) => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("[Supabase Auth] Sign in error:", error);
          throw new Error(error.message);
        }

        logDev("[Supabase Auth] Sign in successful:", data.user?.email);

        // ⚠️ CHECK 1: Password Expiration
        const passwordExpiresAt = data.user.user_metadata?.password_expires_at;
        if (passwordExpiresAt) {
          const expirationDate = new Date(passwordExpiresAt);
          const now = new Date();

          if (expirationDate < now) {
            // Password has expired - sign out and reject
            await supabase.auth.signOut();
            throw new Error(
              "Your temporary password has expired. Please contact your administrator for a password reset.",
            );
          }
        }

        // ⚠️ CHECK 2: Fetch user from backend to check CRM access and account status
        try {
          const response = await fetch(
            `${BACKEND_URL}/api/users?email=${encodeURIComponent(email)}`,
          );
          if (response.ok) {
            const result = await response.json();
            const users = result.data?.users || result.data || result;

            if (users && users.length > 0) {
              const dbUser = users[0];

              // Check if account status is inactive
              if (dbUser.status === "inactive") {
                await supabase.auth.signOut();
                throw new Error(
                  "Your account has been suspended. Contact your administrator.",
                );
              }

              // Check if CRM access is revoked (permissions array doesn't include 'crm_access')
              if (
                dbUser.permissions && !dbUser.permissions.includes("crm_access")
              ) {
                await supabase.auth.signOut();
                throw new Error(
                  "CRM access has been disabled for your account. Contact your administrator.",
                );
              }
            }
          }
        } catch (backendError) {
          // Log but don't block login if backend check fails
          console.warn(
            "[Supabase Auth] Could not verify account status:",
            backendError.message,
          );
        }

        // Return mapped user object
        return {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
          tenant_id: data.user.user_metadata?.tenant_id || null,
          session: data.session,
          ...data.user.user_metadata,
        };
      } catch (err) {
        console.error("[Supabase Auth] Exception in signIn():", err);
        throw err;
      }
    }

    // No authentication system configured
    console.error("[Auth] No authentication system configured");
    throw new Error(
      "Authentication system not configured. Please configure Supabase.",
    );
  },

  /**
   * Sign out current user
   */
  signOut: async () => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error("[Supabase Auth] Sign out error:", error);
          throw new Error(error.message);
        }

        logDev("[Supabase Auth] Sign out successful");
        return true;
      } catch (err) {
        console.error("[Supabase Auth] Exception in signOut():", err);
        throw err;
      }
    }

    // No authentication system configured
    console.error("[Auth] No authentication system configured");
    throw new Error(
      "Authentication system not configured. Please configure Supabase.",
    );
  },

  /**
   * Sign up new user
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {object} metadata - Additional user metadata (tenant_id, name, etc.)
   */
  signUp: async (email, password, metadata = {}) => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: metadata, // Store tenant_id and other metadata
          },
        });

        if (error) {
          console.error("[Supabase Auth] Sign up error:", error);
          throw new Error(error.message);
        }

        logDev("[Supabase Auth] Sign up successful:", data.user?.email);

        return {
          id: data.user?.id,
          email: data.user?.email,
          user_metadata: data.user?.user_metadata,
          tenant_id: metadata.tenant_id,
          session: data.session,
          ...metadata,
        };
      } catch (err) {
        console.error("[Supabase Auth] Exception in signUp():", err);
        throw err;
      }
    }

    // No authentication system configured
    console.error("[Auth] No authentication system configured");
    throw new Error(
      "Authentication system not configured. Please configure Supabase.",
    );
  },

  /**
   * Update current user's metadata
   * @param {object} updates - User metadata to update
   */
  updateMyUserData: async (updates) => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.updateUser({
          data: updates, // Update user_metadata
        });

        if (error) {
          console.error("[Supabase Auth] Update user error:", error);
          throw new Error(error.message);
        }

        logDev("[Supabase Auth] User updated successfully");

        return {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
          tenant_id: data.user.user_metadata?.tenant_id || null,
          ...data.user.user_metadata,
        };
      } catch (err) {
        console.error("[Supabase Auth] Exception in updateMyUserData():", err);
        throw err;
      }
    }

    // No authentication system configured
    console.error("[Auth] No authentication system configured");
    throw new Error(
      "Authentication system not configured. Please configure Supabase.",
    );
  },

  /**
   * List all users (admin function - uses backend API)
   */
  list: async (filters) => {
    // ALWAYS use backend API for listing users (don't mock this - we need real data)
    logDev("[User.list] Fetching users via backend API");
    return callBackendAPI("user", "GET", filters);
  },

  /**
   * Update any user by ID (admin function - uses backend API)
   */
  update: async (userId, updates) => {
    // ALWAYS use backend API for user updates (don't mock this - we need real persistence)
    logDev(
      "[User.update] Updating user via backend API:",
      userId,
      updates,
    );
    return callBackendAPI("user", "PUT", updates, userId);
  },

  /**
   * Alias for signIn() - for backwards compatibility
   */
  login: async (email, password) => {
    return User.signIn(email, password);
  },

  /**
   * Alias for signOut() - for backwards compatibility
   */
  logout: async () => {
    return User.signOut();
  },

  /**
   * List user profiles with linked employee data
   * @param {object} filters - Optional filters (tenant_id, role, etc.)
   */
  listProfiles: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value);
        }
      });

      const url = `${BACKEND_URL}/api/users${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data?.users || result.data || result || [];
    } catch (error) {
      console.error('[User.listProfiles] Error:', error);
      throw error;
    }
  },

  /**
   * Update user profile
   * @param {string} id - User ID
   * @param {object} data - Update data
   */
  updateProfile: async (id, data) => {
    try {
      const url = `${BACKEND_URL}/api/users/${id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update user: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[User.update] Error:', error);
      throw error;
    }
  },
};

// ============================================
// Construction Projects Module Entities
// ============================================

/**
 * Construction Projects - for staffing companies tracking client projects
 * Uses custom API endpoint: /api/construction/projects
 */
export const ConstructionProject = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const url = `${BACKEND_URL}/api/construction/projects${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list construction projects: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.projects || result.data || [];
  },

  get: async (id) => {
    const url = `${BACKEND_URL}/api/construction/projects/${id}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to get construction project: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  create: async (data) => {
    const url = `${BACKEND_URL}/api/construction/projects`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create construction project: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  update: async (id, data) => {
    const url = `${BACKEND_URL}/api/construction/projects/${id}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to update construction project: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  delete: async (id) => {
    const url = `${BACKEND_URL}/api/construction/projects/${id}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to delete construction project: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },
};

/**
 * Construction Assignments - worker assignments to projects
 * Uses custom API endpoint: /api/construction/assignments
 */
export const ConstructionAssignment = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const url = `${BACKEND_URL}/api/construction/assignments${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list construction assignments: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.assignments || result.data || [];
  },

  get: async (id) => {
    const url = `${BACKEND_URL}/api/construction/assignments/${id}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to get construction assignment: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  create: async (data) => {
    const url = `${BACKEND_URL}/api/construction/assignments`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create construction assignment: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  update: async (id, data) => {
    const url = `${BACKEND_URL}/api/construction/assignments/${id}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to update construction assignment: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  delete: async (id) => {
    const url = `${BACKEND_URL}/api/construction/assignments/${id}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to delete construction assignment: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  listByProject: async (projectId) => {
    const url = `${BACKEND_URL}/api/construction/assignments/by-project/${projectId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list project assignments: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.assignments || result.data || [];
  },

  listByWorker: async (contactId) => {
    const url = `${BACKEND_URL}/api/construction/assignments/by-worker/${contactId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list worker assignments: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.assignments || result.data || [];
  },
};

/**
 * Workers - Contractors/Temp Labor Management
 * Uses custom API endpoint: /api/workers
 */
export const Worker = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const url = `${BACKEND_URL}/api/workers${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list workers: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.workers || result.data || [];
  },

  get: async (id) => {
    const url = `${BACKEND_URL}/api/workers/${id}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to get worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  create: async (data) => {
    const url = `${BACKEND_URL}/api/workers`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  update: async (id, data) => {
    const url = `${BACKEND_URL}/api/workers/${id}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to update worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  delete: async (id) => {
    const url = `${BACKEND_URL}/api/workers/${id}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to delete worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },
};

/**
 * Get current user's tenant branding - Direct backend call (bypasses Firebase)
 * Much faster than getMyTenantBranding() Firebase function
 * 
 * @param {string} tenantId - Optional explicit tenant UUID
 * @returns {Promise<Object>} Tenant data with branding fields
 */
export async function getTenantBrandingFast(tenantId = null) {
  try {
    if (!tenantId) {
      // Try to get tenant from user first
      const user = await User.me();
      if (!user?.tenant_id) {
        throw new Error('No tenant context available');
      }
      tenantId = user.tenant_id;
    }

    const response = await fetch(`${BACKEND_URL}/api/tenants/${tenantId}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch tenant branding`);
    }

    const json = await response.json();
    const data = json?.data || json;

    // Return normalized tenant object with branding fields
    return {
      status: 200,
      data: {
        tenant: {
          id: data.id,
          tenant_id: data.tenant_id, // slug for UI
          name: data.name,
          logo_url: data.logo_url,
          primary_color: data.primary_color,
          accent_color: data.accent_color,
          settings: data.settings || data.branding_settings || {},
          country: data.country,
          industry: data.industry,
          created_at: data.created_at,
          updated_at: data.updated_at,
          ...data
        }
      }
    };
  } catch (error) {
    console.error('[getTenantBrandingFast] Error:', error);
    // Return graceful fallback
    return {
      status: 500,
      error: error?.message || 'Failed to fetch tenant branding'
    };
  }
}

// Export callBackendAPI for use in other modules (audit logging, etc.)
export { callBackendAPI };
