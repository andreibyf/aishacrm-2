import { base44 } from './base44Client';
// Import mock data utilities at the top for use throughout
import { createMockUser, isLocalDevMode } from './mockData';
import { apiHealthMonitor } from '../utils/apiHealthMonitor';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Get backend URL from environment
const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

// Helper to properly pluralize entity names for API endpoints
const pluralize = (entityName) => {
  const name = entityName.toLowerCase();
  
  // Special cases for irregular plurals
  const irregularPlurals = {
    'opportunity': 'opportunities',
    'activity': 'activities',
    'employee': 'employees',
    'systemlog': 'system-logs',
    'auditlog': 'audit-logs',
    'notification': 'notifications',
    'apikey': 'apikeys',
    'cashflow': 'cashflow',
    'workflow': 'workflows',
    'modulesettings': 'modulesettings', // Already plural
    'tenantintegration': 'tenantintegrations',
    'bizdevsource': 'bizdevsources',
    'tenant': 'tenants',
    'systembranding': 'systembrandings',
  };
  
  if (irregularPlurals[name]) {
    return irregularPlurals[name];
  }
  
  // Default: just add 's'
  return name + 's';
};

// Helper to generate a safe local-dev fallback result to keep UI responsive
const makeDevFallback = (entityName, method, data, id) => {
  const now = new Date().toISOString();
  const lname = entityName.toLowerCase();
  switch (method) {
    case 'GET':
      // List/filter returns empty array; get-by-id returns null
      return id ? null : [];
    case 'POST':
      return { id: `local-${lname}-${Date.now()}`, ...data, created_at: now, updated_at: now };
    case 'PUT':
      return { id, ...data, updated_at: now };
    case 'DELETE':
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
  const defaultTenantId = mockUser?.tenant_id || 'local-tenant-001';
  
  // Use provided tenant_id from data, or fall back to default
  // This allows explicit tenant_id values (including 'none') to be preserved
  const tenantId = data?.tenant_id !== undefined ? data.tenant_id : defaultTenantId;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (method === 'GET') {
    if (id) {
      // GET by ID - append ID to URL
      url += `/${id}`;
      if (data && method !== 'DELETE') {
        options.body = JSON.stringify({ ...data, tenant_id: tenantId });
      }
    } else {
      // GET list/filter - convert to query params
      const params = new URLSearchParams();
      // Always include tenant_id for list operations
      params.append('tenant_id', tenantId);
      
      // Add filter parameters if provided
      if (data && Object.keys(data).length > 0) {
        Object.entries(data).forEach(([key, value]) => {
          if (key !== 'tenant_id') { // Don't duplicate tenant_id
            params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
          }
        });
      }
      url += `?${params.toString()}`;
    }
  } else if (id) {
    url += `/${id}`;
    if (data && method !== 'DELETE') {
      // Include tenant_id in body
      options.body = JSON.stringify({ ...data, tenant_id: tenantId });
    }
  } else if (data && method !== 'GET') {
    // Include tenant_id in body
    options.body = JSON.stringify({ ...data, tenant_id: tenantId });
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
      timestamp: new Date().toISOString()
    });
    // In local dev, return safe fallback instead of throwing hard
    if (isLocalDevMode()) {
      console.warn(`[Local Dev Mode] Backend unreachable for ${method} ${url}. Using fallback.`);
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
      timestamp: new Date().toISOString()
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
      console.warn(`[Local Dev Mode] ${method} ${url} failed (${response.status}). Using fallback.`);
      return makeDevFallback(entityName, method, data, id);
    }
    throw new Error(`Backend API error: ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  
  // Backend returns { status: "success", data: { entityName: [...] } }
  // Extract the actual data array/object
  if (result.status === 'success' && result.data) {
    // For list/filter operations, data contains { entityName: [...] }
    const entityKey = Object.keys(result.data).find(key => 
      key !== 'tenant_id' && Array.isArray(result.data[key])
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

// Helper function to wrap entities with a filter method and backend fallback
const wrapEntityWithFilter = (entity, entityName) => {
  if (!entity) return entity;
  
  return {
    ...entity,
    // Add filter method as alias for list with better parameter handling
    filter: async (filterObj, sortField, limit) => {
      // In local dev mode, use independent backend
      if (isLocalDevMode()) {
        return callBackendAPI(entityName, 'GET', filterObj);
      }
      // Base44 list() method signature: list(filter, sort, limit)
      return entity.list(filterObj, sortField, limit);
    },
    // List method
    list: async (filterObj, sortField, limit) => {
      if (isLocalDevMode()) {
        return callBackendAPI(entityName, 'GET', filterObj);
      }
      return entity.list(filterObj, sortField, limit);
    },
    // Get by ID
    get: async (id) => {
      if (isLocalDevMode()) {
        return callBackendAPI(entityName, 'GET', null, id);
      }
      return entity.get(id);
    },
    // Create
    create: async (data) => {
      if (isLocalDevMode()) {
        return callBackendAPI(entityName, 'POST', data);
      }
      return entity.create(data);
    },
    // Update
    update: async (id, data) => {
      if (isLocalDevMode()) {
        return callBackendAPI(entityName, 'PUT', data, id);
      }
      return entity.update(id, data);
    },
    // Delete
    delete: async (id) => {
      if (isLocalDevMode()) {
        return callBackendAPI(entityName, 'DELETE', null, id);
      }
      return entity.delete(id);
    },
    // Ensure bulkCreate exists (fallback to multiple create calls if not)
    bulkCreate: entity.bulkCreate || (async (items) => {
      if (!Array.isArray(items)) {
        throw new Error('bulkCreate requires an array of items');
      }
      return Promise.all(items.map(item => 
        isLocalDevMode() 
          ? callBackendAPI(entityName, 'POST', item)
          : entity.create(item)
      ));
    })
  };
};

export const Contact = wrapEntityWithFilter(base44.entities.Contact, 'Contact');

// Account entity - direct backend API calls
export const Account = {
  async list(filters = {}, orderBy = '-created_at', limit = 100) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.name) params.append('name', filters.name);
      if (filters.industry) params.append('industry', filters.industry);
      if (filters.status) params.append('status', filters.status);
      if (limit) params.append('limit', limit);
      params.append('offset', filters.offset || 0);

      const url = `${BACKEND_URL}/api/accounts?${params}`;
      console.log('[Account.list] Fetching from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      console.log('[Account.list] Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Account.list] Response data:', result);
      
      if (result.status === 'success' && result.data && result.data.accounts) {
        console.log('[Account.list] Returning', result.data.accounts.length, 'accounts');
        return result.data.accounts;
      }

      console.log('[Account.list] Using fallback return format');
      return result.data || result;
    } catch (error) {
      console.error('[Account.list] Error fetching accounts:', error);
      return [];
    }
  },

  async get(id) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      console.log('[Account.get] Fetching account:', id);
      
      const response = await fetch(`${BACKEND_URL}/api/accounts/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[Account.get] Response status:', response.status);

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
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      console.log('[Account.create] Creating account with data:', data);
      
      const response = await fetch(`${BACKEND_URL}/api/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      console.log('[Account.create] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Account.create] Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[Account.create] Response data:', result);
      return result.data || result;
    } catch (error) {
      console.error('[Account.create] Error creating account:', error);
      throw error;
    }
  },

  async update(id, data) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      console.log('[Account.update] Updating account:', id, 'with data:', data);
      
      const response = await fetch(`${BACKEND_URL}/api/accounts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      console.log('[Account.update] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Account.update] Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[Account.update] Response data:', result);
      return result.data || result;
    } catch (error) {
      console.error(`[Account.update] Error updating account ${id}:`, error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      console.log('[Account.delete] Deleting account:', id);
      
      const response = await fetch(`${BACKEND_URL}/api/accounts/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[Account.delete] Response status:', response.status);

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
  async filter(filters = {}, orderBy = '-created_at', limit = 100) {
    console.log('[Account.filter] Called with filters:', filters);
    return this.list(filters, orderBy, limit);
  },
};

export const Lead = wrapEntityWithFilter(base44.entities.Lead, 'Lead');

export const Opportunity = wrapEntityWithFilter(base44.entities.Opportunity, 'Opportunity');

export const Activity = wrapEntityWithFilter(base44.entities.Activity, 'Activity');

// Tenant entity - direct backend API calls
export const Tenant = {
  async list(orderBy = 'display_order') {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/tenants`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Handle {status: 'success', data: {tenants: [...], total: N}} format
      if (result.status === 'success' && result.data && result.data.tenants) {
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
      console.error('[Tenant.list] Error fetching tenants:', error);
      return [];
    }
  },

  async get(id) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
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
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[Tenant.create] Error creating tenant:', error);
      throw error;
    }
  },

  async update(id, data) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      console.log('[Tenant.update] Updating tenant:', id, 'with data:', data);
      
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      console.log('[Tenant.update] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Tenant.update] Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[Tenant.update] Response data:', result);
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.update] Error updating tenant ${id}:`, error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
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

export const Notification = wrapEntityWithFilter(base44.entities.Notification, 'Notification');

export const FieldCustomization = wrapEntityWithFilter(base44.entities.FieldCustomization, 'FieldCustomization');

export const ModuleSettings = wrapEntityWithFilter(base44.entities.ModuleSettings, 'ModuleSettings');

// AuditLog entity - direct backend API calls
export const AuditLog = {
  async list(filters = {}, orderBy = '-created_at', limit = 100) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.user_email) params.append('user_email', filters.user_email);
      if (filters.action) params.append('action', filters.action);
      if (filters.entity_type) params.append('entity_type', filters.entity_type);
      if (filters.entity_id) params.append('entity_id', filters.entity_id);
      if (limit) params.append('limit', limit);
      params.append('offset', filters.offset || 0);

      const url = `${BACKEND_URL}/api/audit-logs?${params}`;
      console.log('[AuditLog.list] Fetching from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      console.log('[AuditLog.list] Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[AuditLog.list] Response data:', result);
      
      // Handle {status: 'success', data: {'audit-logs': [...], total: N}} format
      if (result.status === 'success' && result.data && result.data['audit-logs']) {
        console.log('[AuditLog.list] Returning', result.data['audit-logs'].length, 'audit logs');
        return result.data['audit-logs'];
      }

      // Fallback: return data directly if format is different
      console.log('[AuditLog.list] Using fallback return format');
      return result.data || result;
    } catch (error) {
      console.error('[AuditLog.list] Error fetching audit logs:', error);
      return [];
    }
  },

  async get(id) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/audit-logs/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
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
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/audit-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[AuditLog.create] Error creating audit log:', error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${BACKEND_URL}/api/audit-logs/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
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
      const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
      
      // Build query parameters for bulk delete
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.user_email) params.append('user_email', filters.user_email);
      if (filters.entity_type) params.append('entity_type', filters.entity_type);
      if (filters.older_than_days) params.append('older_than_days', filters.older_than_days);

      const response = await fetch(`${BACKEND_URL}/api/audit-logs?${params}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[AuditLog.clear] Error clearing audit logs:', error);
      throw error;
    }
  },
};

