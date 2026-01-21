# Agent Roles and Tools

> **Version:** 1.0.0  
> **Last Updated:** January 21, 2026

This document defines which Braid tools each agent role can invoke. Tools not in an agent's allowlist will trigger an escalation to a higher-level agent.

---

## Agent Role Overview

| Role | Display Name | Primary Domain | Escalates To |
|------|--------------|----------------|--------------|
| `ops_manager` | AiSHA (Ops) | Routing, orchestration, governance | Human (critical only) |
| `sales_manager` | Sales Manager | Deals, pipeline, revenue | Ops Manager |
| `client_services_expert` | Client Services Expert | Client research, relationship management | Ops Manager |
| `project_manager` | Project Manager | Scheduling, milestones, activities | Ops Manager |
| `marketing_manager` | Marketing Manager | Campaigns, outreach, content | Ops Manager |
| `customer_service_manager` | CS Manager | Support, complaints, refunds | Ops Manager / Sales Manager |

---

## Tool Allowlists by Agent

### Ops Manager (AiSHA)

The Ops Manager is the router/governor and has access to **all tools** for orchestration purposes.

| Category | Tools |
|----------|-------|
| **All** | `*` (full access for routing and governance) |

---

### Sales Manager

Responsible for deal management, pipeline oversight, and revenue forecasting.

| Category | Tools |
|----------|-------|
| **Opportunities** | `createOpportunity`, `updateOpportunity`, `getOpportunityDetails`, `searchOpportunities`, `searchOpportunitiesByStage`, `listOpportunitiesByStage`, `advanceOpportunityStage`, `markOpportunityWon` |
| **Accounts** | `createAccount`, `updateAccount`, `getAccountDetails`, `searchAccounts`, `searchAccountsByStatus`, `listAccounts` |
| **Leads** | `getLeadDetails`, `searchLeads`, `searchLeadsByStatus`, `listLeads`, `qualifyLead`, `convertLeadToAccount` |
| **Contacts** | `getContactDetails`, `getContactByName`, `searchContacts`, `listContactsForAccount`, `listAllContacts` |
| **Activities** | `createActivity`, `updateActivity`, `getActivityDetails`, `searchActivities`, `listActivities`, `markActivityComplete`, `scheduleMeeting`, `getUpcomingActivities` |
| **Reports** | `getPipelineReport`, `getSalesReport`, `getOpportunityForecast`, `getRevenueForecasts`, `getLeadConversionReport`, `getDashboardBundle` |
| **Notes** | `createNote`, `updateNote`, `getNoteDetails`, `getNotesForRecord`, `searchNotes` |
| **Suggestions** | `getSuggestionDetails`, `getSuggestionStats`, `applySuggestion`, `approveSuggestion`, `rejectSuggestion`, `suggestNextActions` |
| **Lifecycle** | `advanceToLead`, `advanceToQualified`, `advanceToAccount`, `fullLifecycleAdvance` |
| **Navigation** | `navigateTo`, `getCurrentPage` |
| **System** | `fetchSnapshot`, `getHealthSummary`, `probe` |

---

### Client Services Expert

Handles client research, relationship building, and contact enrichment.

| Category | Tools |
|----------|-------|
| **Contacts** | `createContact`, `updateContact`, `getContactDetails`, `getContactByName`, `searchContacts`, `searchContactsByStatus`, `listContactsForAccount`, `listAllContacts` |
| **Accounts** | `getAccountDetails`, `searchAccounts`, `listAccounts` |
| **BizDev Sources** | `createBizDevSource`, `updateBizDevSource`, `getBizDevSourceDetails`, `searchBizDevSources`, `listBizDevSources`, `archiveBizDevSources`, `promoteBizDevSourceToLead` |
| **Research** | `searchWeb`, `fetchWebPage`, `lookupCompanyInfo` |
| **Activities** | `createActivity`, `updateActivity`, `getActivityDetails`, `searchActivities`, `listActivities`, `markActivityComplete`, `getUpcomingActivities` |
| **Notes** | `createNote`, `updateNote`, `getNoteDetails`, `getNotesForRecord`, `searchNotes` |
| **Documents** | `createDocument`, `getDocumentDetails`, `searchDocuments`, `listDocuments`, `analyzeDocument` |
| **Telephony** | `callContact`, `initiateCall`, `checkCallingProvider`, `getCallingAgents` |
| **Suggestions** | `suggestNextActions`, `getSuggestionDetails` |
| **Navigation** | `navigateTo`, `getCurrentPage` |
| **System** | `fetchSnapshot`, `probe` |

