import { base44 } from './base44Client';
// Import mock data utilities at the top for use throughout
import { createMockUser, createMockTenant, isLocalDevMode } from './mockData';

export const Contact = base44.entities.Contact;

export const Account = base44.entities.Account;

export const Lead = base44.entities.Lead;

export const Opportunity = base44.entities.Opportunity;

export const Activity = base44.entities.Activity;

// Wrap Tenant entity to support local dev mode
const baseTenant = base44.entities.Tenant;
export const Tenant = {
  ...baseTenant,
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

export const Notification = base44.entities.Notification;

export const FieldCustomization = base44.entities.FieldCustomization;

export const ModuleSettings = base44.entities.ModuleSettings;

export const AuditLog = base44.entities.AuditLog;

export const Note = base44.entities.Note;

export const SubscriptionPlan = base44.entities.SubscriptionPlan;

export const Subscription = base44.entities.Subscription;

export const Webhook = base44.entities.Webhook;

export const TestReport = base44.entities.TestReport;

export const TenantIntegration = base44.entities.TenantIntegration;

export const Announcement = base44.entities.Announcement;

export const DataManagementSettings = base44.entities.DataManagementSettings;

export const Employee = base44.entities.Employee;

export const DocumentationFile = base44.entities.DocumentationFile;

export const UserInvitation = base44.entities.UserInvitation;

export const GuideContent = base44.entities.GuideContent;

export const AICampaign = base44.entities.AICampaign;

export const ApiKey = base44.entities.ApiKey;

export const CashFlow = base44.entities.CashFlow;

export const CronJob = base44.entities.CronJob;

export const PerformanceLog = base44.entities.PerformanceLog;

export const EmailTemplate = base44.entities.EmailTemplate;

export const SystemBranding = base44.entities.SystemBranding;

export const Checkpoint = base44.entities.Checkpoint;

export const SyncHealth = base44.entities.SyncHealth;

export const ContactHistory = base44.entities.ContactHistory;

export const LeadHistory = base44.entities.LeadHistory;

export const OpportunityHistory = base44.entities.OpportunityHistory;

export const DailySalesMetrics = base44.entities.DailySalesMetrics;

export const MonthlyPerformance = base44.entities.MonthlyPerformance;

export const UserPerformanceCache = base44.entities.UserPerformanceCache;

export const ImportLog = base44.entities.ImportLog;

export const BizDevSource = base44.entities.BizDevSource;

export const ArchiveIndex = base44.entities.ArchiveIndex;

export const IndustryMarketData = base44.entities.IndustryMarketData;

export const ClientRequirement = base44.entities.ClientRequirement;

export const SystemLog = base44.entities.SystemLog;

export const Workflow = base44.entities.Workflow;

export const WorkflowExecution = base44.entities.WorkflowExecution;

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
  // Pass through other methods
  signIn: baseUser.signIn,
  signOut: baseUser.signOut,
  signUp: baseUser.signUp,
};