export const Note = wrapEntityWithFilter(base44.entities.Note, 'Note');

export const SubscriptionPlan = wrapEntityWithFilter(base44.entities.SubscriptionPlan, 'SubscriptionPlan');

export const Subscription = wrapEntityWithFilter(base44.entities.Subscription, 'Subscription');

export const Webhook = wrapEntityWithFilter(base44.entities.Webhook, 'Webhook');

export const TestReport = wrapEntityWithFilter(base44.entities.TestReport, 'TestReport');

export const TenantIntegration = wrapEntityWithFilter(base44.entities.TenantIntegration, 'TenantIntegration');

export const Announcement = wrapEntityWithFilter(base44.entities.Announcement, 'Announcement');

export const DataManagementSettings = wrapEntityWithFilter(base44.entities.DataManagementSettings, 'DataManagementSettings');

export const Employee = wrapEntityWithFilter(base44.entities.Employee, 'Employee');

export const DocumentationFile = wrapEntityWithFilter(base44.entities.DocumentationFile, 'DocumentationFile');

export const UserInvitation = wrapEntityWithFilter(base44.entities.UserInvitation, 'UserInvitation');

export const GuideContent = wrapEntityWithFilter(base44.entities.GuideContent, 'GuideContent');

export const AICampaign = wrapEntityWithFilter(base44.entities.AICampaign, 'AICampaign');

