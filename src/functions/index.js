/**
 * Local Functions - Export Surface
 * Auto-generated exports for 197 functions organized by category
 */

// Database & Data Operations
export { syncDatabase } from './database/syncDatabase';
export { checkDataVolume } from './database/checkDataVolume';
export { archiveAgedData } from './database/archiveAgedData';
export { archiveOldData } from './database/archiveOldData';
export { cleanupOrphanedData } from './database/cleanupOrphanedData';
export { detectOrphanedRecords } from './database/detectOrphanedRecords';
export { syncDenormalizedFields } from './database/syncDenormalizedFields';
export { cronSyncDenormalizedFields } from './database/cronSyncDenormalizedFields';
export { cronDenormalizationSync } from './database/cronDenormalizationSync';
export { cronOrphanCleanup } from './database/cronOrphanCleanup';
export { trackEntityChange } from './database/trackEntityChange';
export { getEntityAtDate } from './database/getEntityAtDate';

// n8n Integration
export { n8nCreateLead } from './integrations/n8nCreateLead';
export { n8nCreateContact } from './integrations/n8nCreateContact';
export { n8nGetData } from './integrations/n8nGetData';
export { n8nUpdateContact } from './integrations/n8nUpdateContact';

// Telephony & Call Management
export { makeCall } from './telephony/makeCall';
export { callStatus } from './telephony/callStatus';
export { thoughtlyCallResults } from './telephony/thoughtlyCallResults';
export { thoughtlyTranscripts } from './telephony/thoughtlyTranscripts';
export { generateSignalWireJWT } from './telephony/generateSignalWireJWT';
export { generateTwilioToken } from './telephony/generateTwilioToken';
export { universalAICall } from './telephony/universalAICall';
export { processScheduledAICalls } from './telephony/processScheduledAICalls';
export { manualTriggerAICalls } from './telephony/manualTriggerAICalls';
export { checkScheduledAICalls } from './telephony/checkScheduledAICalls';

// User Management
export { cleanupUserData } from './users/cleanupUserData';
export { updateUserRole } from './users/updateUserRole';
export { inviteUser } from './users/inviteUser';
export { updateLastLogin } from './users/updateLastLogin';
export { checkUserRecord } from './users/checkUserRecord';
export { userExistsByEmail } from './users/userExistsByEmail';
export { listTenantUsers } from './users/listTenantUsers';
export { setUserTenant } from './users/setUserTenant';
export { requestUserInvite } from './users/requestUserInvite';

// Billing & Payments
export { createCheckoutSession } from './billing/createCheckoutSession';
export { createBillingPortalSession } from './billing/createBillingPortalSession';
export { handleStripeWebhook } from './billing/handleStripeWebhook';
export { testStripeConnection } from './billing/testStripeConnection';

// System Health & Diagnostics
export { checkBackendStatus } from './system/checkBackendStatus';
export { runFullSystemDiagnostics } from './system/runFullSystemDiagnostics';
export { runComponentTests } from './system/runComponentTests';
export { testSuites } from './system/testSuites';
export { performanceTestSuites } from './system/performanceTestSuites';
export { testConnection } from './system/testConnection';
export { getPerformanceMetrics } from './system/getPerformanceMetrics';
export { listPerformanceLogs } from './system/listPerformanceLogs';

// Webhooks
export { dispatchWebhook } from './webhooks/dispatchWebhook';
export { incomingWebhook } from './webhooks/incomingWebhook';
export { createActivityWebhook } from './webhooks/createActivityWebhook';
export { tenantZapierWebhook } from './webhooks/tenantZapierWebhook';
export { callFluentWebhookV2 } from './webhooks/callFluentWebhookV2';
export { elevenLabsCRMWebhook } from './webhooks/elevenLabsCRMWebhook';

// Cloud Storage
export { tenantGoogleDrive } from './storage/tenantGoogleDrive';
export { tenantOneDrive } from './storage/tenantOneDrive';
export { minioDocumentManager } from './storage/minioDocumentManager';
export { createTenantWithBucket } from './storage/createTenantWithBucket';
export { r2DocumentManager } from './storage/r2DocumentManager';
export { createTenantWithR2Bucket } from './storage/createTenantWithR2Bucket';
export { checkR2Config } from './storage/checkR2Config';
export { diagnoseR2Upload } from './storage/diagnoseR2Upload';
export { debugUploadPrivateFile } from './storage/debugUploadPrivateFile';
export { archiveBizDevSourcesToR2 } from './storage/archiveBizDevSourcesToR2';
export { retrieveArchiveFromR2 } from './storage/retrieveArchiveFromR2';