---

### Project Manager

Manages scheduling, task tracking, milestones, and workflow orchestration.

| Category | Tools |
|----------|-------|
| **Activities** | `createActivity`, `updateActivity`, `getActivityDetails`, `searchActivities`, `listActivities`, `markActivityComplete`, `scheduleMeeting`, `getUpcomingActivities` |
| **Workflows** | `getWorkflowTemplate`, `listWorkflowTemplates`, `instantiateWorkflowTemplate`, `triggerWorkflowByName`, `listActiveWorkflows`, `getWorkflowProgress`, `getWorkflowNotes` |
| **Notes** | `createNote`, `updateNote`, `getNoteDetails`, `getNotesForRecord`, `searchNotes` |
| **Accounts** | `getAccountDetails`, `searchAccounts`, `listAccounts` |
| **Contacts** | `getContactDetails`, `getContactByName`, `searchContacts`, `listContactsForAccount` |
| **Opportunities** | `getOpportunityDetails`, `searchOpportunities`, `listOpportunitiesByStage` |
| **Reports** | `getActivityReport`, `getDashboardBundle` |
| **Navigation** | `navigateTo`, `getCurrentPage` |
| **System** | `fetchSnapshot`, `getHealthSummary`, `probe` |

---

### Marketing Manager

Handles campaigns, outreach, content, and lead generation.

| Category | Tools |
|----------|-------|
| **Leads** | `createLead`, `updateLead`, `getLeadDetails`, `searchLeads`, `searchLeadsByStatus`, `listLeads` |
| **BizDev Sources** | `createBizDevSource`, `updateBizDevSource`, `getBizDevSourceDetails`, `searchBizDevSources`, `listBizDevSources`, `promoteBizDevSourceToLead` |
| **Contacts** | `createContact`, `updateContact`, `getContactDetails`, `searchContacts`, `listAllContacts` |
| **Activities** | `createActivity`, `updateActivity`, `getActivityDetails`, `searchActivities`, `listActivities`, `markActivityComplete` |
| **Research** | `searchWeb`, `fetchWebPage`, `lookupCompanyInfo` |
| **Notes** | `createNote`, `updateNote`, `getNoteDetails`, `getNotesForRecord`, `searchNotes` |
| **Documents** | `createDocument`, `getDocumentDetails`, `searchDocuments`, `listDocuments` |
| **Reports** | `getLeadConversionReport`, `getDashboardBundle` |
| **Suggestions** | `triggerSuggestionGeneration`, `listSuggestions`, `getSuggestionDetails` |
| **Navigation** | `navigateTo`, `getCurrentPage` |
| **System** | `fetchSnapshot`, `probe` |

---

### Customer Service Manager

Manages support issues, customer complaints, and service-related activities.

| Category | Tools |
|----------|-------|
| **Contacts** | `getContactDetails`, `getContactByName`, `searchContacts`, `updateContact`, `listContactsForAccount` |
| **Accounts** | `getAccountDetails`, `searchAccounts`, `listAccounts`, `updateAccount` |
| **Activities** | `createActivity`, `updateActivity`, `getActivityDetails`, `searchActivities`, `listActivities`, `markActivityComplete`, `getUpcomingActivities` |
| **Notes** | `createNote`, `updateNote`, `getNoteDetails`, `getNotesForRecord`, `searchNotes` |
| **Documents** | `getDocumentDetails`, `searchDocuments`, `listDocuments` |
| **Telephony** | `callContact`, `initiateCall`, `checkCallingProvider` |
| **Suggestions** | `suggestNextActions`, `getSuggestionDetails` |
| **Navigation** | `navigateTo`, `getCurrentPage` |
| **System** | `fetchSnapshot`, `probe` |

---

## Restricted Tools

The following tools require elevated permissions or are restricted to specific roles:

| Tool | Allowed Roles | Notes |
|------|---------------|-------|
| `deleteOpportunity` | `ops_manager` only | Requires approval |
| `deleteAccount` | `ops_manager` only | Requires approval |
| `deleteContact` | `ops_manager` only | Requires approval |
| `deleteLead` | `ops_manager` only | Requires approval |
| `deleteActivity` | `ops_manager`, `project_manager` | |
| `deleteNote` | `ops_manager` only | |
| `deleteDocument` | `ops_manager` only | |
| `deleteBizDevSource` | `ops_manager` only | |
| `createUser` | `ops_manager` only | Admin operation |
| `updateUser` | `ops_manager` only | Admin operation |
| `deleteUser` | `ops_manager` only | Admin operation |
| `inviteUser` | `ops_manager` only | Admin operation |
| `createEmployee` | `ops_manager` only | Admin operation |
| `updateEmployee` | `ops_manager` only | Admin operation |
| `deleteEmployee` | `ops_manager` only | Admin operation |
| `clearReportCache` | `ops_manager` only | System operation |