export const ApiKey = wrapEntityWithFilter(base44.entities.ApiKey, 'ApiKey');

export const CashFlow = wrapEntityWithFilter(base44.entities.CashFlow, 'CashFlow');

export const CronJob = wrapEntityWithFilter(base44.entities.CronJob, 'CronJob');

export const PerformanceLog = wrapEntityWithFilter(base44.entities.PerformanceLog, 'PerformanceLog');

export const EmailTemplate = wrapEntityWithFilter(base44.entities.EmailTemplate, 'EmailTemplate');

export const SystemBranding = wrapEntityWithFilter(base44.entities.SystemBranding, 'SystemBranding');

export const Checkpoint = wrapEntityWithFilter(base44.entities.Checkpoint, 'Checkpoint');

export const SyncHealth = wrapEntityWithFilter(base44.entities.SyncHealth, 'SyncHealth');

export const ContactHistory = wrapEntityWithFilter(base44.entities.ContactHistory, 'ContactHistory');

export const LeadHistory = wrapEntityWithFilter(base44.entities.LeadHistory, 'LeadHistory');

export const OpportunityHistory = wrapEntityWithFilter(base44.entities.OpportunityHistory, 'OpportunityHistory');

export const DailySalesMetrics = wrapEntityWithFilter(base44.entities.DailySalesMetrics, 'DailySalesMetrics');

