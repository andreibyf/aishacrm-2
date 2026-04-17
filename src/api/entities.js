// ============================================
// BARREL RE-EXPORT FILE
// ============================================
// This file re-exports all entity modules so that existing imports
// throughout the codebase continue working unchanged.
// The actual implementations live in:
//   - src/api/core/httpClient.js       (callBackendAPI, BACKEND_URL, etc.)
//   - src/api/core/createEntity.js     (entity factory)
//   - src/api/entityOverrides/*.js     (complex entity overrides)
//   - src/api/helpers/tenantBranding.js (branding helper)
// ============================================

// --- Core ---
export {
  callBackendAPI,
  BACKEND_URL,
  ENTITIES_BUILD_VERSION,
  getBuildVersion,
} from './core/httpClient';
export { supabase, isSupabaseConfigured } from '../lib/supabase';

// --- Entity factory for simple entities ---
import { createEntity } from './core/createEntity';

// --- Simple entities (one-liner createEntity calls) ---
// Contact and Account moved to entityOverrides for bulkAssign support
export const Customer = createEntity('Customer');
export const Note = createEntity('Note');
export const Notification = createEntity('Notification');
export const FieldCustomization = createEntity('FieldCustomization');
export const ModuleSettings = createEntity('ModuleSettings');
export const SubscriptionPlan = createEntity('SubscriptionPlan');
export const Subscription = createEntity('Subscription');
export const Webhook = createEntity('Webhook');
export const TestReport = createEntity('TestReport');
export const TenantIntegration = createEntity('TenantIntegration');
export const Announcement = createEntity('Announcement');
export const DataManagementSettings = createEntity('DataManagementSettings');
export const Employee = createEntity('Employee');
export const DocumentationFile = createEntity('DocumentationFile');
export const UserInvitation = createEntity('UserInvitation');
export const GuideContent = createEntity('GuideContent');
export const AICampaign = createEntity('AICampaign');
export const ApiKey = createEntity('ApiKey');
export const CashFlow = createEntity('CashFlow');
export const PerformanceLog = createEntity('PerformanceLog');
export const EmailTemplate = createEntity('EmailTemplate');
export const Template = createEntity('Template');
export const SystemBranding = createEntity('SystemBranding');
export const Checkpoint = createEntity('Checkpoint');
export const SyncHealth = createEntity('SyncHealth');
export const ContactHistory = createEntity('ContactHistory');
export const LeadHistory = createEntity('LeadHistory');
export const OpportunityHistory = createEntity('OpportunityHistory');
export const DailySalesMetrics = createEntity('DailySalesMetrics');
export const MonthlyPerformance = createEntity('MonthlyPerformance');
export const UserPerformanceCache = createEntity('UserPerformanceCache');
export const ImportLog = createEntity('ImportLog');
export const ArchiveIndex = createEntity('ArchiveIndex');
export const IndustryMarketData = createEntity('IndustryMarketData');
export const ClientRequirement = createEntity('ClientRequirement');
export const Workflow = createEntity('Workflow');
export const WorkflowExecution = createEntity('WorkflowExecution');

// --- CronJob with runNow extension ---
import { getBackendUrl } from './backendUrl';
export const CronJob = createEntity('CronJob');
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

// --- Complex entity overrides ---
export { Lead } from './entityOverrides/lead';
export { Contact } from './entityOverrides/contact';
export { Account } from './entityOverrides/account';
export { Opportunity } from './entityOverrides/opportunity';
export { Activity } from './entityOverrides/activity';
export { Tenant } from './entityOverrides/tenant';
export { AuditLog } from './entityOverrides/auditLog';
export { BizDevSource } from './entityOverrides/bizdevSource';
export { SystemLog } from './entityOverrides/systemLog';
export { User } from './entityOverrides/user';
export { ConstructionProject, ConstructionAssignment } from './entityOverrides/construction';
export { Worker } from './entityOverrides/worker';

// --- Helpers ---
export { getTenantBrandingFast } from './helpers/tenantBranding';
