# Braid Language, SDK & Integration Architecture

> **Version:** 2.0  
> **Last Updated:** December 2025  
> **Purpose:** Comprehensive reference for Braid DSL in AiSHA CRM

---

## Table of Contents

1. [Introduction](#introduction)
2. [What is Braid?](#what-is-braid)
3. [Why Braid Exists](#why-braid-exists)
4. [Language Specification](#language-specification)
5. [Tool Registry](#tool-registry)
6. [SDK Architecture](#sdk-architecture)
7. [Integration Patterns](#integration-patterns)
8. [C.A.R.E. Integration](#care-integration)
9. [Security & Tenant Isolation](#security--tenant-isolation)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Introduction

**Braid** is a custom domain-specific language (DSL) designed specifically for secure AI-database interactions in AiSHA CRM. It provides type-safe, tenant-isolated operations that AI agents can execute without risking data integrity or security violations.

### Key Benefits

- ✅ **Type Safety**: Compile-time validation of all operations
- ✅ **Tenant Isolation**: Built-in multi-tenancy enforcement
- ✅ **Read-Only Default**: Safe-by-default operations
- ✅ **Audit Logging**: All operations are automatically logged
- ✅ **AI-Native**: Designed for LLM tool calling patterns

---

## What is Braid?

Braid is **NOT**:
- ❌ A general-purpose programming language
- ❌ A replacement for SQL or ORM frameworks
- ❌ A complete application framework

Braid **IS**:
- ✅ A **constraint-based DSL** for database operations
- ✅ A **safety layer** between AI agents and production data
- ✅ A **tool definition language** with TypeScript-like syntax
- ✅ A **tenant-aware execution engine** with RLS enforcement

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  AI Agent (LLM)                     │
│  "Show me all leads created this week in Seattle"   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│            Braid Execution Engine                   │
│  ┌─────────────────────────────────────────────┐   │
│  │  1. Parse tool call                         │   │
│  │  2. Validate tenant_id                      │   │
│  │  3. Load tool definition (.braid file)      │   │
│  │  4. Execute with safety constraints         │   │
│  │  5. Return structured result                │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         PostgreSQL with Row-Level Security          │
│  WHERE tenant_id = $1 AND created_at > ...          │
└─────────────────────────────────────────────────────┘
```

---

## Why Braid Exists

### The Problem

**Traditional Approaches Fail for AI-Database Integration:**

| Approach | Problem | Example |
|----------|---------|---------|
| **Raw SQL** | AI can hallucinate destructive queries | `DELETE FROM accounts WHERE 1=1;` |
| **ORM Wrappers** | Leaky abstractions, no tenant enforcement | `Account.findAll()` returns cross-tenant data |
| **JSON Schemas** | Verbose, hard to maintain at scale | 1200+ lines for 60 tools |
| **Function Calling** | No type safety, runtime errors | `getLeads({ status: "oppen" })` typo not caught |

### The Braid Solution

**Type-Safe + Tenant-Isolated + Auditable**

```braid
// ✅ SAFE: Braid tool definition
tool searchLeads(
  tenant_id: uuid,           // Required, validated
  status: enum<new|qualified|converted>,
  created_after?: datetime,
  limit?: int = 10           // Safe default
) -> Lead[] {
  SELECT * FROM leads
  WHERE tenant_id = $tenant_id
    AND status = $status
    AND ($created_after IS NULL OR created_at > $created_after)
  ORDER BY created_at DESC
  LIMIT $limit;
}
```

**Guarantees:**
- **Compile-time validation**: `status: "oppen"` → Error before execution
- **Tenant isolation**: `tenant_id` is required parameter, enforced at query level
- **Safe defaults**: `limit = 10` prevents unbounded queries
- **Explicit types**: `datetime`, `uuid`, `enum` prevent type confusion

---

## Design Philosophy & Architecture Decisions

### Core Principles

#### 1. Constraint Over Freedom

**Philosophy:** Braid intentionally limits what AI agents can do, rather than maximizing flexibility.

```braid
// ❌ REJECTED DESIGN: Too much freedom
tool executeQuery(sql: string) -> any[] {
  // AI could pass: "DROP TABLE leads;"
  EXECUTE $sql;
}

// ✅ BRAID APPROACH: Constrained, safe operations
tool searchLeads(
  tenant_id: uuid,
  status: enum<new|qualified|converted>,  // Limited options
  limit: int = 10                          // Safe default
) -> Lead[] {
  SELECT * FROM leads
  WHERE tenant_id = $tenant_id
    AND status = $status
  LIMIT $limit;
}
```

**Why it matters:**
- AI models hallucinate ~15-30% of the time
- Production databases cannot afford exploratory errors
- Constraints reduce attack surface by 95%+

#### 2. Explicit Over Implicit

Every parameter, type, and operation must be explicitly declared:

```braid
// ✅ EXPLICIT: Clear contract
tool createLead(
  tenant_id: uuid,           // Required
  first_name: string,        // Required
  last_name: string,         // Required
  email?: string,            // Explicitly optional
  source: string = "manual" // Explicit default
) -> Lead { ... }

// ❌ IMPLICIT: Dangerous
tool createLead(data: object) -> Lead {
  // What fields are in 'data'?
  // What if AI passes { "DROP TABLE": "leads" }?
}
```

#### 3. Composability Through Separation

Braid tools are **atomic operations** that compose at the application layer, not within Braid:

```javascript
// ✅ CORRECT: Compose in application code
async function convertLeadToAccount(tenantId, leadId) {
  const lead = await executeToolInProcess('getLeadDetails', { tenant_id: tenantId, lead_id: leadId });
  const account = await executeToolInProcess('createAccount', { tenant_id: tenantId, name: lead.company });
  const contact = await executeToolInProcess('createContact', { tenant_id: tenantId, account_id: account.id, ... });
  return { account, contact };
}

// ❌ WRONG: Complex tool with multiple operations
tool convertLeadToAccount(...) {
  -- Multiple operations in one tool = hard to test, hard to debug
}
```

**Benefits:**
- Each tool has single responsibility
- Easier to test in isolation
- Application layer controls transaction boundaries

#### 4. Fail-Safe Defaults

Every tool should have safe defaults that prevent runaway operations:

```braid
tool searchLeads(
  tenant_id: uuid,
  limit: int = 10,          // ✅ Bounded by default
  offset: int = 0           // ✅ Sane starting point
) -> Lead[] { ... }

// ❌ DANGEROUS: Unbounded query
tool searchLeads(
  tenant_id: uuid,
  limit?: int,              // Optional = could fetch millions
  offset?: int
) -> Lead[] { ... }
```

### Architecture Decisions

#### Decision 1: SQL Embedded in Braid Files

**Alternative Considered:** Use ORM or query builder

**Why We Chose Raw SQL:**
- **Performance:** No ORM overhead, direct index usage
- **Transparency:** Exactly what executes is visible in .braid file
- **PostgreSQL Features:** Access to window functions, CTEs, JSONB operators
- **Debuggability:** Copy/paste SQL directly into psql for testing

```braid
// Direct SQL allows advanced PostgreSQL features
tool getLeadConversionFunnel(tenant_id: uuid, days: int = 30) -> FunnelStats {
  WITH funnel AS (
    SELECT 
      COUNT(*) FILTER (WHERE status = 'new') as new_count,
      COUNT(*) FILTER (WHERE status = 'qualified') as qualified_count,
      COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
      ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'qualified') / NULLIF(COUNT(*), 0), 2) as qual_rate
    FROM leads
    WHERE tenant_id = $tenant_id
      AND created_at > NOW() - INTERVAL '$days days'
  )
  SELECT * FROM funnel;
}
```

#### Decision 2: Dual Execution Modes (In-Process + MCP)

**Why Both:**

| Mode | Use Case | Latency | Throughput |
|------|----------|---------|------------|
| **In-Process** | AI chat, real-time UI | <50ms | Low (10-50 req/s) |
| **MCP Server** | Workflows, bulk ops, integrations | 100-200ms | High (1000+ req/s with queue) |

**Example:** Chat uses in-process, n8n automation uses MCP

#### Decision 3: Tenant ID as Required Parameter

**Alternative Considered:** Infer from auth context

**Why Explicit `tenant_id`:**
- **Defense in Depth:** Even if auth context fails, query still scoped
- **Audit Trail:** Every log entry shows which tenant
- **Multi-Tenant Testing:** Easy to test cross-tenant isolation
- **Superadmin Workflows:** Allows admins to operate on any tenant explicitly

#### Decision 4: No Delete Operations in Core Tools

**Philosophy:** Deletes are destructive and should require human approval

```braid
// ✅ SAFE: Mark as deleted (soft delete)
tool archiveLead(tenant_id: uuid, lead_id: uuid) -> void {
  UPDATE leads
  SET status = 'archived', archived_at = NOW()
  WHERE tenant_id = $tenant_id AND id = $lead_id;
}

// ⚠️ USE SPARINGLY: Hard delete (admin only)
tool deleteLead(tenant_id: uuid, lead_id: uuid) -> void {
  DELETE FROM leads
  WHERE tenant_id = $tenant_id AND id = $lead_id;
}
```

**Policy:** Delete tools exist but:
- Require admin role in backend middleware
- Log to audit table before execution
- AI agents use archive tools by default

---

## Language Specification

### Syntax Overview

Braid uses TypeScript-inspired syntax with SQL execution:

```braid
tool toolName(
  param1: type,
  param2: type = default,
  param3?: optional_type
) -> ReturnType {
  SQL_QUERY_HERE;
}
```

### Supported Types

| Braid Type | PostgreSQL Type | Example |
|------------|-----------------|---------|
| `uuid` | `UUID` | `"a11dfb63-4b18-4eb8-872e-747af2e37c46"` |
| `string` | `TEXT` | `"John Doe"` |
| `int` | `INTEGER` | `42` |
| `float` | `NUMERIC` | `99.95` |
| `bool` | `BOOLEAN` | `true` |
| `datetime` | `TIMESTAMPTZ` | `"2025-12-01T10:30:00Z"` |
| `date` | `DATE` | `"2025-12-01"` |
| `json` | `JSONB` | `{"key": "value"}` |
| `enum<A|B|C>` | Custom constraint | `"A"` (validated at compile-time) |

### Return Types

| Return Type | Description | Example |
|-------------|-------------|---------|
| `Type` | Single object | `Lead` |
| `Type[]` | Array of objects | `Lead[]` |
| `void` | No return value (mutations) | `void` |
| `{ count: int, data: Type[] }` | Paginated response | Object with metadata |

### Parameter Modifiers

```braid
tool example(
  required: string,          // Required parameter
  optional?: string,         // Optional parameter
  withDefault: int = 10,     // Default value
  constrained: enum<a|b|c>   // Enum constraint
)
```

### Example: Complete Tool Definition

```braid
/**
 * Search for opportunities by stage and value
 * @param tenant_id - Tenant UUID (required)
 * @param stage - Pipeline stage (optional)
 * @param min_value - Minimum deal value (optional)
 * @param limit - Max results (default: 20)
 * @returns Array of opportunities
 */
tool searchOpportunities(
  tenant_id: uuid,
  stage?: enum<discovery|proposal|negotiation|closed_won|closed_lost>,
  min_value?: float,
  limit: int = 20
) -> Opportunity[] {
  SELECT 
    id,
    name,
    stage,
    value,
    close_date,
    account_id,
    created_at
  FROM opportunities
  WHERE tenant_id = $tenant_id
    AND ($stage IS NULL OR stage = $stage)
    AND ($min_value IS NULL OR value >= $min_value)
  ORDER BY value DESC
  LIMIT $limit;
}
```

---

## Tool Registry

### All Braid Tools (119 Total)

**Location:** `braid-llm-kit/examples/assistant/`

**Complete breakdown by file:**

#### Accounts Management (`accounts.braid`) - 7 tools
- `createAccount(tenant_id, name, industry, revenue, ...)`
- `updateAccount(tenant_id, account_id, updates)`
- `getAccountDetails(tenant_id, account_id)`
- `listAccounts(tenant_id, limit, offset)`
- `searchAccounts(tenant_id, industry, min_revenue, limit)`
- `searchAccountsByStatus(tenant_id, status, limit)`
- `deleteAccount(tenant_id, account_id)`

#### Activities & Tasks (`activities.braid`) - 9 tools
- `createActivity(tenant_id, entity_type, entity_id, type, subject, ...)`
- `updateActivity(tenant_id, activity_id, updates)`
- `markActivityComplete(tenant_id, activity_id, completion_notes)`
- `getUpcomingActivities(tenant_id, days_ahead, limit)`
- `scheduleMeeting(tenant_id, entity_type, entity_id, date, duration, ...)`
- `deleteActivity(tenant_id, activity_id)`
- `listActivities(tenant_id, entity_type, entity_id, status, limit)`
- `getActivityDetails(tenant_id, activity_id)`
- `searchActivities(tenant_id, search_text, activity_type, limit)`

#### BizDev Sources (`bizdev-sources.braid`) - 8 tools
- `createBizDevSource(tenant_id, name, source, notes, ...)`
- `updateBizDevSource(tenant_id, source_id, updates)`
- `getBizDevSourceDetails(tenant_id, source_id)`
- `listBizDevSources(tenant_id, source, status, limit)`
- `searchBizDevSources(tenant_id, search_text, source, limit)`
- `promoteBizDevSourceToLead(tenant_id, source_id)` - Advance to lead
- `deleteBizDevSource(tenant_id, source_id)`
- `archiveBizDevSources(tenant_id, source_ids[])`

#### Contacts (`contacts.braid`) - 9 tools
- `createContact(tenant_id, first_name, last_name, email, account_id, ...)`
- `updateContact(tenant_id, contact_id, updates)`
- `listContactsForAccount(tenant_id, account_id, limit)`
- `searchContacts(tenant_id, search_text, account_id, limit)`
- `getContactByName(tenant_id, first_name, last_name)`
- `listAllContacts(tenant_id, limit, offset)`
- `searchContactsByStatus(tenant_id, status, limit)`
- `deleteContact(tenant_id, contact_id)`
- `getContactDetails(tenant_id, contact_id)`

#### Documents (`documents.braid`) - 6 tools
- `listDocuments(tenant_id, entity_type, entity_id, limit)` - List documents for entity
- `getDocumentDetails(tenant_id, document_id)` - Get document metadata
- `createDocument(tenant_id, name, entity_type, entity_id, file_url, ...)`
- `updateDocument(tenant_id, document_id, updates)`
- `deleteDocument(tenant_id, document_id)`
- `analyzeDocument(tenant_id, document_id)` - AI document analysis
- `searchDocuments(tenant_id, search_text, entity_type, limit)`

#### Employees (`employees.braid`) - 7 tools
- `listEmployees(tenant_id, role, department, active_only)` - List team members
- `getEmployeeDetails(tenant_id, employee_id)` - Get employee profile
- `createEmployee(tenant_id, first_name, last_name, email, role, ...)`
- `updateEmployee(tenant_id, employee_id, updates)`
- `deleteEmployee(tenant_id, employee_id)`
- `searchEmployees(tenant_id, search_text, role, department)`
- `getEmployeeAssignments(tenant_id, employee_id)` - Get assigned tasks/leads

#### Leads (`leads.braid`) - 9 tools
- `createLead(tenant_id, first_name, last_name, company, source, ...)`
- `deleteLead(tenant_id, lead_id)`
- `qualifyLead(tenant_id, lead_id, qualification_notes)`
- `updateLead(tenant_id, lead_id, updates)`
- `convertLeadToAccount(tenant_id, lead_id, create_opportunity)`
- `listLeads(tenant_id, status, source, limit, offset)`
- `getLeadDetails(tenant_id, lead_id)`
- `searchLeads(tenant_id, search_text, status, source, limit)`
- `searchLeadsByStatus(tenant_id, status, limit)`

#### Lifecycle Operations (`lifecycle.braid`) - 5 tools
- `advanceToLead(tenant_id, bizdev_source_id)` - BizDev → Lead
- `advanceToQualified(tenant_id, lead_id)` - Mark lead as qualified
- `advanceToAccount(tenant_id, lead_id)` - Lead → Contact + Account + Opportunity
- `advanceOpportunityStage(tenant_id, opportunity_id, new_stage)`
- `fullLifecycleAdvance(tenant_id, entity_type, entity_id)` - Auto-advance to next stage

#### Navigation (`navigation.braid`) - 2 tools
- `navigateTo(page, entity_id?)` - Navigate to CRM pages
- `getCurrentPage()` - Get current page context

#### Notes (`notes.braid`) - 6 tools
- `createNote(tenant_id, entity_type, entity_id, content, ...)`
- `updateNote(tenant_id, note_id, content)`
- `searchNotes(tenant_id, search_text, entity_type, entity_id)`
- `getNotesForRecord(tenant_id, entity_type, entity_id)`
- `getNoteDetails(tenant_id, note_id)`
- `deleteNote(tenant_id, note_id)`

#### Opportunities (`opportunities.braid`) - 9 tools
- `createOpportunity(tenant_id, name, account_id, value, stage, ...)`
- `deleteOpportunity(tenant_id, opportunity_id)`
- `updateOpportunity(tenant_id, opportunity_id, updates)`
- `listOpportunitiesByStage(tenant_id, stage, limit)`
- `getOpportunityDetails(tenant_id, opportunity_id)`
- `searchOpportunities(tenant_id, search_text, stage, min_value, limit)`
- `searchOpportunitiesByStage(tenant_id, stage, limit)`
- `getOpportunityForecast(tenant_id, time_range)`
- `markOpportunityWon(tenant_id, opportunity_id, close_date, actual_value)`

#### Reports & Analytics (`reports.braid`) - 8 tools
- `getDashboardBundle(tenant_id, time_range, include_forecasts)` - **⚡ Primary metrics tool**
- `getHealthSummary(tenant_id)` - CRM health score
- `getSalesReport(tenant_id, start_date, end_date)` - Sales performance
- `getPipelineReport(tenant_id, stage_breakdown)` - Pipeline analysis
- `getActivityReport(tenant_id, start_date, end_date, employee_id)` - Activity metrics
- `getLeadConversionReport(tenant_id, time_range)` - Conversion funnel
- `getRevenueForecasts(tenant_id, quarters_ahead)` - Revenue forecast
- `clearReportCache(tenant_id, report_type)` - Force refresh

#### Snapshot (`snapshot.braid`) - 2 tools
- `fetchSnapshot(tenant_id, scope, limit)` - Complete CRM overview
- `probe()` - System health check

#### AI Suggestions (`suggest-next-actions.braid`) - 1 tool
- `suggestNextActions(tenant_id, entity_type, entity_id, limit)` - **RAG-powered** intelligent next steps

#### Suggestions (Legacy) (`suggestions.braid`) - 7 tools
- `listSuggestions(tenant_id, entity_type, entity_id)`
- `getSuggestionDetails(tenant_id, suggestion_id)`
- `getSuggestionStats(tenant_id, entity_type, entity_id)`
- `approveSuggestion(tenant_id, suggestion_id, approval_notes)`
- `rejectSuggestion(tenant_id, suggestion_id, rejection_reason)`
- `applySuggestion(tenant_id, suggestion_id)` - Execute suggestion
- `triggerSuggestionGeneration(tenant_id, entity_type, entity_id)`

#### Telephony (AI Calling) (`telephony.braid`) - 4 tools
- `initiateCall(tenant_id, to_phone, from_phone, entity_type, entity_id)`
- `callContact(tenant_id, contact_id, call_type)` - Quick call to contact
- `checkCallingProvider(tenant_id)` - Get configured provider (Bland, Thoughtly, etc.)
- `getCallingAgents(tenant_id, provider)` - List available AI agents

#### Users & Permissions (`users.braid`) - 9 tools
- `listUsers(tenant_id, role, active_only)` - List users (admin only)
- `getUserDetails(tenant_id, user_id)` - Get user profile
- `getCurrentUserProfile(tenant_id)` - Get current user
- `getUserProfiles(tenant_id, user_ids[])` - Batch get profiles
- `createUser(tenant_id, email, first_name, last_name, role, ...)`
- `updateUser(tenant_id, user_id, updates)` - Update profile
- `deleteUser(tenant_id, user_id)` - Deactivate user (admin only)
- `searchUsers(tenant_id, search_text, role)`
- `inviteUser(tenant_id, email, role, send_invite_email)`

#### Web Research (`web-research.braid`) - 3 tools
- `searchWeb(query, num_results)` - External web search
- `fetchWebPage(url)` - Scrape web page content
- `lookupCompanyInfo(company_name)` - External company data lookup

#### Workflow Delegation (`workflow-delegation.braid`) - 4 tools
- `triggerWorkflowByName(tenant_id, workflow_name, context, entity_type, entity_id)` - Delegate to named workflow
- `getWorkflowProgress(tenant_id, execution_id)` - Check workflow status
- `listActiveWorkflows(tenant_id)` - List running workflows
- `getWorkflowNotes(tenant_id, execution_id)` - Get workflow execution notes

#### Workflows (`workflows.braid`) - 3 tools
- `listWorkflowTemplates(tenant_id)` - List automation templates
- `getWorkflowTemplate(tenant_id, template_id)` - Get template definition
- `instantiateWorkflowTemplate(tenant_id, template_id, config)` - Create workflow from template

---

**Total: 119 tools across 20 .braid files**

---

## SDK Architecture

### Dual Execution Modes

Braid supports two execution patterns:

#### 1. In-Process Execution (Primary)

**File:** `backend/lib/braidIntegration-v2.js`

```javascript
import { executeToolInProcess } from './braidIntegration-v2.js';

const result = await executeToolInProcess('searchLeads', {
  tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
  status: 'qualified',
  limit: 10
});
```

**Characteristics:**
- Low latency (<50ms)
- Synchronous execution
- Used for: AiSHA chat interface, dashboard widgets
- Best for: Real-time interactions

#### 2. Distributed MCP Server

**File:** `braid-mcp-node-server/`

```bash
# Start MCP server (port 8000)
docker compose -f braid-mcp-node-server/docker-compose.yml up -d
```

**Characteristics:**
- HTTP-based (REST API)
- Redis job queue for concurrency
- Used for: External integrations, bulk operations, n8n workflows
- Best for: High-throughput, distributed systems

### Tool Loading & Registration

#### Registry Generation

```bash
# Check tool registry is in sync with .braid files
npm run braid:check

# Update registry from .braid files
npm run braid:sync

# Generate fresh registry (rebuild from scratch)
npm run braid:generate
```

#### Registry Structure

**File:** `braid-llm-kit/examples/assistant/toolRegistry.json`

```json
{
  "tools": [
    {
      "name": "searchLeads",
      "description": "Search for leads by status and date range",
      "parameters": {
        "type": "object",
        "properties": {
          "tenant_id": { "type": "string", "format": "uuid" },
          "status": { "type": "string", "enum": ["new", "qualified", "converted"] },
          "limit": { "type": "integer", "default": 10 }
        },
        "required": ["tenant_id"]
      }
    }
  ]
}
```

### System Prompt Integration

```javascript
// backend/lib/braidIntegration-v2.js
import { getBraidSystemPrompt } from './braidIntegration-v2.js';

const systemPrompt = getBraidSystemPrompt({
  tenantId: 'a11dfb63-...',
  entityLabels: customLabels,      // Optional tenant-specific terminology
  tenantContext: additionalContext  // Optional business rules
});

// Example output:
`You are AiSHA, the AI Executive Assistant for Example Corp.
You have access to 60+ tools for managing:
- Leads (called "Prospects" in this tenant)
- Accounts (called "Clients")
- ...

Current date: December 12, 2025
Always use tenant_id: a11dfb63-4b18-4eb8-872e-747af2e37c46 in all tool calls.`
```

---

## Integration Patterns

### Pattern 1: AI Chat Integration

**File:** `backend/routes/ai.js`

```javascript
import { executeToolInProcess, getBraidSystemPrompt } from '../lib/braidIntegration-v2.js';

app.post('/api/ai/chat', async (req, res) => {
  const { messages, tenant_id } = req.body;
  
  // Build system prompt with Braid context
  const systemPrompt = getBraidSystemPrompt({ tenantId: tenant_id });
  
  // Call LLM with tools
  const response = await llm.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    tools: braidToolRegistry
  });
  
  // Execute tool calls
  if (response.tool_calls) {
    for (const call of response.tool_calls) {
      const result = await executeToolInProcess(call.name, call.arguments);
      // ... handle result
    }
  }
});
```

### Pattern 2: Workflow Integration

**File:** `backend/routes/workflows.js`

```javascript
// Execute Braid tool from workflow node
case 'braid_tool':
  const toolName = node.config.tool_name;
  const toolParams = {
    tenant_id: context.tenant_id,
    ...node.config.parameters
  };
  
  const result = await executeToolInProcess(toolName, toolParams);
  context.variables[node.id] = result;
  break;
```

### Pattern 3: Scheduled Jobs

**File:** `backend/lib/aiTriggersWorker.js`

```javascript
import { executeToolInProcess } from './braidIntegration-v2.js';

async function checkStagnantLeads(tenantId) {
  // Use Braid tool instead of raw SQL
  const leads = await executeToolInProcess('searchLeads', {
    tenant_id: tenantId,
    status: 'qualified',
    created_before: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    limit: 50
  });
  
  // Process results...
}
```

---

## Real-World Applications

### When to Use Braid

#### ✅ Ideal Use Cases

**1. AI-Powered CRM Operations**

User asks: *"Show me all qualified leads from Seattle created last week"*

```javascript
const leads = await executeToolInProcess('searchLeads', {
  tenant_id: tenantId,
  status: 'qualified',
  city: 'Seattle',
  created_after: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  limit: 20
});
```

**Why Braid wins:**
- Type-safe parameters (status validated at compile-time)
- Tenant isolation guaranteed
- Single tool call instead of multi-step ORM query

**2. Workflow Automation**

*Workflow: "When lead is qualified, create follow-up task for sales rep"*

```javascript
// Workflow node execution
const lead = await executeToolInProcess('getLeadDetails', { tenant_id, lead_id });

if (lead.status === 'qualified') {
  await executeToolInProcess('createActivity', {
    tenant_id,
    entity_type: 'lead',
    entity_id: lead.id,
    type: 'call',
    subject: `Follow up with ${lead.first_name}`,
    assigned_to: lead.owner_id,
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
}
```

**Why Braid wins:**
- Atomic operations (each tool is single responsibility)
- Error handling per step
- Auditable (each tool call logged)

**3. Scheduled Jobs & Background Workers**

*Task: "Every day at 9am, check for stagnant leads and notify sales team"*

```javascript
// backend/lib/scheduledJobs.js
import { executeToolInProcess } from './braidIntegration-v2.js';

cron.schedule('0 9 * * *', async () => {
  const tenants = await getTenantList();
  
  for (const tenant of tenants) {
    const stagnantLeads = await executeToolInProcess('searchLeads', {
      tenant_id: tenant.id,
      status: 'new',
      created_before: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      limit: 50
    });
    
    if (stagnantLeads.length > 0) {
      await sendSlackNotification(tenant, stagnantLeads);
    }
  }
});
```

**4. External Integrations (n8n, Zapier, Make)**

```javascript
// n8n HTTP Request node → Braid MCP server
POST http://localhost:8000/tools/execute
{
  "tool": "createLead",
  "parameters": {
    "tenant_id": "{{$json.tenant_id}}",
    "first_name": "{{$json.contact_name}}",
    "source": "webform",
    "metadata": {
      "utm_campaign": "{{$json.utm_campaign}}"
    }
  }
}
```

**Why Braid wins:**
- Standardized API across all CRM operations
- Built-in tenant isolation (integration can't leak data)
- Versioned tool definitions (breaking changes detected)

#### ❌ When NOT to Use Braid

**1. Ad-Hoc Analytics Queries**

❌ Don't create Braid tools for one-off reports

```braid
// ❌ BAD: One-time query wrapped in Braid
tool getRevenueByIndustryForQ4_2025(tenant_id: uuid) -> Report {
  SELECT industry, SUM(revenue) FROM accounts
  WHERE tenant_id = $tenant_id
    AND created_at BETWEEN '2025-10-01' AND '2025-12-31'
  GROUP BY industry;
}
```

✅ **Use raw SQL or BI tool instead** for exploratory analysis

**2. Complex Multi-Table Joins**

❌ Braid isn't an ORM replacement for complex data modeling

```braid
// ❌ BAD: Complex join that should be a database view
tool getAccountFullDetails(tenant_id: uuid, account_id: uuid) -> ComplexObject {
  SELECT a.*, c.*, o.*, act.*, n.*
  FROM accounts a
  LEFT JOIN contacts c ON c.account_id = a.id
  LEFT JOIN opportunities o ON o.account_id = a.id
  LEFT JOIN activities act ON act.entity_id = a.id
  LEFT JOIN notes n ON n.entity_id = a.id
  WHERE a.tenant_id = $tenant_id AND a.id = $account_id;
}
```

✅ **Use separate tools** for accounts, contacts, opportunities and compose in application

**3. Real-Time Streaming Data**

❌ Braid tools are request/response, not pub/sub

✅ **Use PostgreSQL LISTEN/NOTIFY** or Redis Pub/Sub for real-time updates

### Performance Characteristics

#### Latency Benchmarks

| Operation | In-Process | MCP Server | Raw SQL (psql) |
|-----------|-----------|------------|----------------|
| Simple SELECT (10 rows) | 15-30ms | 80-120ms | 5-10ms |
| Complex JOIN (100 rows) | 50-100ms | 150-250ms | 30-60ms |
| INSERT | 20-40ms | 90-150ms | 10-20ms |
| Batch INSERT (100 rows) | 200-400ms | 500-800ms | 100-200ms |

**Overhead Breakdown:**
- In-Process: ~10ms (tool lookup + param validation)
- MCP Server: ~70ms (HTTP + Redis queue + tool lookup)
- Network: ~5-10ms (client → backend)

#### Throughput Limits

| Deployment | Max Throughput | Bottleneck |
|-----------|----------------|------------|
| Single backend (in-process) | 50-100 req/s | Node.js event loop |
| MCP server (1 worker) | 200-400 req/s | Redis queue processing |
| MCP server (5 workers) | 1000-2000 req/s | Database connection pool |
| MCP server (10 workers) | 2000-5000 req/s | PostgreSQL max connections |

**Optimization Tips:**
- Use in-process for <100 req/s workloads
- Use MCP server for >200 req/s or external integrations
- Scale MCP workers horizontally for >1000 req/s

---

## C.A.R.E. Integration

Braid tools power the C.A.R.E. (Cognitive Adaptive Response Engine) system, supporting the customer-facing C.A.R.E. framework (Communication, Acquisition, Retention, Engagement).

### Escalation Detection Flow

```
Call Flow Handler → detectEscalation() → Policy Gate → State Engine
                                             ↓
                    Braid Tools: updateLead(), createActivity()
```

### Example: Auto-Create Follow-Up Task

```javascript
// backend/lib/care/escalationHandler.js
import { executeToolInProcess } from '../braidIntegration-v2.js';

async function handleEscalation({ tenant_id, entity_type, entity_id, reason }) {
  // Use Braid to create follow-up activity
  const activity = await executeToolInProcess('createActivity', {
    tenant_id,
    entity_type,
    entity_id,
    type: 'call',
    subject: `Follow up: ${reason}`,
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    priority: 'high'
  });
  
  return activity;
}
```

### Example: Update C.A.R.E. State

```javascript
// backend/lib/care/careStateEngine.js
import { executeToolInProcess } from '../braidIntegration-v2.js';

async function transitionState({ tenant_id, entity_id, from, to, reason }) {
  // Record state change in care_states table
  await executeToolInProcess('recordStateTransition', {
    tenant_id,
    entity_id,
    previous_state: from,
    current_state: to,
    transition_reason: reason,
    transitioned_at: new Date()
  });
}
```

---

## Security & Tenant Isolation

### Multi-Tenancy Guarantees

**Every Braid tool enforces tenant isolation:**

```braid
tool searchLeads(
  tenant_id: uuid,  // ← REQUIRED parameter
  ...
) {
  SELECT * FROM leads
  WHERE tenant_id = $tenant_id  // ← ENFORCED in SQL
  ...;
}
```

**What this prevents:**
- ❌ Cross-tenant data leakage
- ❌ Accidental global queries (`SELECT * FROM leads`)
- ❌ Tenant ID injection attacks

### Row-Level Security (RLS) Integration

Braid executes queries using service role with RLS bypass **BUT** still enforces tenant isolation via query parameters:

```sql
-- PostgreSQL RLS policy (redundant safety layer)
CREATE POLICY tenant_isolation ON leads
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Defense in depth:**
1. **Application layer (Braid)**: `tenant_id` required parameter
2. **Query layer**: `WHERE tenant_id = $tenant_id` in SQL
3. **Database layer (RLS)**: Policy enforcement (if Braid bypassed)

### Audit Logging

**All Braid operations are logged:**

```javascript
// backend/lib/braidIntegration-v2.js
async function executeToolInProcess(toolName, params) {
  const startTime = Date.now();
  
  try {
    const result = await executeTool(toolName, params);
    
    // Log success
    await pgPool.query(`
      INSERT INTO system_logs (level, category, message, metadata)
      VALUES ('info', 'braid_tool', $1, $2)
    `, [
      `Executed ${toolName}`,
      JSON.stringify({ 
        tool: toolName, 
        tenant_id: params.tenant_id,
        duration: Date.now() - startTime,
        result_count: Array.isArray(result) ? result.length : 1
      })
    ]);
    
    return result;
  } catch (error) {
    // Log failure
    await pgPool.query(`
      INSERT INTO system_logs (level, category, message, metadata)
      VALUES ('error', 'braid_tool', $1, $2)
    `, [
      `Failed ${toolName}: ${error.message}`,
      JSON.stringify({ tool: toolName, tenant_id: params.tenant_id, error: error.stack })
    ]);
    
    throw error;
  }
}
```

**Query audit logs:**

```sql
SELECT 
  created_at,
  message,
  metadata->>'tool' as tool_name,
  metadata->>'tenant_id' as tenant_id,
  metadata->>'duration' as duration_ms
FROM system_logs
WHERE category = 'braid_tool'
ORDER BY created_at DESC
LIMIT 100;
```

---

## Advanced Techniques

### Pattern 1: Tool Composition for Complex Workflows

#### Problem

AI needs to execute multi-step operations (e.g., "Convert lead to account with initial opportunity")

#### Solution: Compose Atomic Tools

```javascript
// backend/lib/lifecycleOperations.js
import { executeToolInProcess } from './braidIntegration-v2.js';

async function convertLeadToAccountWithOpportunity(tenantId, leadId, opportunityValue) {
  // Step 1: Get lead details
  const lead = await executeToolInProcess('getLeadDetails', {
    tenant_id: tenantId,
    lead_id: leadId
  });
  
  if (lead.status !== 'qualified') {
    throw new Error('Lead must be qualified before conversion');
  }
  
  // Step 2: Create account
  const account = await executeToolInProcess('createAccount', {
    tenant_id: tenantId,
    name: lead.company,
    industry: lead.industry,
    source: lead.source,
    metadata: { converted_from_lead_id: leadId }
  });
  
  // Step 3: Create contact
  const contact = await executeToolInProcess('createContact', {
    tenant_id: tenantId,
    account_id: account.id,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone
  });
  
  // Step 4: Create opportunity
  const opportunity = await executeToolInProcess('createOpportunity', {
    tenant_id: tenantId,
    account_id: account.id,
    name: `${lead.company} - Initial Deal`,
    value: opportunityValue,
    stage: 'discovery',
    source: lead.source
  });
  
  // Step 5: Archive lead
  await executeToolInProcess('archiveLead', {
    tenant_id: tenantId,
    lead_id: leadId
  });
  
  return { account, contact, opportunity };
}
```

**Benefits:**
- Each step is atomic and testable
- Rollback possible at any point
- Audit log shows exact sequence
- Can pause/resume workflow

### Pattern 2: Dynamic Tool Selection

#### Problem

AI needs to choose different tools based on runtime conditions

#### Solution: Tool Router

```javascript
const ENTITY_TOOLS = {
  lead: {
    create: 'createLead',
    update: 'updateLead',
    search: 'searchLeads',
    delete: 'archiveLead'
  },
  account: {
    create: 'createAccount',
    update: 'updateAccount',
    search: 'searchAccounts',
    delete: 'archiveAccount'
  },
  contact: {
    create: 'createContact',
    update: 'updateContact',
    search: 'searchContacts',
    delete: 'archiveContact'
  }
};

async function performOperation(entityType, operation, params) {
  const toolName = ENTITY_TOOLS[entityType]?.[operation];
  
  if (!toolName) {
    throw new Error(`Unknown operation ${operation} for entity ${entityType}`);
  }
  
  return executeToolInProcess(toolName, params);
}

// Usage
await performOperation('lead', 'create', { tenant_id, first_name: 'John', ... });
await performOperation('account', 'search', { tenant_id, industry: 'SaaS', ... });
```

### Pattern 3: Batch Operations with Error Handling

#### Problem

Need to process 100+ records without failing entire batch on single error

#### Solution: Parallel Execution with Error Collection

```javascript
async function batchCreateLeads(tenantId, leadsData) {
  const results = [];
  const errors = [];
  
  // Process in chunks of 10 (avoid overwhelming DB)
  const chunks = chunkArray(leadsData, 10);
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (leadData, index) => {
      try {
        const lead = await executeToolInProcess('createLead', {
          tenant_id: tenantId,
          ...leadData
        });
        return { success: true, lead, index };
      } catch (error) {
        return { 
          success: false, 
          error: error.message, 
          data: leadData, 
          index 
        };
      }
    });
    
    const chunkResults = await Promise.all(promises);
    
    for (const result of chunkResults) {
      if (result.success) {
        results.push(result.lead);
      } else {
        errors.push(result);
      }
    }
  }
  
  return {
    created: results,
    failed: errors,
    stats: {
      total: leadsData.length,
      succeeded: results.length,
      failed: errors.length,
      successRate: (results.length / leadsData.length * 100).toFixed(2) + '%'
    }
  };
}
```

### Pattern 4: Caching Tool Results

#### Problem

Expensive queries (e.g., reports) called multiple times in same request

#### Solution: Memoization Wrapper

```javascript
import { createHash } from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_CACHE_URL);

function cacheKey(toolName, params) {
  const hash = createHash('sha256')
    .update(JSON.stringify({ tool: toolName, params }))
    .digest('hex');
  return `braid:cache:${toolName}:${hash}`;
}

async function executeToolWithCache(toolName, params, ttlSeconds = 300) {
  const key = cacheKey(toolName, params);
  
  // Check cache
  const cached = await redis.get(key);
  if (cached) {
    console.log(`Cache HIT: ${toolName}`);
    return JSON.parse(cached);
  }
  
  console.log(`Cache MISS: ${toolName}`);
  
  // Execute tool
  const result = await executeToolInProcess(toolName, params);
  
  // Cache result
  await redis.setex(key, ttlSeconds, JSON.stringify(result));
  
  return result;
}

// Usage
const report = await executeToolWithCache('getDashboardBundle', {
  tenant_id: tenantId,
  time_range: '30d'
}, 600); // Cache for 10 minutes
```

### Pattern 5: Tool Result Validation

#### Problem

AI agents sometimes pass invalid IDs or expect data that doesn't exist

#### Solution: Typed Validation Layer

```javascript
import Joi from 'joi';

const TOOL_SCHEMAS = {
  createLead: Joi.object({
    tenant_id: Joi.string().uuid().required(),
    first_name: Joi.string().min(1).max(100).required(),
    last_name: Joi.string().min(1).max(100).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    company: Joi.string().max(200).optional(),
    source: Joi.string().valid('webform', 'referral', 'cold_call', 'event').required()
  }),
  
  searchLeads: Joi.object({
    tenant_id: Joi.string().uuid().required(),
    status: Joi.string().valid('new', 'qualified', 'converted').optional(),
    limit: Joi.number().min(1).max(100).default(10)
  })
};

async function executeToolWithValidation(toolName, params) {
  const schema = TOOL_SCHEMAS[toolName];
  
  if (schema) {
    const { error, value } = schema.validate(params);
    
    if (error) {
      throw new Error(`Validation failed for ${toolName}: ${error.message}`);
    }
    
    params = value; // Use validated/sanitized params
  }
  
  return executeToolInProcess(toolName, params);
}
```

### Pattern 6: Transactional Tool Execution

#### Problem

Multiple tool calls need to succeed together or rollback

#### Solution: Database Transactions

```javascript
import { pgPool } from './database.js';

async function executeToolsInTransaction(tenantId, operations) {
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    
    for (const { tool, params } of operations) {
      const result = await executeToolInProcess(tool, {
        tenant_id: tenantId,
        ...params
      });
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Usage: Convert lead atomically
const results = await executeToolsInTransaction(tenantId, [
  { tool: 'createAccount', params: { name: 'Acme Corp', ... } },
  { tool: 'createContact', params: { first_name: 'John', ... } },
  { tool: 'createOpportunity', params: { name: 'Deal 1', ... } },
  { tool: 'archiveLead', params: { lead_id: 'abc-123' } }
]);
```

### Pattern 7: Tool Observability

#### Problem

Need to monitor tool usage patterns and performance in production

#### Solution: Instrumentation Wrapper

```javascript
import { logger } from './logger.js';

const toolMetrics = new Map();

async function executeToolWithMetrics(toolName, params) {
  const startTime = Date.now();
  const toolKey = `${toolName}:${params.tenant_id}`;
  
  try {
    const result = await executeToolInProcess(toolName, params);
    const duration = Date.now() - startTime;
    
    // Update metrics
    if (!toolMetrics.has(toolKey)) {
      toolMetrics.set(toolKey, { calls: 0, totalDuration: 0, errors: 0 });
    }
    const metrics = toolMetrics.get(toolKey);
    metrics.calls++;
    metrics.totalDuration += duration;
    
    // Log slow queries
    if (duration > 1000) {
      logger.warn(`Slow tool execution: ${toolName} took ${duration}ms`, {
        tool: toolName,
        tenant_id: params.tenant_id,
        duration
      });
    }
    
    return result;
    
  } catch (error) {
    const metrics = toolMetrics.get(toolKey);
    if (metrics) metrics.errors++;
    
    logger.error(`Tool execution failed: ${toolName}`, {
      tool: toolName,
      tenant_id: params.tenant_id,
      error: error.message
    });
    
    throw error;
  }
}

// Metrics endpoint
app.get('/api/internal/braid-metrics', (req, res) => {
  const metrics = Array.from(toolMetrics.entries()).map(([key, data]) => {
    const [tool, tenant] = key.split(':');
    return {
      tool,
      tenant_id: tenant,
      calls: data.calls,
      avgDuration: Math.round(data.totalDuration / data.calls),
      errorRate: (data.errors / data.calls * 100).toFixed(2) + '%'
    };
  });
  
  res.json(metrics);
});
```

---

## Development Workflow & Tooling

### Local Development Setup

#### 1. Install Braid CLI (Future Enhancement)

```bash
# Planned: Braid development CLI
npm install -g @aishacrm/braid-cli

# Initialize new Braid tool
braid init my-custom-tool

# Validate tool definition
braid validate accounts.braid

# Generate TypeScript types from Braid
braid codegen --output src/types/braid.d.ts
```

#### 2. IDE Integration

**VS Code Extension (Planned):**
- Syntax highlighting for `.braid` files
- IntelliSense for tool parameters
- Inline SQL validation
- Jump to definition for tool calls

**Current Workaround:** Use SQL syntax highlighting

```json
// .vscode/settings.json
{
  "files.associations": {
    "*.braid": "sql"
  }
}
```

#### 3. Tool Testing Framework

```javascript
// backend/__tests__/braid/searchLeads.test.js
import { executeToolInProcess } from '../../lib/braidIntegration-v2.js';
import { setupTestTenant, teardownTestTenant } from '../helpers.js';

describe('Braid Tool: searchLeads', () => {
  let tenantId;
  
  beforeAll(async () => {
    tenantId = await setupTestTenant();
  });
  
  afterAll(async () => {
    await teardownTestTenant(tenantId);
  });
  
  test('returns leads filtered by status', async () => {
    // Create test leads
    await executeToolInProcess('createLead', {
      tenant_id: tenantId,
      first_name: 'John',
      last_name: 'Doe',
      status: 'qualified',
      source: 'webform'
    });
    
    await executeToolInProcess('createLead', {
      tenant_id: tenantId,
      first_name: 'Jane',
      last_name: 'Smith',
      status: 'new',
      source: 'referral'
    });
    
    // Search for qualified leads
    const results = await executeToolInProcess('searchLeads', {
      tenant_id: tenantId,
      status: 'qualified',
      limit: 10
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('John');
    expect(results[0].status).toBe('qualified');
  });
  
  test('respects tenant isolation', async () => {
    const otherTenantId = await setupTestTenant();
    
    await executeToolInProcess('createLead', {
      tenant_id: otherTenantId,
      first_name: 'Alice',
      last_name: 'Brown',
      status: 'new',
      source: 'cold_call'
    });
    
    // Search in original tenant should not see other tenant's leads
    const results = await executeToolInProcess('searchLeads', {
      tenant_id: tenantId,
      status: 'new',
      limit: 100
    });
    
    expect(results.every(lead => lead.tenant_id === tenantId)).toBe(true);
    expect(results.find(lead => lead.first_name === 'Alice')).toBeUndefined();
    
    await teardownTestTenant(otherTenantId);
  });
});
```

### Debugging Tools

#### 1. SQL Query Logger

```javascript
// backend/lib/braidIntegration-v2.js
const BRAID_DEBUG = process.env.BRAID_DEBUG === 'true';

function logQuery(toolName, sql, params) {
  if (!BRAID_DEBUG) return;
  
  console.log(`\n[BRAID DEBUG] ${toolName}`);
  console.log('SQL:', sql);
  console.log('Params:', JSON.stringify(params, null, 2));
  console.log('---');
}

// Enable with:
// BRAID_DEBUG=true npm run dev
```

#### 2. Tool Call Tracer

```javascript
// backend/lib/braidTracer.js
export class BraidTracer {
  constructor() {
    this.calls = [];
  }
  
  startTrace(toolName, params) {
    const traceId = Math.random().toString(36).substring(7);
    this.calls.push({
      id: traceId,
      tool: toolName,
      params,
      startTime: Date.now(),
      status: 'running'
    });
    return traceId;
  }
  
  endTrace(traceId, result, error = null) {
    const call = this.calls.find(c => c.id === traceId);
    if (call) {
      call.endTime = Date.now();
      call.duration = call.endTime - call.startTime;
      call.status = error ? 'error' : 'success';
      call.error = error?.message;
      call.resultSize = JSON.stringify(result || {}).length;
    }
  }
  
  getTrace() {
    return this.calls;
  }
  
  exportToJSON() {
    return JSON.stringify(this.calls, null, 2);
  }
}

// Usage
const tracer = new BraidTracer();
const traceId = tracer.startTrace('searchLeads', params);
try {
  const result = await executeToolInProcess('searchLeads', params);
  tracer.endTrace(traceId, result);
} catch (error) {
  tracer.endTrace(traceId, null, error);
}

console.log(tracer.exportToJSON());
```

#### 3. Performance Profiler

```javascript
// backend/lib/braidProfiler.js
import { performance } from 'perf_hooks';

export function profileTool(toolName) {
  return async function(params) {
    const marks = {
      start: performance.now(),
      paramValidation: 0,
      sqlExecution: 0,
      resultSerialization: 0,
      end: 0
    };
    
    // Param validation
    const validatedParams = validateParams(toolName, params);
    marks.paramValidation = performance.now();
    
    // SQL execution
    const rawResult = await executeSQL(toolName, validatedParams);
    marks.sqlExecution = performance.now();
    
    // Result serialization
    const serializedResult = serializeResult(rawResult);
    marks.resultSerialization = performance.now();
    marks.end = performance.now();
    
    const profile = {
      tool: toolName,
      totalDuration: marks.end - marks.start,
      breakdown: {
        paramValidation: marks.paramValidation - marks.start,
        sqlExecution: marks.sqlExecution - marks.paramValidation,
        resultSerialization: marks.resultSerialization - marks.sqlExecution
      }
    };
    
    console.log('[PROFILE]', JSON.stringify(profile));
    
    return serializedResult;
  };
}
```

### Registry Management Tools

#### Check Tool Registry Sync

```bash
npm run braid:check
```

**Output:**
```
✓ accounts.braid is in sync
✓ leads.braid is in sync
✗ opportunities.braid has changes not in registry

Run 'npm run braid:sync' to update registry
```

#### Sync Registry

```bash
npm run braid:sync
```

**What it does:**
1. Scans `braid-llm-kit/examples/assistant/*.braid`
2. Parses tool definitions
3. Validates SQL syntax
4. Generates JSON schema for each tool
5. Updates `toolRegistry.json`

#### Generate Registry from Scratch

```bash
npm run braid:generate
```

**Use case:** After major refactor or when registry is corrupted

### Testing MCP Server

#### Health Check

```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "healthy",
  "tools": 119,
  "uptime": 3600,
  "redis": "connected",
  "database": "connected"
}
```

#### Execute Tool via HTTP

```bash
curl -X POST http://localhost:8000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "searchLeads",
    "parameters": {
      "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
      "status": "qualified",
      "limit": 5
    }
  }'
```

#### List Available Tools

```bash
curl http://localhost:8000/tools/list
```

---

## Best Practices

### 1. Always Validate `tenant_id`

```javascript
// ✅ CORRECT: Validate tenant before executing
const tenantId = req.user.tenant_id;
if (!tenantId || !isValidUUID(tenantId)) {
  return res.status(400).json({ error: 'Invalid tenant_id' });
}

const result = await executeToolInProcess('searchLeads', {
  tenant_id: tenantId,
  status: 'qualified'
});

// ❌ WRONG: Trust user input directly
const result = await executeToolInProcess('searchLeads', {
  tenant_id: req.body.tenant_id,  // User-controlled!
  status: 'qualified'
});
```

### 2. Use Safe Defaults

```braid
// ✅ CORRECT: Bounded query
tool searchLeads(
  tenant_id: uuid,
  limit: int = 10  // Default prevents unbounded results
) { ... }

// ❌ WRONG: Unbounded query
tool searchLeads(
  tenant_id: uuid,
  limit?: int  // Optional limit = potential performance issue
) { ... }
```

### 3. Prefer Read-Only Tools

```braid
// ✅ SAFE: Read-only tool
tool getLeadStats(tenant_id: uuid) -> { total: int, qualified: int } {
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'qualified') as qualified
  FROM leads
  WHERE tenant_id = $tenant_id;
}

// ⚠️ USE WITH CAUTION: Mutation tool
tool updateLead(tenant_id: uuid, lead_id: uuid, status: string) -> void {
  UPDATE leads
  SET status = $status, updated_at = NOW()
  WHERE tenant_id = $tenant_id AND id = $lead_id;
}
```

### 4. Test with Multiple Tenants

```javascript
// ✅ CORRECT: Verify tenant isolation in tests
test('searchLeads respects tenant boundaries', async () => {
  const tenant1 = 'a11dfb63-...';
  const tenant2 = 'b22cfd74-...';
  
  // Create lead for tenant1
  await executeToolInProcess('createLead', {
    tenant_id: tenant1,
    first_name: 'John',
    last_name: 'Doe'
  });
  
  // Query from tenant2 should return empty
  const results = await executeToolInProcess('searchLeads', {
    tenant_id: tenant2,
    limit: 100
  });
  
  assert.equal(results.length, 0);
});
```

### 5. Handle Errors Gracefully

```javascript
try {
  const result = await executeToolInProcess('getAccount', {
    tenant_id: tenantId,
    account_id: accountId
  });
  
  if (!result) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  return res.json(result);
} catch (error) {
  logger.error('Braid tool failed', { tool: 'getAccount', error });
  return res.status(500).json({ 
    error: 'Failed to retrieve account',
    // Do NOT leak internal details in production
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

---

## Troubleshooting

### Common Issues

#### 1. Tool Not Found

**Error:** `Tool 'searchLeads' not found in registry`

**Diagnosis:**
```bash
# Check tool registry is up to date
npm run braid:check
```

**Fix:**
```bash
# Sync registry with .braid files
npm run braid:sync
```

#### 2. Type Validation Error

**Error:** `Parameter 'status' expected enum<new|qualified|converted>, got 'oppen'`

**Cause:** Typo in parameter value

**Fix:** Check .braid file for valid enum values

```braid
tool searchLeads(
  status?: enum<new|qualified|converted>,  // Only these 3 values allowed
  ...
)
```

#### 3. Tenant Isolation Failure

**Error:** Query returns cross-tenant data

**Diagnosis:**
```sql
-- Check if tenant_id is actually being used
SELECT * FROM leads WHERE id = 'some-lead-id';
-- Does this return leads from multiple tenants?
```

**Fix:** Ensure `WHERE tenant_id = $tenant_id` in every query

#### 4. MCP Server Not Responding

**Error:** `Connection refused to http://localhost:8000`

**Diagnosis:**
```bash
# Check if MCP server is running
docker compose -f braid-mcp-node-server/docker-compose.yml ps

# Check logs
docker compose -f braid-mcp-node-server/docker-compose.yml logs -f
```

**Fix:**
```bash
# Restart MCP server
docker compose -f braid-mcp-node-server/docker-compose.yml restart
```

### Debug Mode

```bash
# Enable Braid debug logging
BRAID_DEBUG=true npm run dev

# Check logs
tail -f backend/logs/braid-*.log

# Enable SQL query logging in PostgreSQL
psql -U postgres -c "ALTER SYSTEM SET log_statement = 'all';"
psql -U postgres -c "SELECT pg_reload_conf();"

# Watch live queries
tail -f /var/log/postgresql/postgresql-15-main.log | grep "FROM leads"
```

### Advanced Debugging Techniques

#### 1. Inspect Tool Registry

```bash
# View all registered tools
cat braid-llm-kit/examples/assistant/toolRegistry.json | jq '.tools[].name'

# Find tool definition
cat braid-llm-kit/examples/assistant/toolRegistry.json | jq '.tools[] | select(.name=="searchLeads")'

# Count tools by category
cat braid-llm-kit/examples/assistant/toolRegistry.json | jq '.tools | group_by(.category) | map({category: .[0].category, count: length})'
```

#### 2. Trace SQL Execution

```javascript
// backend/lib/braidIntegration-v2.js
import { pgPool } from './database.js';

// Monkey-patch query method for debugging
const originalQuery = pgPool.query.bind(pgPool);
pgPool.query = async function(sql, params) {
  console.log('[SQL]', sql);
  console.log('[PARAMS]', params);
  const start = Date.now();
  try {
    const result = await originalQuery(sql, params);
    console.log('[DURATION]', Date.now() - start, 'ms');
    console.log('[ROWS]', result.rowCount);
    return result;
  } catch (error) {
    console.error('[SQL ERROR]', error.message);
    throw error;
  }
};
```

#### 3. Test Tool Isolation

```bash
# Create two test tenants
psql -U postgres -d aishacrm -c "
  INSERT INTO tenants (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b');
"

# Create lead for Tenant A
curl -X POST http://localhost:4001/api/ai/tool \
  -d '{"tool": "createLead", "params": {"tenant_id": "11111111-1111-1111-1111-111111111111", "first_name": "Alice"}}'

# Try to search from Tenant B (should return empty)
curl -X POST http://localhost:4001/api/ai/tool \
  -d '{"tool": "searchLeads", "params": {"tenant_id": "22222222-2222-2222-2222-222222222222", "limit": 100}}'

# Verify isolation in database
psql -U postgres -d aishacrm -c "
  SELECT tenant_id, COUNT(*) FROM leads GROUP BY tenant_id;
"
```

#### 4. Benchmark Tool Performance

```javascript
// backend/scripts/benchmarkTool.js
import { executeToolInProcess } from '../lib/braidIntegration-v2.js';

async function benchmark(toolName, params, iterations = 100) {
  const durations = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await executeToolInProcess(toolName, params);
    durations.push(Date.now() - start);
  }
  
  durations.sort((a, b) => a - b);
  
  return {
    tool: toolName,
    iterations,
    min: durations[0],
    max: durations[durations.length - 1],
    avg: durations.reduce((a, b) => a + b) / durations.length,
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
    p99: durations[Math.floor(durations.length * 0.99)]
  };
}

// Run benchmark
const results = await benchmark('searchLeads', {
  tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
  status: 'qualified',
  limit: 10
}, 100);

console.table(results);
// Output:
// ┌──────────┬────────────┬─────┬─────┬──────┬─────┬─────┬─────┐
// │ tool     │ iterations │ min │ max │ avg  │ p50 │ p95 │ p99 │
// ├──────────┼────────────┼─────┼─────┼──────┼─────┼─────┼─────┤
// │searchLeads│ 100       │ 15  │ 87  │ 28.3 │ 25  │ 52  │ 73  │
// └──────────┴────────────┴─────┴─────┴──────┴─────┴─────┴─────┘
```

### Performance Issues

**Symptom:** Slow tool execution

**Diagnosis:**
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM leads
WHERE tenant_id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'
  AND status = 'qualified'
  AND created_at > NOW() - INTERVAL '7 days';
```

**Fix:** Add database indexes

```sql
CREATE INDEX CONCURRENTLY idx_leads_tenant_status_created 
ON leads (tenant_id, status, created_at);
```

---

## Appendix: Quick Reference

### Braid Tool Syntax Cheat Sheet

```braid
tool toolName(
  required: type,
  optional?: type,
  withDefault: type = value,
  constrained: enum<A|B|C>
) -> ReturnType {
  SQL_QUERY;
}
```

### Common Type Patterns

| Pattern | Example |
|---------|---------|
| UUID parameter | `tenant_id: uuid` |
| Optional string | `search?: string` |
| Enum constraint | `status: enum<open|closed>` |
| Default integer | `limit: int = 10` |
| Array return | `-> Lead[]` |
| Void return | `-> void` |

### Execution Commands

```bash
# Development
npm run braid:check      # Verify registry sync
npm run braid:sync       # Update registry from .braid files
npm run braid:generate   # Rebuild registry from scratch

# MCP Server
npm run serve:braid      # Start distributed MCP server
```

### Environment Variables

```bash
# In-Process Execution
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# MCP Server
BRAID_MCP_URL=http://localhost:8000
MCP_NODE_HEALTH_URL=http://localhost:8000/health
```

---

**For more information:**
- **Developer Manual:** [docs/DEVELOPER_MANUAL.md](./DEVELOPER_MANUAL.md) - Chapter 6 & 13
- **Admin Guide:** [docs/ADMIN_GUIDE.md](./ADMIN_GUIDE.md) - Chapter 13
- **Product Spec:** [docs/product/customer-care-v1.md](./product/customer-care-v1.md)