export const MonthlyPerformance = wrapEntityWithFilter(base44.entities.MonthlyPerformance, 'MonthlyPerformance');

export const UserPerformanceCache = wrapEntityWithFilter(base44.entities.UserPerformanceCache, 'UserPerformanceCache');

export const ImportLog = wrapEntityWithFilter(base44.entities.ImportLog, 'ImportLog');

export const BizDevSource = {
  ...wrapEntityWithFilter(base44.entities.BizDevSource, 'BizDevSource'),
  schema: async () => {
    if (isLocalDevMode()) {
      return {
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name'],
      };
    }
    return base44.entities.BizDevSource.schema();
  },
};

export const ArchiveIndex = wrapEntityWithFilter(base44.entities.ArchiveIndex, 'ArchiveIndex');

export const IndustryMarketData = wrapEntityWithFilter(base44.entities.IndustryMarketData, 'IndustryMarketData');

export const ClientRequirement = wrapEntityWithFilter(base44.entities.ClientRequirement, 'ClientRequirement');

// SystemLog with safe fallback to suppress connection errors in local dev when backend is down
const baseSystemLog = wrapEntityWithFilter(base44.entities.SystemLog, 'SystemLog');
export const SystemLog = {
  ...baseSystemLog,
  create: async (data) => {
    if (isLocalDevMode()) {
      // Silent fallback: don't try to POST to backend if it's not running
      // Just log to console and return success
      console.log('[Local Dev Mode] SystemLog.create (not persisted):', data);
      return { id: `local-log-${Date.now()}`, ...data, created_at: new Date().toISOString() };
    }
    return baseSystemLog.create(data);
  },
};

export const Workflow = wrapEntityWithFilter(base44.entities.Workflow, 'Workflow');

