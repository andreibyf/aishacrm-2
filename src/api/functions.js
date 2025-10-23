import { base44 } from './base44Client';
import { isLocalDevMode } from './mockData';

// Create a proxy for functions that returns no-op functions in local dev mode
const createFunctionProxy = (functionName) => {
  return (...args) => {
    if (isLocalDevMode()) {
      console.warn(`[Local Dev Mode] Function '${functionName}' called but not available in local dev mode.`);
      return Promise.resolve({ success: false, message: 'Function not available in local dev mode' });
    }
    return base44.functions?.[functionName]?.(...args);
  };
};

// Create a Proxy handler that wraps all function access
const functionsProxy = new Proxy({}, {
  get: (target, prop) => {
    if (isLocalDevMode()) {
      return createFunctionProxy(prop);
    }
    if (base44.functions && base44.functions[prop]) {
      return base44.functions[prop];
    }
    return createFunctionProxy(prop);
  }
});

// Export all functions through the proxy
export const syncDatabase = functionsProxy.syncDatabase;
export const n8nCreateLead = functionsProxy.n8nCreateLead;
export const n8nCreateContact = functionsProxy.n8nCreateContact;
export const n8nGetData = functionsProxy.n8nGetData;
export const processChatCommand = functionsProxy.processChatCommand;

export const makeCall = functionsProxy.makeCall;

export const callStatus = functionsProxy.callStatus;

export const thoughtlyCallResults = functionsProxy.thoughtlyCallResults;

export const thoughtlyTranscripts = functionsProxy.thoughtlyTranscripts;

export const cleanupUserData = functionsProxy.cleanupUserData;

export const updateUserRole = functionsProxy.updateUserRole;

export const createCheckoutSession = functionsProxy.createCheckoutSession;

export const createBillingPortalSession = functionsProxy.createBillingPortalSession;

export const handleStripeWebhook = functionsProxy.handleStripeWebhook;

export const checkBackendStatus = functionsProxy.checkBackendStatus;

export const dispatchWebhook = functionsProxy.dispatchWebhook;

export const n8nUpdateContact = functionsProxy.n8nUpdateContact;

export const runComponentTests = functionsProxy.runComponentTests;

export const tenantGoogleDrive = functionsProxy.tenantGoogleDrive;

export const tenantZapierWebhook = functionsProxy.tenantZapierWebhook;

export const deleteAccount = functionsProxy.deleteAccount;

export const checkDataVolume = functionsProxy.checkDataVolume;

export const archiveAgedData = functionsProxy.archiveAgedData;

export const cleanupTestRecords = functionsProxy.cleanupTestRecords;

export const deleteTenantWithData = functionsProxy.deleteTenantWithData;

export const triggerLeadQualifier = functionsProxy.triggerLeadQualifier;

export const activateMyAccount = functionsProxy.activateMyAccount;

export const minioDocumentManager = functionsProxy.minioDocumentManager;

export const createTenantWithBucket = functionsProxy.createTenantWithBucket;

export const r2DocumentManager = functionsProxy.r2DocumentManager;

export const createTenantWithR2Bucket = functionsProxy.createTenantWithR2Bucket;

export const cleanupOrphanedData = functionsProxy.cleanupOrphanedData;

export const inviteUser = functionsProxy.inviteUser;

export const updateLastLogin = functionsProxy.updateLastLogin;

export const runFullSystemDiagnostics = functionsProxy.runFullSystemDiagnostics;

export const checkR2Config = functionsProxy.checkR2Config;

export const createSysAdminDocs = functionsProxy.createSysAdminDocs;

export const callFluentWebhookV2 = functionsProxy.callFluentWebhookV2;

export const generateDocumentationPDF = functionsProxy.generateDocumentationPDF;

export const tenantOneDrive = functionsProxy.tenantOneDrive;

export const tenantOutlookEmail = functionsProxy.tenantOutlookEmail;

export const tenantOutlookCalendar = functionsProxy.tenantOutlookCalendar;

export const invokeTenantLLM = functionsProxy.invokeTenantLLM;

export const testSystemOpenAI = functionsProxy.testSystemOpenAI;

export const invokeSystemOpenAI = functionsProxy.invokeSystemOpenAI;

export const generateCRMSummary = functionsProxy.generateCRMSummary;

export const generateAIEmailDraft = functionsProxy.generateAIEmailDraft;

export const sendAIEmail = functionsProxy.sendAIEmail;

export const incomingWebhook = functionsProxy.incomingWebhook;

export const bulkConvertLeads = functionsProxy.bulkConvertLeads;

