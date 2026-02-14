/**
 * apply-braid-transforms.mjs
 * Run from project root: node scripts/apply-braid-transforms.mjs
 * 
 * Transforms all .braid files:
 * 1. Adds @policy annotations based on registry mapping
 * 2. Replaces generic Err({tag:"APIError",...}) with CRMError.fromHTTP(...)
 * 3. Replaces Err({tag:"NetworkError",...}) with CRMError.network(...)
 * 4. Replaces Err({tag:"NotFound",...}) with CRMError.notFound(...)
 * 5. Replaces domain-specific error patterns with CRMError.fromHTTP(...)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAID_DIR = path.join(__dirname, '..', 'braid-llm-kit', 'examples', 'assistant');

// Policy mapping from TOOL_REGISTRY
const POLICY_MAP = {
  createAccount: 'WRITE_OPERATIONS', updateAccount: 'WRITE_OPERATIONS',
  getAccountDetails: 'READ_ONLY', listAccounts: 'READ_ONLY',
  searchAccounts: 'READ_ONLY', searchAccountsByStatus: 'READ_ONLY',
  deleteAccount: 'WRITE_OPERATIONS',
  createActivity: 'WRITE_OPERATIONS', updateActivity: 'WRITE_OPERATIONS',
  markActivityComplete: 'WRITE_OPERATIONS', getUpcomingActivities: 'READ_ONLY',
  scheduleMeeting: 'WRITE_OPERATIONS', deleteActivity: 'WRITE_OPERATIONS',
  listActivities: 'READ_ONLY', getActivityDetails: 'READ_ONLY',
  searchActivities: 'READ_ONLY',
  createBizDevSource: 'WRITE_OPERATIONS', updateBizDevSource: 'WRITE_OPERATIONS',
  getBizDevSourceDetails: 'READ_ONLY', listBizDevSources: 'READ_ONLY',
  searchBizDevSources: 'READ_ONLY', promoteBizDevSourceToLead: 'WRITE_OPERATIONS',
  deleteBizDevSource: 'WRITE_OPERATIONS', archiveBizDevSources: 'WRITE_OPERATIONS',
  createContact: 'WRITE_OPERATIONS', updateContact: 'WRITE_OPERATIONS',
  listContactsForAccount: 'READ_ONLY', searchContacts: 'READ_ONLY',
  getContactByName: 'READ_ONLY', listAllContacts: 'READ_ONLY',
  searchContactsByStatus: 'READ_ONLY', deleteContact: 'WRITE_OPERATIONS',
  getContactDetails: 'READ_ONLY',
  listDocuments: 'READ_ONLY', getDocumentDetails: 'READ_ONLY',
  createDocument: 'WRITE_OPERATIONS', updateDocument: 'WRITE_OPERATIONS',
  deleteDocument: 'WRITE_OPERATIONS', analyzeDocument: 'READ_ONLY',
  searchDocuments: 'READ_ONLY',
  listEmployees: 'READ_ONLY', getEmployeeDetails: 'READ_ONLY',
  createEmployee: 'WRITE_OPERATIONS', updateEmployee: 'WRITE_OPERATIONS',
  deleteEmployee: 'WRITE_OPERATIONS', searchEmployees: 'READ_ONLY',
  getEmployeeAssignments: 'READ_ONLY',
  createLead: 'WRITE_OPERATIONS', deleteLead: 'WRITE_OPERATIONS',
  qualifyLead: 'WRITE_OPERATIONS', updateLead: 'WRITE_OPERATIONS',
  convertLeadToAccount: 'WRITE_OPERATIONS', listLeads: 'READ_ONLY',
  getLeadDetails: 'READ_ONLY', searchLeads: 'READ_ONLY',
  searchLeadsByStatus: 'READ_ONLY',
  advanceToLead: 'WRITE_OPERATIONS', advanceToQualified: 'WRITE_OPERATIONS',
  advanceToAccount: 'WRITE_OPERATIONS', advanceOpportunityStage: 'WRITE_OPERATIONS',
  fullLifecycleAdvance: 'READ_ONLY',
  navigateTo: 'READ_ONLY', getCurrentPage: 'READ_ONLY',
  createNote: 'WRITE_OPERATIONS', updateNote: 'WRITE_OPERATIONS',
  searchNotes: 'READ_ONLY', getNotesForRecord: 'READ_ONLY',
  getNoteDetails: 'READ_ONLY', deleteNote: 'WRITE_OPERATIONS',
  createOpportunity: 'WRITE_OPERATIONS', deleteOpportunity: 'WRITE_OPERATIONS',
  updateOpportunity: 'WRITE_OPERATIONS', listOpportunitiesByStage: 'READ_ONLY',
  getOpportunityDetails: 'READ_ONLY', searchOpportunities: 'READ_ONLY',
  searchOpportunitiesByStage: 'READ_ONLY', getOpportunityForecast: 'READ_ONLY',
  markOpportunityWon: 'WRITE_OPERATIONS',
  getDashboardBundle: 'READ_ONLY', getHealthSummary: 'READ_ONLY',
  getSalesReport: 'READ_ONLY', getPipelineReport: 'READ_ONLY',
  getActivityReport: 'READ_ONLY', getLeadConversionReport: 'READ_ONLY',
  clearReportCache: 'READ_ONLY',
  getRevenueForecasts: 'READ_ONLY',
  fetchSnapshot: 'READ_ONLY', probe: 'READ_ONLY',
  suggestNextActions: 'READ_ONLY',
  listSuggestions: 'READ_ONLY', getSuggestionDetails: 'READ_ONLY',
  getSuggestionStats: 'READ_ONLY', approveSuggestion: 'WRITE_OPERATIONS',
  rejectSuggestion: 'WRITE_OPERATIONS', applySuggestion: 'WRITE_OPERATIONS',
  triggerSuggestionGeneration: 'WRITE_OPERATIONS',
  initiateCall: 'READ_ONLY', callContact: 'READ_ONLY',
  checkCallingProvider: 'READ_ONLY', getCallingAgents: 'READ_ONLY',
  listUsers: 'READ_ONLY', getUserDetails: 'READ_ONLY',
  getCurrentUserProfile: 'READ_ONLY', getUserProfiles: 'READ_ONLY',
  createUser: 'WRITE_OPERATIONS', updateUser: 'WRITE_OPERATIONS',
  deleteUser: 'WRITE_OPERATIONS', searchUsers: 'READ_ONLY',
  inviteUser: 'READ_ONLY',
  searchWeb: 'READ_ONLY', fetchWebPage: 'READ_ONLY',
  lookupCompanyInfo: 'READ_ONLY',
  triggerWorkflowByName: 'WRITE_OPERATIONS', getWorkflowProgress: 'READ_ONLY',
  listActiveWorkflows: 'READ_ONLY', getWorkflowNotes: 'READ_ONLY',
  listWorkflowTemplates: 'READ_ONLY', getWorkflowTemplate: 'READ_ONLY',
  instantiateWorkflowTemplate: 'READ_ONLY',
};

const DOMAIN_ERROR_OPS = {
  PromotionError: 'promote', QualificationError: 'qualify',
  ConversionError: 'convert', StageUpdateError: 'advance_stage',
  ApprovalError: 'approve', RejectionError: 'reject',
  ApplyError: 'apply', TriggerError: 'trigger',
};

function transformFile(content) {
  let result = content;

  // Remove old error handling comment block
  result = result.replace(
    /\/\/ Error handling note:[\s\S]*?\/\/ - 5xx = NetworkError\n/g, ''
  );

  // 1. Add @policy annotations before fn declarations
  const lines = result.split('\n');
  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (stripped.startsWith('@policy')) continue; // remove existing
    
    const fnMatch = lines[i].match(/^(\s*)fn\s+(\w+)\s*\(/);
    if (fnMatch) {
      const [, indent, fnName] = fnMatch;
      const policy = POLICY_MAP[fnName];
      if (policy) newLines.push(`${indent}@policy(${policy})`);
    }
    newLines.push(lines[i]);
  }
  result = newLines.join('\n');

  // 2. Replace Err({ tag: "APIError", url: X, code: Y, operation: "Z", ... })
  result = result.replace(
    /Err\(\{\s*tag:\s*"APIError",\s*url:\s*(\w+),\s*code:\s*([^,]+?),\s*operation:\s*"([^"]+)"[^}]*\}\)/g,
    'CRMError.fromHTTP($1, $2, "$3")'
  );

  // 2b. Multi-line APIError patterns
  result = result.replace(
    /Err\(\{\s*\n\s*tag:\s*"APIError",\s*\n\s*operation:\s*"([^"]+)",\s*\n[^}]*code:\s*([^\s,\n}]+)\s*\n?\s*\}\)/g,
    'CRMError.fromHTTP(url, $2, "$1")'
  );

  // 3. Replace Err({ tag: "NetworkError", url: X, code: Y })
  result = result.replace(
    /Err\(\{\s*tag:\s*"NetworkError",\s*url:\s*(\w+),\s*code:\s*(\w+(?:\.\w+)?)\s*\}\)/g,
    'CRMError.network($1, $2, "unknown")'
  );
  // NetworkError with extra fields
  result = result.replace(
    /Err\(\{\s*tag:\s*"NetworkError"[^}]*url:\s*(\w+)[^}]*code:\s*(\d+)\s*\}\)/g,
    'CRMError.network($1, $2, "unknown")'
  );

  // 4. Replace Err({ tag: "NotFound", entity: "X", id: Y })
  result = result.replace(
    /Err\(\{\s*tag:\s*"NotFound",\s*entity:\s*"([^"]+)",\s*id:\s*(\w+)\s*\}\)/g,
    'CRMError.notFound("$1", $2, "get")'
  );
  // NotFound with message
  result = result.replace(
    /Err\(\{\s*tag:\s*"NotFound",\s*message:\s*([^}]+)\s*\}\)/g,
    'CRMError.notFound(null, null, $1)'
  );

  // 5. Domain-specific errors with code
  for (const [tag, op] of Object.entries(DOMAIN_ERROR_OPS)) {
    const re = new RegExp(
      `Err\\(\\{\\s*tag:\\s*"${tag}"[^}]*code:\\s*(\\w+(?:\\.\\w+)?)[^}]*\\}\\)`, 'g'
    );
    result = result.replace(re, `CRMError.fromHTTP(url, $1, "${op}")`);
  }

  return result;
}

// Main
const files = fs.readdirSync(BRAID_DIR).filter(f => f.endsWith('.braid'));
let updated = 0;

for (const fname of files.sort()) {
  const fpath = path.join(BRAID_DIR, fname);
  const original = fs.readFileSync(fpath, 'utf8');
  const transformed = transformFile(original);
  if (transformed !== original) {
    fs.writeFileSync(fpath, transformed);
    updated++;
    console.log(`  ✓ ${fname}`);
  } else {
    console.log(`  - ${fname} (no changes)`);
  }
}

console.log(`\n${updated}/${files.length} files updated`);