// Email & Calendar
export { tenantOutlookEmail } from './integrations/tenantOutlookEmail';
export { tenantOutlookCalendar } from './integrations/tenantOutlookCalendar';
export { sendAIEmail } from './ai/sendAIEmail';
export { generateAIEmailDraft } from './ai/generateAIEmailDraft';
export { processScheduledAIEmails } from './ai/processScheduledAIEmails';

// AI & LLM
export { invokeTenantLLM } from './ai/invokeTenantLLM';
export { testSystemOpenAI } from './ai/testSystemOpenAI';
export { invokeSystemOpenAI } from './ai/invokeSystemOpenAI';
export { generateCRMSummary } from './ai/generateCRMSummary';
export { generateDailyBriefing } from './ai/generateDailyBriefing';
export { generateElevenLabsSpeech } from './ai/generateElevenLabsSpeech';
export { elevenLabsNavigation } from './ai/elevenLabsNavigation';
export { elevenLabsCRMAccess } from './ai/elevenLabsCRMAccess';
export { transcribeAudio } from './ai/transcribeAudio';
export { processChatCommand } from './ai/processChatCommand';
export { processAICommand } from './ai/processAICommand';
export { handleVoiceCommand } from './ai/handleVoiceCommand';
export { voiceCommand } from './ai/voiceCommand';
export { generateAIPlan } from './ai/generateAIPlan';
export { executeAIPlan } from './ai/executeAIPlan';
export { aiToken } from './ai/aiToken';
export { aiRun } from './ai/aiRun';

// MCP (Model Context Protocol)
export { mcpServer } from './mcp/mcpServer';
export { mcpHandler } from './mcp/mcpHandler';
export { mcpToolFinder } from './mcp/mcpToolFinder';
export { mcpServerSimple } from './mcp/mcpServerSimple';
export { mcpServerPublic } from './mcp/mcpServerPublic';
export { mcpServerDebug } from './mcp/mcpServerDebug';

// Accounts Management
export { deleteAccount } from './accounts/deleteAccount';
export { validateAccountRelationships } from './accounts/validateAccountRelationships';
export { cleanupAccountRelationships } from './accounts/cleanupAccountRelationships';
export { bulkDeleteAccounts } from './accounts/bulkDeleteAccounts';
export { consolidateDuplicateAccounts } from './accounts/consolidateDuplicateAccounts';
export { activateMyAccount } from './accounts/activateMyAccount';

// Leads Management
export { triggerLeadQualifier } from './leads/triggerLeadQualifier';
export { bulkConvertLeads } from './leads/bulkConvertLeads';
export { bulkDeleteLeads } from './leads/bulkDeleteLeads';
export { setLeadsTenant } from './leads/setLeadsTenant';
export { fixMyAssignedLeads } from './leads/fixMyAssignedLeads';
export { diagnoseLeadVisibility } from './leads/diagnoseLeadVisibility';
export { fixLeadVisibility } from './leads/fixLeadVisibility';

// Contacts Management
export { consolidateDuplicateContacts } from './contacts/consolidateDuplicateContacts';
export { syncContactAssignments } from './contacts/syncContactAssignments';
export { getContactHealth } from './contacts/getContactHealth';

// Data Quality & Validation
export { findDuplicates } from './validation/findDuplicates';
export { checkDuplicateBeforeCreate } from './validation/checkDuplicateBeforeCreate';
export { analyzeDataQuality } from './validation/analyzeDataQuality';
export { validateEntityReferences } from './validation/validateEntityReferences';
export { validateAndImport } from './validation/validateAndImport';
export { backfillUniqueIds } from './validation/backfillUniqueIds';

// Testing & Cleanup
export { cleanupTestRecords } from './testing/cleanupTestRecords';
export { deleteTenantWithData } from './testing/deleteTenantWithData';

