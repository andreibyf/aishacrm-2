import { base44 } from './base44Client';
import { isLocalDevMode } from './mockData';

// Optional direct MCP server URL (useful for connecting your own MCP instance)
const MCP_SERVER_URL = import.meta.env.VITE_MCP_SERVER_URL || null;

const callMCPServerDirect = async (payload) => {
  if (!MCP_SERVER_URL) {
    throw new Error('MCP server URL not configured (VITE_MCP_SERVER_URL)');
  }
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP server request failed: ${response.status} ${response.statusText} - ${text}`);
  }
  return response.json();
};

// Create a proxy for functions that returns no-op functions in local dev mode
const createFunctionProxy = (functionName) => {
  // Provide local fallbacks for functions used by Settings checks and CRUD operations
  // so the UI works in standalone mode without backend/cloud-functions running.
  return async (...args) => {
    if (isLocalDevMode()) {
      // ========================================
      // CRUD Operations
      // ========================================
      
      // Local fallback for saving employees (used by EmployeeForm)
      if (functionName === 'saveEmployee') {
        try {
          const payload = args[0] || {};
          const { employeeId, employeeData, tenantId } = payload;
          const key = `local_employees_${tenantId || 'local-tenant-001'}`;
          const raw = localStorage.getItem(key);
          const list = raw ? JSON.parse(raw) : [];

          if (employeeId) {
            // Update existing
            const idx = list.findIndex((e) => e.id === employeeId);
            if (idx === -1) {
              return { data: { success: false, error: 'Employee not found' } };
            }
            const updated = { ...list[idx], ...employeeData, updated_at: new Date().toISOString() };
            list[idx] = updated;
            localStorage.setItem(key, JSON.stringify(list));
            return { data: { success: true, employee: updated } };
          }

          // Create new
          const newEmployee = {
            id: `local-emp-${Date.now()}`,
            ...employeeData,
            tenant_id: tenantId || 'local-tenant-001',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          list.push(newEmployee);
          localStorage.setItem(key, JSON.stringify(list));
          return { data: { success: true, employee: newEmployee } };
        } catch (err) {
          console.warn(`[Local Dev Mode] saveEmployee fallback failed: ${err?.message || err}`);
          return { data: { success: false, error: err?.message || String(err) } };
        }
      }

      // ========================================
      // Health Checks & Status Functions
      // ========================================
      
      if (functionName === 'checkBackendStatus') {
        console.log('[Local Dev Mode] checkBackendStatus: returning mock healthy status');
        return { 
          data: { 
            success: true, 
            status: 'healthy', 
            message: 'Backend running in local-dev mode',
            timestamp: new Date().toISOString(),
            version: '1.0.0-local'
          } 
        };
      }

      if (functionName === 'checkR2Config') {
        console.log('[Local Dev Mode] checkR2Config: returning mock config status');
        return {
          data: {
            current_env_status: {
              CLOUDFLARE_ACCOUNT_ID: 'SET',
              CLOUDFLARE_R2_ACCESS_KEY_ID: 'SET',
              CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'SET',
              CLOUDFLARE_R2_BUCKET_NAME: 'SET',
            },
            message: 'R2 configuration check (local-dev mock)',
            configured: true
          }
        };
      }

      if (functionName === 'testStripeConnection') {
        console.log('[Local Dev Mode] testStripeConnection: returning mock success');
        return {
          data: {
            success: true,
            message: 'Stripe connection test (local-dev mock)',
            connected: true
          }
        };
      }

      if (functionName === 'testSystemOpenAI') {
        console.log('[Local Dev Mode] testSystemOpenAI: returning mock success');
        return {
          data: {
            success: true,
            message: 'OpenAI API test (local-dev mock)',
            response: 'Hello from mock OpenAI!',
            model: 'gpt-4'
          }
        };
      }

      // ========================================
      // Test & Diagnostic Functions
      // ========================================
      
      if (functionName === 'runComponentTests') {
        const { testNames } = args[0] || {};
        console.log('[Local Dev Mode] runComponentTests: returning mock test results for', testNames);
        return {
          data: {
            status: 'success',
            summary: `All tests passed (local-dev mock)`,
            reports: (testNames || ['default']).map(name => ({
              test: name,
              status: 'success',
              message: 'Test passed in local-dev mode',
              timestamp: new Date().toISOString()
            }))
          }
        };
      }

      if (functionName === 'testSuites') {
        console.log('[Local Dev Mode] testSuites: returning mock test suites');
        return {
          data: {
            suites: [
              { id: 'auth', name: 'Authentication Tests', description: 'Test user auth flows' },
              { id: 'crud', name: 'CRUD Operations', description: 'Test create/read/update/delete' },
              { id: 'integration', name: 'Integration Tests', description: 'Test external APIs' },
            ]
          }
        };
      }

      if (functionName === 'checkUserRecord') {
        const { userId } = args[0] || {};
        console.log('[Local Dev Mode] checkUserRecord: returning mock diagnostic for', userId);
        return {
          data: {
            success: true,
            user: {
              id: userId || 'local-user-001',
              email: 'dev@localhost',
              status: 'active',
              permissions: ['all']
            },
            message: 'User record check (local-dev mock)'
          }
        };
      }

      if (functionName === 'diagnoseLeadVisibility') {
        const { leadId } = args[0] || {};
        console.log('[Local Dev Mode] diagnoseLeadVisibility: returning mock diagnostic for', leadId);
        return {
          data: {
            success: true,
            lead: {
              id: leadId || 'local-lead-001',
              visible: true,
              assignedTo: 'local-user-001',
              issues: []
            },
            message: 'Lead visibility check (local-dev mock)'
          }
        };
      }

      if (functionName === 'fixLeadVisibility') {
        const { leadId } = args[0] || {};
        console.log('[Local Dev Mode] fixLeadVisibility: returning mock fix result for', leadId);
        return {
          data: {
            success: true,
            message: `Lead ${leadId} visibility fixed (local-dev mock)`,
            fixed: true
          }
        };
      }

      // ========================================
      // Performance & Monitoring
      // ========================================
      
      if (functionName === 'listPerformanceLogs') {
        console.log('[Local Dev Mode] listPerformanceLogs: returning mock performance data');
        return {
          data: {
            logs: [
              { timestamp: new Date().toISOString(), operation: 'query', duration: 45, status: 'success' },
              { timestamp: new Date(Date.now() - 60000).toISOString(), operation: 'mutation', duration: 120, status: 'success' },
            ],
            count: 2
          }
        };
      }

      // ========================================
      // Data Management Functions
      // ========================================
      
      if (functionName === 'cleanupTestRecords') {
        console.log('[Local Dev Mode] cleanupTestRecords: returning mock cleanup result');
        return {
          data: {
            success: true,
            message: 'Test records cleanup (local-dev mock)',
            deleted: 0
          }
        };
      }

      if (functionName === 'cleanupOrphanedData') {
        console.log('[Local Dev Mode] cleanupOrphanedData: returning mock cleanup result');
        return {
          data: {
            success: true,
            message: 'Orphaned data cleanup (local-dev mock)',
            deleted: 0
          }
        };
      }

      if (functionName === 'detectOrphanedRecords') {
        console.log('[Local Dev Mode] detectOrphanedRecords: returning mock detection result');
        return {
          data: {
            success: true,
            orphaned: [],
            message: 'No orphaned records found (local-dev mock)'
          }
        };
      }

      if (functionName === 'syncDenormalizedFields') {
        console.log('[Local Dev Mode] syncDenormalizedFields: returning mock sync result');
        return {
          data: {
            success: true,
            message: 'Denormalized fields synced (local-dev mock)',
            synced: 0
          }
        };
      }

      if (functionName === 'checkDataVolume') {
        console.log('[Local Dev Mode] checkDataVolume: returning mock volume data');
        return {
          data: {
            success: true,
            volumes: {
              contacts: 0,
              leads: 0,
              accounts: 0,
              activities: 0
            },
            total: 0
          }
        };
      }

      if (functionName === 'archiveAgedData') {
        console.log('[Local Dev Mode] archiveAgedData: returning mock archive result');
        return {
          data: {
            success: true,
            message: 'Aged data archived (local-dev mock)',
            archived: 0
          }
        };
      }

      // ========================================
      // User & Tenant Management
      // ========================================
      
      if (functionName === 'inviteUser') {
        const { email } = args[0] || {};
        console.log('[Local Dev Mode] inviteUser: returning mock invite result for', email);
        return {
          data: {
            success: true,
            message: `User invitation sent to ${email} (local-dev mock)`,
            inviteId: `local-invite-${Date.now()}`
          }
        };
      }

      if (functionName === 'cleanupUserData') {
        console.log('[Local Dev Mode] cleanupUserData: returning mock cleanup result');
        return {
          data: {
            success: true,
            message: 'User data cleaned up (local-dev mock)',
            cleaned: 0
          }
        };
      }

      if (functionName === 'updateEmployeeSecure') {
        const { employeeId, updates } = args[0] || {};
        console.log('[Local Dev Mode] updateEmployeeSecure: returning mock update result for', employeeId);
        return {
          data: {
            success: true,
            message: 'Employee updated (local-dev mock)',
            employee: { id: employeeId, ...updates }
          }
        };
      }

      if (functionName === 'updateEmployeeUserAccess') {
        const { employeeId, access } = args[0] || {};
        console.log('[Local Dev Mode] updateEmployeeUserAccess: returning mock access update for', employeeId);
        return {
          data: {
            success: true,
            message: 'Employee access updated (local-dev mock)',
            access
          }
        };
      }

      if (functionName === 'deleteTenantWithData') {
        const { tenantId } = args[0] || {};
        console.log('[Local Dev Mode] deleteTenantWithData: returning mock delete result for', tenantId);
        return {
          data: {
            success: true,
            message: `Tenant ${tenantId} deleted (local-dev mock)`,
            deleted: true
          }
        };
      }

      // ========================================
      // Integration & Documentation
      // ========================================
      
      if (functionName === 'seedDocumentation') {
        console.log('[Local Dev Mode] seedDocumentation: returning mock seed result');
        return {
          data: {
            success: true,
            message: 'Documentation seeded (local-dev mock)',
            seeded: 0
          }
        };
      }

      if (functionName === 'mcpServerPublic') {
        console.log('[Local Dev Mode] mcpServerPublic: returning mock MCP server status');
        return {
          data: {
            success: true,
            status: 'running',
            message: 'MCP server status (local-dev mock)'
          }
        };
      }

      // ========================================
      // Billing
      // ========================================
      
      if (functionName === 'createCheckoutSession') {
        console.log('[Local Dev Mode] createCheckoutSession: returning mock checkout URL');
        return {
          data: {
            success: true,
            url: 'https://checkout.local-dev.mock',
            sessionId: `local-session-${Date.now()}`
          }
        };
      }

      if (functionName === 'createBillingPortalSession') {
        console.log('[Local Dev Mode] createBillingPortalSession: returning mock portal URL');
        return {
          data: {
            success: true,
            url: 'https://billing.local-dev.mock',
            sessionId: `local-portal-${Date.now()}`
          }
        };
      }

      // ========================================
      // Cron Jobs
      // ========================================
      
      if (functionName === 'createInitialCronJobs') {
        console.log('[Local Dev Mode] createInitialCronJobs: returning mock cron init result');
        return {
          data: {
            success: true,
            message: 'Cron jobs initialized (local-dev mock)',
            jobs: []
          }
        };
      }

      // Default behavior for other functions in local dev mode: warn + no-op
      console.warn(`[Local Dev Mode] Function '${functionName}' called but not available in local dev mode.`);
      return Promise.resolve({ data: { success: false, message: 'Function not available in local dev mode' } });
    }

    // Not local-dev: call the real function if present on base44.functions
    return base44.functions?.[functionName]?.(...args);
  };
};

// Create a Proxy handler that wraps all function access
const functionsProxy = new Proxy({}, {
  get: (target, prop) => {
    // Local dev mode: always use function proxy (mock/no-op implementations)
    if (isLocalDevMode()) {
      return createFunctionProxy(prop);
    }

    // If Base44 provides the function, use it
    if (base44.functions && base44.functions[prop]) {
      return base44.functions[prop];
    }

    // If a direct MCP server URL is configured, allow direct JSON-RPC calls
    // for MCP-related function names (mcpServer*, mcpHandler, etc.)
    if (MCP_SERVER_URL && (String(prop).startsWith('mcpServer') || String(prop).startsWith('mcpHandler') || String(prop).startsWith('mcpTool'))) {
      return async (...args) => {
        try {
          const payload = args[0] || {};
          const result = await callMCPServerDirect(payload);
          // Return in the codebase's expected shape: { data: <json-rpc-response> }
          return { data: result };
        } catch (err) {
          // Mirror behavior of other functions on error
          console.error(`[MCP Direct] Error calling MCP server for ${String(prop)}:`, err);
          throw err;
        }
      };
    }

    // Fallback: return the local dev proxy (no-op) if function not present
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