export const generateUniqueId = functionsProxy.generateUniqueId;

export const exportReportToPDF = functionsProxy.exportReportToPDF;

export const exportReportToCSV = functionsProxy.exportReportToCSV;

export const testSuites = functionsProxy.testSuites;

export const updateGuideContent = functionsProxy.updateGuideContent;

export const createActivityWebhook = functionsProxy.createActivityWebhook;

export const generateSignalWireJWT = functionsProxy.generateSignalWireJWT;

export const generateTwilioToken = functionsProxy.generateTwilioToken;

export const checkIntegrationUsage = functionsProxy.checkIntegrationUsage;

export const processScheduledAICalls = functionsProxy.processScheduledAICalls;

export const universalAICall = functionsProxy.universalAICall;

export const createAuditLog = functionsProxy.createAuditLog;

export const generateDailyBriefing = functionsProxy.generateDailyBriefing;

export const generateElevenLabsSpeech = functionsProxy.generateElevenLabsSpeech;

export const elevenLabsCRMWebhook = functionsProxy.elevenLabsCRMWebhook;

export const diagnoseR2Upload = functionsProxy.diagnoseR2Upload;

export const debugUploadPrivateFile = functionsProxy.debugUploadPrivateFile;

export const manualTriggerAICalls = functionsProxy.manualTriggerAICalls;

export const testConnection = functionsProxy.testConnection;

export const setCashFlowPermission = functionsProxy.setCashFlowPermission;

export const checkMyPermissions = functionsProxy.checkMyPermissions;

export const processReceiptForCashFlow = functionsProxy.processReceiptForCashFlow;

export const debugActivityTime = functionsProxy.debugActivityTime;

export const checkScheduledAICalls = functionsProxy.checkScheduledAICalls;

export const cronJobRunner = functionsProxy.cronJobRunner;

export const createInitialCronJobs = functionsProxy.createInitialCronJobs;

export const resetCronSchedules = functionsProxy.resetCronSchedules;

export const testStripeConnection = functionsProxy.testStripeConnection;

export const generateDesignDocumentPDF = functionsProxy.generateDesignDocumentPDF;

export const generateUserGuidePDF = functionsProxy.generateUserGuidePDF;

export const generateAdminGuidePDF = functionsProxy.generateAdminGuidePDF;

export const mcpServer = functionsProxy.mcpServer;

export const getOrCreateUserApiKey = functionsProxy.getOrCreateUserApiKey;

export const validateAccountRelationships = functionsProxy.validateAccountRelationships;

export const cleanupAccountRelationships = functionsProxy.cleanupAccountRelationships;

export const getPerformanceMetrics = functionsProxy.getPerformanceMetrics;

export const generateEntitySummary = functionsProxy.generateEntitySummary;

export const processScheduledAIEmails = functionsProxy.processScheduledAIEmails;

export const mcpHandler = functionsProxy.mcpHandler;

export const mcpToolFinder = functionsProxy.mcpToolFinder;

export const mcpServerSimple = functionsProxy.mcpServerSimple;

export const mcpServerPublic = functionsProxy.mcpServerPublic;

export const mcpServerDebug = functionsProxy.mcpServerDebug;

export const aiToken = functionsProxy.aiToken;

export const aiRun = functionsProxy.aiRun;

export const diagnoseCronSystem = functionsProxy.diagnoseCronSystem;

export const elevenLabsNavigation = functionsProxy.elevenLabsNavigation;

export const generateAIPlan = functionsProxy.generateAIPlan;

export const executeAIPlan = functionsProxy.executeAIPlan;

export const handleVoiceCommand = functionsProxy.handleVoiceCommand;

export const voiceCommand = functionsProxy.voiceCommand;

export const processAICommand = functionsProxy.processAICommand;

export const exportReportToPDFSafe = functionsProxy.exportReportToPDFSafe;

export const getDashboardBundle = functionsProxy.getDashboardBundle;

export const getContactHealth = functionsProxy.getContactHealth;

export const getEmployeeUserData = functionsProxy.getEmployeeUserData;

export const updateEmployeePermissions = functionsProxy.updateEmployeePermissions;

export const getMyTenantBranding = functionsProxy.getMyTenantBranding;

export const updateEmployeeUserAccess = functionsProxy.updateEmployeeUserAccess;

export const requestUserInvite = functionsProxy.requestUserInvite;

export const updateEmployeeSecure = functionsProxy.updateEmployeeSecure;

export const setEmployeeAccess = functionsProxy.setEmployeeAccess;