// Document Generation
export { generateDocumentationPDF } from './documents/generateDocumentationPDF';
export { generateDesignDocumentPDF } from './documents/generateDesignDocumentPDF';
export { generateUserGuidePDF } from './documents/generateUserGuidePDF';
export { generateAdminGuidePDF } from './documents/generateAdminGuidePDF';
export { createSysAdminDocs } from './documents/createSysAdminDocs';
export { updateGuideContent } from './documents/updateGuideContent';
export { seedDocumentation } from './documents/seedDocumentation';

// Reports & Export
export { exportReportToPDF } from './reports/exportReportToPDF';
export { exportReportToCSV } from './reports/exportReportToCSV';
export { exportReportToPDFSafe } from './reports/exportReportToPDFSafe';
export { getDashboardBundle } from './reports/getDashboardBundle';
export { getDashboardStats } from './reports/getDashboardStats';
export { generateEntitySummary } from './reports/generateEntitySummary';

// Employees
export { getEmployeeUserData } from './employees/getEmployeeUserData';
export { updateEmployeePermissions } from './employees/updateEmployeePermissions';
export { updateEmployeeUserAccess } from './employees/updateEmployeeUserAccess';
export { updateEmployeeSecure } from './employees/updateEmployeeSecure';
export { setEmployeeAccess } from './employees/setEmployeeAccess';
export { saveEmployee } from './employees/saveEmployee';
export { linkEmployeeToCRMUser } from './employees/linkEmployeeToCRMUser';
export { syncEmployeeUserPermissions } from './employees/syncEmployeeUserPermissions';
export { migrateToNewPermissions } from './employees/migrateToNewPermissions';

// Permissions & Access
export { checkMyPermissions } from './permissions/checkMyPermissions';
export { setCashFlowPermission } from './permissions/setCashFlowPermission';
export { diagnoseUserAccess } from './permissions/diagnoseUserAccess';
export { fixManagerAccess } from './permissions/fixManagerAccess';
export { diagnoseDataAccess } from './permissions/diagnoseDataAccess';
export { diagnoseActivityVisibility } from './permissions/diagnoseActivityVisibility';
export { fixMyAccess } from './permissions/fixMyAccess';
export { fixTenantDataForTenant } from './permissions/fixTenantDataForTenant';

// Cash Flow
export { processReceiptForCashFlow } from './cashflow/processReceiptForCashFlow';

// Cron Jobs
export { cronJobRunner } from './cron/cronJobRunner';
export { createInitialCronJobs } from './cron/createInitialCronJobs';
export { resetCronSchedules } from './cron/resetCronSchedules';
export { diagnoseCronSystem } from './cron/diagnoseCronSystem';
export { registerDataMaintenanceJobs } from './cron/registerDataMaintenanceJobs';

// Metrics & Analytics
export { calculateDailyMetrics } from './metrics/calculateDailyMetrics';
export { calculateMonthlyPerformance } from './metrics/calculateMonthlyPerformance';

// Utilities
export { generateUniqueId } from './utils/generateUniqueId';
export { getMyTenantBranding } from './utils/getMyTenantBranding';
export { createAuditLog } from './utils/createAuditLog';
export { checkIntegrationUsage } from './utils/checkIntegrationUsage';
export { getOrCreateUserApiKey } from './utils/getOrCreateUserApiKey';
export { sendSms } from './utils/sendSms';
export { handleCascadeDelete } from './utils/handleCascadeDelete';
export { debugActivityTime } from './utils/debugActivityTime';
export { _tenantUtils } from './utils/_tenantUtils';

// BizDev
export { promoteBizDevSourceToAccount } from './bizdev/promoteBizDevSourceToAccount';
export { bulkDeleteBizDevSources } from './bizdev/bulkDeleteBizDevSources';
export { fetchIndustryMarketData } from './bizdev/fetchIndustryMarketData';
export { agentWebSearch } from './bizdev/agentWebSearch';

// Client Requirements
export { submitClientRequirement } from './clients/submitClientRequirement';
export { approveClientRequirement } from './clients/approveClientRequirement';

// Workflows
export { executeWorkflow } from './workflows/executeWorkflow';

// Middleware (internal)
export { _middleware } from './_middleware';
export { _middlewareExamples } from './_middlewareExamples';
export { exampleUsingMiddleware } from './exampleUsingMiddleware';
