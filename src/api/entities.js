// Import mock data utilities at the top for use throughout
import { createMockUser, isLocalDevMode } from "./mockData";
import { apiHealthMonitor } from "../utils/apiHealthMonitor";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// Backend base URL: in dev, use relative path and Vite proxy to avoid CORS
// In production, normalize to HTTPS when the app is served over HTTPS to avoid mixed-content blocks
const normalizeBackendUrl = (url) => {
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && typeof url === 'string' && url.startsWith('http://')) {
      const upgraded = 'https://' + url.substring('http://'.length);
      if (!import.meta.env.DEV) {
        console.warn('[Config] Upgrading backend URL to HTTPS to avoid mixed content:', upgraded);
      }
      return upgraded;
    }
  } catch {
    // noop
  }
  return url;
};

// Exported so other modules (CronHeartbeat, AuditLog, etc.) can consume the same normalized URL
export const BACKEND_URL = import.meta.env.DEV
  ? ''
  : normalizeBackendUrl(import.meta.env.VITE_AISHACRM_BACKEND_URL || "http://localhost:3001");

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
    "auditlog": "audit-logs",
    "audit-logs": "audit-logs", // Already plural
    "notification": "notifications",
    "apikey": "apikeys",
    "cashflow": "cashflow",
    "workflow": "workflows",
    "modulesettings": "modulesettings", // Already plural
    "tenantintegration": "tenantintegrations",
    "bizdevsource": "bizdevsources",
    "tenant": "tenants",
    "systembranding": "systembrandings",
    "synchealth": "synchealths",
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
  const entityPath = pluralize(entityName);
  let url = `${BACKEND_URL}/api/${entityPath}`;

  // Get tenant_id from mock user for local dev
  const mockUser = isLocalDevMode() ? createMockUser() : null;
  const defaultTenantId = mockUser?.tenant_id || "local-tenant-001";

  // Use provided tenant_id from data, or fall back to default
  // This allows explicit tenant_id values (including 'none') to be preserved
  const tenantId = data?.tenant_id !== undefined
    ? data.tenant_id
    : defaultTenantId;

  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (method === "GET") {
    if (id) {
      // GET by ID - append ID to URL
      url += `/${id}`;
      if (data && method !== "DELETE") {
        // Preserve explicit tenant_id if provided
        const bodyData = data.tenant_id !== undefined
          ? data
          : { ...data, tenant_id: tenantId };
        options.body = JSON.stringify(bodyData);
      }
    } else {
      // GET list/filter - convert to query params
      const params = new URLSearchParams();
      // Only include tenant_id if it's not explicitly null (null means "get all tenants")
      if (tenantId !== null) {
        params.append("tenant_id", tenantId);
      }

      // Add filter parameters if provided
      if (data && Object.keys(data).length > 0) {
        Object.entries(data).forEach(([key, value]) => {
          if (key !== "tenant_id") { // Don't duplicate tenant_id
            params.append(
              key,
              typeof value === "object" ? JSON.stringify(value) : value,
            );
          }
        });
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
  } else if (data && method !== "GET") {
    // POST and other methods - include data in body, no ID in URL
    const bodyData = data.tenant_id !== undefined
      ? data
      : { ...data, tenant_id: tenantId };
    options.body = JSON.stringify(bodyData);
  }

  let response;
  try {
    response = await fetch(url, options);
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
    throw new Error(`Backend API error: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  // Backend returns { status: "success", data: { entityName: [...] } }
  // Extract the actual data array/object
  if (result.status === "success" && result.data) {
    // For list/filter operations, data contains { entityName: [...] }
    const entityKey = Object.keys(result.data).find((key) =>
      key !== "tenant_id" && Array.isArray(result.data[key])
    );
    if (entityKey && Array.isArray(result.data[entityKey])) {
      return result.data[entityKey];
    }
    // For single item operations (get, create, update), return the data directly
    if (!Array.isArray(result.data)) {
      return result.data;
    }
  }

  return result;
};

// Create a standard entity object that calls our independent backend API
const createEntity = (entityName) => {
  return {
    // Add filter method as alias for list with better parameter handling
    filter: async (filterObj, _sortField, _limit) => {
      return callBackendAPI(entityName, "GET", filterObj);
    },
    // List method
    list: async (filterObj, _sortField, _limit) => {
      return callBackendAPI(entityName, "GET", filterObj);
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

// Account entity - direct backend API calls
export const Account = {
  async list(filters = {}, _orderBy = "-created_at", limit = 100) {
    try {
      // Use centralized, normalized BACKEND_URL

      const params = new URLSearchParams();
      if (filters.tenant_id) params.append("tenant_id", filters.tenant_id);
      if (filters.name) params.append("name", filters.name);
      if (filters.industry) params.append("industry", filters.industry);
      if (filters.status) params.append("status", filters.status);
      if (limit) params.append("limit", limit);
      params.append("offset", filters.offset || 0);

      const url = `${BACKEND_URL}/api/accounts?${params}`;
      console.log("[Account.list] Fetching from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      console.log(
        "[Account.list] Response status:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("[Account.list] Response data:", result);

      if (result.status === "success" && result.data && result.data.accounts) {
        console.log(
          "[Account.list] Returning",
          result.data.accounts.length,
          "accounts",
        );
        return result.data.accounts;
      }

      console.log("[Account.list] Using fallback return format");
      return result.data || result;
    } catch (error) {
      console.error("[Account.list] Error fetching accounts:", error);
      return [];
    }
  },

  async get(id) {
    try {
      console.log("[Account.get] Fetching account:", id);

      const response = await fetch(`${BACKEND_URL}/api/accounts/${id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("[Account.get] Response status:", response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[Account.get] Error fetching account ${id}:`, error);
      throw error;
    }
  },

  async create(data) {
    try {
      console.log("[Account.create] Creating account with data:", data);

      const response = await fetch(`${BACKEND_URL}/api/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      console.log("[Account.create] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Account.create] Error response:", errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      console.log("[Account.create] Response data:", result);
      return result.data || result;
    } catch (error) {
      console.error("[Account.create] Error creating account:", error);
      throw error;
    }
  },

  async update(id, data) {
    try {
      console.log("[Account.update] Updating account:", id, "with data:", data);

      const response = await fetch(`${BACKEND_URL}/api/accounts/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      console.log(
        "[Account.update] Response status:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Account.update] Error response:", errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      console.log("[Account.update] Response data:", result);
      return result.data || result;
    } catch (error) {
      console.error(`[Account.update] Error updating account ${id}:`, error);
      throw error;
    }
  },

  async delete(id) {
    try {
      console.log("[Account.delete] Deleting account:", id);

      const response = await fetch(`${BACKEND_URL}/api/accounts/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("[Account.delete] Response status:", response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[Account.delete] Error deleting account ${id}:`, error);
      throw error;
    }
  },

  // Alias for list() - some components use filter() instead
  async filter(filters = {}, orderBy = "-created_at", limit = 100) {
    console.log("[Account.filter] Called with filters:", filters);
    return this.list(filters, orderBy, limit);
  },
};

export const Lead = createEntity("Lead");

export const Opportunity = createEntity("Opportunity");

export const Activity = createEntity("Activity");

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
      console.log("[Tenant.update] Updating tenant:", id, "with data:", data);

      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      console.log(
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
      console.log("[Tenant.update] Response data:", result);
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
      console.log("[AuditLog.list] Fetching from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      console.log(
        "[AuditLog.list] Response status:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("[AuditLog.list] Response data:", result);

      // Handle {status: 'success', data: {'audit-logs': [...], total: N}} format
      if (
        result.status === "success" && result.data && result.data["audit-logs"]
      ) {
        console.log(
          "[AuditLog.list] Returning",
          result.data["audit-logs"].length,
          "audit logs",
        );
        return result.data["audit-logs"];
      }

      // Fallback: return data directly if format is different
      console.log("[AuditLog.list] Using fallback return format");
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
    // Return default schema structure
    return {
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        url: { type: "string" },
        category: { type: "string" },
        tenant_id: { type: "string" },
      },
      required: ["name"],
    };
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
      console.log("[Local Dev Mode] SystemLog.create (not persisted):", data);
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

export const User = {
  /**
   * Get current authenticated user
   * Uses Supabase Auth with local dev fallback
   */
  me: async () => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          console.error("[Supabase Auth] Error getting user:", error);
          return null;
        }

        if (!user) {
          console.log("[Supabase Auth] No authenticated user");
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
            const users = result.data?.users || result.data || result;
            if (users && users.length > 0) {
              userData = users[0];
              console.log(
                "[Supabase Auth] User data loaded from users table:",
                userData.role,
                userData.metadata?.access_level,
              );
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
                console.log(
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
            console.log(
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
                  const list = r.data?.users || r.data || r;
                  if (list && list.length > 0) {
                    userData = list[0];
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
                    const list2 = r2.data || r2;
                    if (list2 && list2.length > 0) {
                      userData = list2[0];
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
        return {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          tenant_id: userData?.tenant_id || user.user_metadata?.tenant_id ||
            null,
          created_at: user.created_at,
          updated_at: user.updated_at,
          // Include database user data if available
          ...(userData && {
            employee_id: userData.id,
            first_name: userData.first_name,
            last_name: userData.last_name,
            role: (userData.role || "").toLowerCase(), // Normalize role to lowercase
            status: userData.status,
            permissions: userData.metadata?.permissions || [],
            access_level: userData.metadata?.access_level,
            is_superadmin: (userData.role || "").toLowerCase() === "superadmin",
            can_manage_users: userData.metadata?.can_manage_users || false,
            can_manage_settings: userData.metadata?.can_manage_settings ||
              false,
            crm_access: true, // Grant CRM access to authenticated users with records
          }),
          // Include any custom fields from user_metadata
          ...user.user_metadata,
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

        console.log("[Supabase Auth] Sign in successful:", data.user?.email);

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

        console.log("[Supabase Auth] Sign out successful");
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

        console.log("[Supabase Auth] Sign up successful:", data.user?.email);

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

        console.log("[Supabase Auth] User updated successfully");

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
    console.log("[User.list] Fetching users via backend API");
    return callBackendAPI("user", "GET", filters);
  },

  /**
   * Update any user by ID (admin function - uses backend API)
   */
  update: async (userId, updates) => {
    // ALWAYS use backend API for user updates (don't mock this - we need real persistence)
    console.log(
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
};

// Export callBackendAPI for use in other modules (audit logging, etc.)
export { callBackendAPI };