export const WorkflowExecution = wrapEntityWithFilter(base44.entities.WorkflowExecution, 'WorkflowExecution');

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
          console.error('[Supabase Auth] Error getting user:', error);
          return null;
        }

        if (!user) {
          console.log('[Supabase Auth] No authenticated user');
          return null;
        }

        // Fetch employee record from database to get permissions and tenant_id
        let employeeData = null;
        try {
          const response = await fetch(`${BACKEND_URL}/api/employees?email=${encodeURIComponent(user.email)}`);
          if (response.ok) {
            const result = await response.json();
            // Backend returns {status: 'success', data: [...]}
            const employees = result.data || result;
            if (employees && employees.length > 0) {
              employeeData = employees[0]; // Get first matching employee
              console.log('[Supabase Auth] Employee data loaded:', employeeData.role, employeeData.metadata?.access_level);
            } else {
              console.warn('[Supabase Auth] No employee record found for:', user.email);
            }
          } else {
            console.error('[Supabase Auth] Failed to fetch employee data:', response.status, response.statusText);
          }
        } catch (err) {
          console.error('[Supabase Auth] Error fetching employee data:', err.message);
        }

        // Map Supabase user to our User format with employee data
        return {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          tenant_id: employeeData?.tenant_id || user.user_metadata?.tenant_id || null,
          created_at: user.created_at,
          updated_at: user.updated_at,
          // Include employee data if available
          ...(employeeData && {
            employee_id: employeeData.id,
            first_name: employeeData.first_name,
            last_name: employeeData.last_name,
            role: (employeeData.role || '').toLowerCase(), // Normalize role to lowercase
            status: employeeData.status,
            permissions: employeeData.metadata?.permissions || [],
            access_level: employeeData.metadata?.access_level,
            is_superadmin: employeeData.metadata?.is_superadmin || false,
            can_manage_users: employeeData.metadata?.can_manage_users || false,
            can_manage_settings: employeeData.metadata?.can_manage_settings || false,
            crm_access: true, // Grant CRM access to authenticated users with employee records
          }),
          // Include any custom fields from user_metadata
          ...user.user_metadata,
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in me():', err);
        return null;
      }
    }

    // Fallback: Use Base44 if Supabase not configured
    console.warn('[Auth] Supabase not configured, falling back to Base44');
    return base44.auth.me();
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
          console.error('[Supabase Auth] Sign in error:', error);
          throw new Error(error.message);
        }

        console.log('[Supabase Auth] Sign in successful:', data.user?.email);
        
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
        console.error('[Supabase Auth] Exception in signIn():', err);
        throw err;
      }
    }

    // Fallback: Use Base44 if Supabase not configured
    console.warn('[Auth] Supabase not configured, falling back to Base44');
    return base44.auth.signIn(email, password);
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
          console.error('[Supabase Auth] Sign out error:', error);
          throw new Error(error.message);
        }

        console.log('[Supabase Auth] Sign out successful');
        return true;
      } catch (err) {
        console.error('[Supabase Auth] Exception in signOut():', err);
        throw err;
      }
    }

    // Fallback: Use Base44 if Supabase not configured
    console.warn('[Auth] Supabase not configured, falling back to Base44');
    return base44.auth.signOut();
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
          console.error('[Supabase Auth] Sign up error:', error);
          throw new Error(error.message);
        }

        console.log('[Supabase Auth] Sign up successful:', data.user?.email);
        
        return {
          id: data.user?.id,
          email: data.user?.email,
          user_metadata: data.user?.user_metadata,
          tenant_id: metadata.tenant_id,
          session: data.session,
          ...metadata,
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in signUp():', err);
        throw err;
      }
    }

    // Fallback: Use Base44 if Supabase not configured
    console.warn('[Auth] Supabase not configured, falling back to Base44');
    return base44.auth.signUp(email, password, metadata);
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
          console.error('[Supabase Auth] Update user error:', error);
          throw new Error(error.message);
        }

        console.log('[Supabase Auth] User updated successfully');
        
        return {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
          tenant_id: data.user.user_metadata?.tenant_id || null,
          ...data.user.user_metadata,
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in updateMyUserData():', err);
        throw err;
      }
    }

    // Fallback: Use Base44 SDK
    console.warn('[Auth] Supabase not configured, falling back to Base44');
    const currentUser = await base44.auth.me();
    if (!currentUser?.id) {
      throw new Error('No authenticated user found');
    }
    return base44.entities.User.update(currentUser.id, updates);
  },

  /**
   * List all users (admin function - uses backend API)
   */
  list: async (filters) => {
    // ALWAYS use backend API for listing users (don't mock this - we need real data)
    console.log('[User.list] Fetching users via backend API');
    return callBackendAPI('user', 'GET', filters);
  },

  /**
   * Update any user by ID (admin function - uses backend API)
   */
  update: async (userId, updates) => {
    // ALWAYS use backend API for user updates (don't mock this - we need real persistence)
    console.log('[User.update] Updating user via backend API:', userId, updates);
    return callBackendAPI('user', 'PUT', updates, userId);
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