---

## Escalation Triggers

When an agent attempts to use a tool not in their allowlist:

1. **TOOL_BLOCKED** escalation trigger fires
2. Task is escalated to the agent's supervisor (see hierarchy)
3. Supervisor can either:
   - Execute the tool on behalf of the agent
   - Deny the request with explanation
   - Escalate further if needed

---

## Complete Tool Inventory

All available Braid tools (119 total):

<details>
<summary>Click to expand full tool list</summary>

### Accounts
- `createAccount`, `updateAccount`, `deleteAccount`
- `getAccountDetails`, `searchAccounts`, `searchAccountsByStatus`, `listAccounts`

### Activities
- `createActivity`, `updateActivity`, `deleteActivity`
- `getActivityDetails`, `searchActivities`, `listActivities`
- `markActivityComplete`, `scheduleMeeting`, `getUpcomingActivities`
- `getActivityReport`

### BizDev Sources
- `createBizDevSource`, `updateBizDevSource`, `deleteBizDevSource`
- `getBizDevSourceDetails`, `searchBizDevSources`, `listBizDevSources`
- `archiveBizDevSources`, `promoteBizDevSourceToLead`

### Contacts
- `createContact`, `updateContact`, `deleteContact`
- `getContactDetails`, `getContactByName`, `searchContacts`, `searchContactsByStatus`
- `listContactsForAccount`, `listAllContacts`

### Documents
- `createDocument`, `updateDocument`, `deleteDocument`
- `getDocumentDetails`, `searchDocuments`, `listDocuments`
- `analyzeDocument`

### Employees
- `createEmployee`, `updateEmployee`, `deleteEmployee`
- `getEmployeeDetails`, `searchEmployees`, `listEmployees`
- `getEmployeeAssignments`

### Leads
- `createLead`, `updateLead`, `deleteLead`
- `getLeadDetails`, `searchLeads`, `searchLeadsByStatus`, `listLeads`
- `qualifyLead`, `convertLeadToAccount`

### Lifecycle
- `advanceToLead`, `advanceToQualified`, `advanceToAccount`
- `fullLifecycleAdvance`

### Navigation
- `navigateTo`, `getCurrentPage`

### Notes
- `createNote`, `updateNote`, `deleteNote`
- `getNoteDetails`, `getNotesForRecord`, `searchNotes`

### Opportunities
- `createOpportunity`, `updateOpportunity`, `deleteOpportunity`
- `getOpportunityDetails`, `searchOpportunities`, `searchOpportunitiesByStage`, `listOpportunitiesByStage`
- `advanceOpportunityStage`, `markOpportunityWon`

### Reports
- `getPipelineReport`, `getSalesReport`, `getOpportunityForecast`
- `getRevenueForecasts`, `getLeadConversionReport`, `getDashboardBundle`
- `clearReportCache`

### Suggestions
- `suggestNextActions`, `triggerSuggestionGeneration`
- `getSuggestionDetails`, `getSuggestionStats`, `listSuggestions`
- `applySuggestion`, `approveSuggestion`, `rejectSuggestion`

### System / Snapshot
- `fetchSnapshot`, `getHealthSummary`, `probe`

### Telephony
- `callContact`, `initiateCall`, `checkCallingProvider`, `getCallingAgents`

### Users
- `createUser`, `updateUser`, `deleteUser`
- `getUserDetails`, `searchUsers`, `listUsers`
- `inviteUser`, `getCurrentUserProfile`, `getUserProfiles`

### Web Research
- `searchWeb`, `fetchWebPage`, `lookupCompanyInfo`

### Workflows
- `getWorkflowTemplate`, `listWorkflowTemplates`
- `instantiateWorkflowTemplate`, `triggerWorkflowByName`
- `listActiveWorkflows`, `getWorkflowProgress`, `getWorkflowNotes`

</details>

---

## See Also

- [AGENT_OFFICE_ARCHITECTURE.md](./AGENT_OFFICE_ARCHITECTURE.md) — System architecture
- [shared/contracts/agents.js](../shared/contracts/agents.js) — Agent schema definitions
- [braid-llm-kit/examples/assistant/](../braid-llm-kit/examples/assistant/) — Tool implementations
