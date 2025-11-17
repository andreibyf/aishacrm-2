import { base44 } from './base44Client';
// Import mock data utilities at the top for use throughout
import { createMockUser, isLocalDevMode } from './mockData';
import { apiHealthMonitor } from '../utils/apiHealthMonitor';

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
  };
  
  if (irregularPlurals[name]) {
    return irregularPlurals[name];
  }
  
  // Default: just add 's'
  return name + 's';
};

// Helper to call independent backend API
const callBackendAPI = async (entityName, method, data = null, id = null) => {
  const entityPath = pluralize(entityName);
  let url = `${BACKEND_URL}/api/${entityPath}`;
  
  // Get tenant_id from mock user for local dev
  const mockUser = isLocalDevMode() ? createMockUser() : null;
  const tenantId = mockUser?.tenant_id || 'local-tenant-001';
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (method === 'GET' && data) {
    // Convert filter object to query params
    const params = new URLSearchParams();
    // Always include tenant_id
    params.append('tenant_id', tenantId);
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'tenant_id') { // Don't duplicate tenant_id
        params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
      }
    });
    url += `?${params.toString()}`;
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

export const Account = wrapEntityWithFilter(base44.entities.Account, 'Account');

export const Lead = wrapEntityWithFilter(base44.entities.Lead, 'Lead');

export const Opportunity = wrapEntityWithFilter(base44.entities.Opportunity, 'Opportunity');

export const Activity = wrapEntityWithFilter(base44.entities.Activity, 'Activity');

// Wrap Tenant entity - uses backend API in local dev mode
export const Tenant = wrapEntityWithFilter(base44.entities.Tenant, 'Tenant');

export const Notification = wrapEntityWithFilter(base44.entities.Notification, 'Notification');

export const FieldCustomization = wrapEntityWithFilter(base44.entities.FieldCustomization, 'FieldCustomization');

export const ModuleSettings = wrapEntityWithFilter(base44.entities.ModuleSettings, 'ModuleSettings');

export const AuditLog = wrapEntityWithFilter(base44.entities.AuditLog, 'AuditLog');

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

// auth sdk with local dev mode support:
const baseUser = base44.auth;

// Wrap User.me() to return mock data in local dev mode
export const User = {
  ...baseUser,
  me: async () => {
    if (isLocalDevMode()) {
      // Return mock user for local development
      console.log('[Local Dev Mode] Using mock user');
      return createMockUser();
    }
    // Use real Base44 authentication
    return baseUser.me();
  },
  // Add updateMyUserData as a wrapper for updating current user
  updateMyUserData: async (updates) => {
    if (isLocalDevMode()) {
      console.log('[Local Dev Mode] Mock updating user data', updates);
      return createMockUser();
    }
    // Get current user and update
    const currentUser = await baseUser.me();
    if (!currentUser?.id) {
      throw new Error('No authenticated user found');
    }
    // Use the User entity's update method
    return base44.entities.User.update(currentUser.id, updates);
  },
  // Add update method for updating any user (admin function)
  update: async (userId, updates) => {
    if (isLocalDevMode()) {
      console.log('[Local Dev Mode] Mock updating user', userId, updates);
      return createMockUser();
    }
    return base44.entities.User.update(userId, updates);
  },
  // Add list method for listing users
  list: async (filters) => {
    if (isLocalDevMode()) {
      console.log('[Local Dev Mode] Mock listing users');
      return [createMockUser()];
    }
    return base44.entities.User.list(filters);
  },
  // Pass through other methods
  signIn: baseUser.signIn,
  signOut: baseUser.signOut,
  signUp: baseUser.signUp,
};