export const transcribeAudio = functionsProxy.transcribeAudio;

export const performanceTestSuites = functionsProxy.performanceTestSuites;

export const _tenantUtils = functionsProxy._tenantUtils;

export const listPerformanceLogs = functionsProxy.listPerformanceLogs;

export const bulkDeleteLeads = functionsProxy.bulkDeleteLeads;

export const setLeadsTenant = functionsProxy.setLeadsTenant;

export const setUserTenant = functionsProxy.setUserTenant;

export const fixMyAssignedLeads = functionsProxy.fixMyAssignedLeads;

export const fixMyAccess = functionsProxy.fixMyAccess;

export const fixTenantDataForTenant = functionsProxy.fixTenantDataForTenant;

export const sendSms = functionsProxy.sendSms;

export const userExistsByEmail = functionsProxy.userExistsByEmail;

export const findDuplicates = functionsProxy.findDuplicates;

export const checkDuplicateBeforeCreate = functionsProxy.checkDuplicateBeforeCreate;

export const getDashboardStats = functionsProxy.getDashboardStats;

export const bulkDeleteAccounts = functionsProxy.bulkDeleteAccounts;

export const consolidateDuplicateAccounts = functionsProxy.consolidateDuplicateAccounts;

export const backfillUniqueIds = functionsProxy.backfillUniqueIds;

export const analyzeDataQuality = functionsProxy.analyzeDataQuality;

export const validateEntityReferences = functionsProxy.validateEntityReferences;

export const handleCascadeDelete = functionsProxy.handleCascadeDelete;

export const detectOrphanedRecords = functionsProxy.detectOrphanedRecords;

export const syncDenormalizedFields = functionsProxy.syncDenormalizedFields;

export const cronDenormalizationSync = functionsProxy.cronDenormalizationSync;

export const cronOrphanCleanup = functionsProxy.cronOrphanCleanup;

export const registerDataMaintenanceJobs = functionsProxy.registerDataMaintenanceJobs;

export const trackEntityChange = functionsProxy.trackEntityChange;

export const getEntityAtDate = functionsProxy.getEntityAtDate;

export const calculateDailyMetrics = functionsProxy.calculateDailyMetrics;

export const calculateMonthlyPerformance = functionsProxy.calculateMonthlyPerformance;

export const archiveOldData = functionsProxy.archiveOldData;

export const cronSyncDenormalizedFields = functionsProxy.cronSyncDenormalizedFields;

export const validateAndImport = functionsProxy.validateAndImport;

export const consolidateDuplicateContacts = functionsProxy.consolidateDuplicateContacts;

export const listTenantUsers = functionsProxy.listTenantUsers;

export const migrateToNewPermissions = functionsProxy.migrateToNewPermissions;

export const syncContactAssignments = functionsProxy.syncContactAssignments;

export const saveEmployee = functionsProxy.saveEmployee;

export const linkEmployeeToCRMUser = functionsProxy.linkEmployeeToCRMUser;

export const syncEmployeeUserPermissions = functionsProxy.syncEmployeeUserPermissions;

export const checkUserRecord = functionsProxy.checkUserRecord;

export const diagnoseLeadVisibility = functionsProxy.diagnoseLeadVisibility;

export const fixLeadVisibility = functionsProxy.fixLeadVisibility;

export const promoteBizDevSourceToAccount = functionsProxy.promoteBizDevSourceToAccount;

export const archiveBizDevSourcesToR2 = functionsProxy.archiveBizDevSourcesToR2;

export const retrieveArchiveFromR2 = functionsProxy.retrieveArchiveFromR2;

export const bulkDeleteBizDevSources = functionsProxy.bulkDeleteBizDevSources;

export const fetchIndustryMarketData = functionsProxy.fetchIndustryMarketData;

export const agentWebSearch = functionsProxy.agentWebSearch;

export const diagnoseUserAccess = functionsProxy.diagnoseUserAccess;

export const fixManagerAccess = functionsProxy.fixManagerAccess;

export const diagnoseDataAccess = functionsProxy.diagnoseDataAccess;

export const diagnoseActivityVisibility = functionsProxy.diagnoseActivityVisibility;

export const seedDocumentation = functionsProxy.seedDocumentation;

export const submitClientRequirement = functionsProxy.submitClientRequirement;

export const approveClientRequirement = functionsProxy.approveClientRequirement;

export const elevenLabsCRMAccess = functionsProxy.elevenLabsCRMAccess;

export const executeWorkflow = functionsProxy.executeWorkflow;

