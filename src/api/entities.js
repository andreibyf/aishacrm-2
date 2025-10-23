import { base44 } from './base44Client';
// Import mock data utilities at the top for use throughout
import { createMockUser, createMockTenant, isLocalDevMode } from './mockData';

// Helper function to wrap entities with a filter method
const wrapEntityWithFilter = (entity) => {
  if (!entity) return entity;
  
  return {
    ...entity,
    // Add filter method as alias for list with better parameter handling
    filter: async (filterObj, sortField, limit) => {
      // Base44 list() method signature: list(filter, sort, limit)
      return entity.list(filterObj, sortField, limit);
    },
    // Ensure bulkCreate exists (fallback to multiple create calls if not)
    bulkCreate: entity.bulkCreate || (async (items) => {
      if (!Array.isArray(items)) {
        throw new Error('bulkCreate requires an array of items');
      }
      return Promise.all(items.map(item => entity.create(item)));
    })
  };
};

export const Contact = wrapEntityWithFilter(base44.entities.Contact);

export const Account = wrapEntityWithFilter(base44.entities.Account);

export const Lead = wrapEntityWithFilter(base44.entities.Lead);

export const Opportunity = wrapEntityWithFilter(base44.entities.Opportunity);

export const Activity = wrapEntityWithFilter(base44.entities.Activity);

// Wrap Tenant entity to support local dev mode
const baseTenant = base44.entities.Tenant;
const wrappedBaseTenant = wrapEntityWithFilter(baseTenant);
export const Tenant = {
  ...wrappedBaseTenant,
  get: async (id) => {
    if (isLocalDevMode()) {
      console.log('[Local Dev Mode] Using mock tenant');
      return createMockTenant();
    }
    return baseTenant.get(id);
  },
  list: async (filters) => {
    if (isLocalDevMode()) {
      console.log('[Local Dev Mode] Using mock tenant list');
      return [createMockTenant()];
    }
    return baseTenant.list(filters);
  },
};

export const Notification = wrapEntityWithFilter(base44.entities.Notification);

export const FieldCustomization = wrapEntityWithFilter(base44.entities.FieldCustomization);

export const ModuleSettings = wrapEntityWithFilter(base44.entities.ModuleSettings);

export const AuditLog = wrapEntityWithFilter(base44.entities.AuditLog);

export const Note = wrapEntityWithFilter(base44.entities.Note);

export const SubscriptionPlan = wrapEntityWithFilter(base44.entities.SubscriptionPlan);

export const Subscription = wrapEntityWithFilter(base44.entities.Subscription);

export const Webhook = wrapEntityWithFilter(base44.entities.Webhook);

export const TestReport = wrapEntityWithFilter(base44.entities.TestReport);

export const TenantIntegration = wrapEntityWithFilter(base44.entities.TenantIntegration);

export const Announcement = wrapEntityWithFilter(base44.entities.Announcement);

export const DataManagementSettings = wrapEntityWithFilter(base44.entities.DataManagementSettings);

export const Employee = wrapEntityWithFilter(base44.entities.Employee);

export const DocumentationFile = wrapEntityWithFilter(base44.entities.DocumentationFile);

export const UserInvitation = wrapEntityWithFilter(base44.entities.UserInvitation);

export const GuideContent = wrapEntityWithFilter(base44.entities.GuideContent);

export const AICampaign = wrapEntityWithFilter(base44.entities.AICampaign);

export const ApiKey = wrapEntityWithFilter(base44.entities.ApiKey);

export const CashFlow = wrapEntityWithFilter(base44.entities.CashFlow);

export const CronJob = wrapEntityWithFilter(base44.entities.CronJob);

export const PerformanceLog = wrapEntityWithFilter(base44.entities.PerformanceLog);

export const EmailTemplate = wrapEntityWithFilter(base44.entities.EmailTemplate);

export const SystemBranding = wrapEntityWithFilter(base44.entities.SystemBranding);

export const Checkpoint = wrapEntityWithFilter(base44.entities.Checkpoint);

export const SyncHealth = wrapEntityWithFilter(base44.entities.SyncHealth);

export const ContactHistory = wrapEntityWithFilter(base44.entities.ContactHistory);

export const LeadHistory = wrapEntityWithFilter(base44.entities.LeadHistory);

export const OpportunityHistory = wrapEntityWithFilter(base44.entities.OpportunityHistory);

export const DailySalesMetrics = wrapEntityWithFilter(base44.entities.DailySalesMetrics);

export const MonthlyPerformance = wrapEntityWithFilter(base44.entities.MonthlyPerformance);

export const UserPerformanceCache = wrapEntityWithFilter(base44.entities.UserPerformanceCache);

export const ImportLog = wrapEntityWithFilter(base44.entities.ImportLog);

export const BizDevSource = wrapEntityWithFilter(base44.entities.BizDevSource);

export const ArchiveIndex = wrapEntityWithFilter(base44.entities.ArchiveIndex);

export const IndustryMarketData = wrapEntityWithFilter(base44.entities.IndustryMarketData);

export const ClientRequirement = wrapEntityWithFilter(base44.entities.ClientRequirement);

export const SystemLog = wrapEntityWithFilter(base44.entities.SystemLog);

export const Workflow = wrapEntityWithFilter(base44.entities.Workflow);

export const WorkflowExecution = wrapEntityWithFilter(base44.entities.WorkflowExecution);

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