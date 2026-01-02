# CHANGELOG

All notable changes to Aisha CRM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2026-01-01

### Added
- **TokenBudgetManager** - centralized token budget enforcement (`backend/lib/aiBudgetConfig.js`)
  - Hard ceiling of 4000 tokens (configurable via `AI_TOKEN_HARD_CEILING`)
  - Component caps: system prompt (1200), tools (800), memory (250), tool results (700)
  - Smart drop-order: memory → tools → messages → system prompt
  - Core tools (`fetch_tenant_snapshot`, `suggest_next_actions`, etc.) never removed
- **Memory Gating** - RAG memory only queried when user explicitly asks for history
  - Trigger patterns: "last time", "remind me", "what did we discuss", etc.
  - Gating precedence: `ALWAYS_OFF > MEMORY_ENABLED > ALWAYS_ON > patterns`
  - Reduced defaults: topK=3 (was 8), maxChunkChars=300 (was 500)
- `backend/README-ai-budget.md` - comprehensive budget documentation
- Token budget and memory gating acceptance tests (47 tests)
- AI token optimization with smart prompt condensing (70% token reduction: 8800 → 2300 tokens)
- `enhanceSystemPromptSmart()` for condensed vs full context selection
- `applyToolHardCap()` to limit tools to 3-20 (preserves forced tools)
- `enforceToolSchemaCap()` for token-based tool schema limiting
- `applyBudgetCaps()` with drop-order enforcement before model calls
- `logBudgetSummary()` for one-line budget telemetry
- `enhanceSystemPromptCondensed()` for follow-up messages (~400 tokens)
- Phase 7 RAG memory helper (`getConversationSummaryFromMemory()` in aiMemory/index.js)
- `searchLeadsByStatus`, `searchAccountsByStatus`, `searchOpportunitiesByStage`, `searchContactsByStatus` tools
- `listAllContacts` tool for retrieving all contacts with full details

### Changed
- **AI token usage reduced from ~11k-12k to ~2k-3k tokens per interaction** (75% reduction)
- Budget enforcement applied consistently in both `generateAssistantResponse` and `/api/ai/chat` flows
- Updated `AI_ARCHITECTURE_AISHA_AI.md` with Token Budget Manager and Memory Gating sections

### Fixed
- CodeQL analysis - exclude .http files and api-tests from analysis (REST Client test files)
- AI hallucination prevention - AI must use exact record names from tool results
  - Added 'EXACT Name:' prefix in summarizers for all entities
  - Added CRITICAL anti-hallucination instruction to each summarizer
  - Added TEST DATA IDENTIFICATION rule to BRAID_SYSTEM_PROMPT
- Braid metrics `getToolMetrics` return value handling (was treating object as array)
- Braid metrics period mapping (1h/24h/7d/30d → hour/day/week/month)
- BraidSDKMonitor.jsx missing credentials for cookie auth
- Testing.js check-volume endpoint missing tenant_id param
- Bizdevsources route: case-insensitive status filter, filter out 'undefined' string params

### Changed
- Intent classifier: only match valid lead statuses (new, contacted, qualified, converted, rejected)
- E2E tests: mark created records with is_test_data=true
- Enhanced tenantContextDictionary with custom entity/status terminology handling

---

## [3.6.19] - 2025-12-31

### Added
- AI thumbs up/down feedback for AI responses
  - PATCH `/api/ai/conversations/:id/messages/:messageId/feedback` endpoint
  - Stores feedback in conversation_messages.metadata.feedback JSONB
  - UI thumbs buttons appear on hover for assistant messages
- Cache invalidation to user CRUD operations (POST, PUT, DELETE routes)

### Fixed
- AI sidebar - skip conversation creation for users without tenant_id
  - SuperAdmins can assign themselves to a tenant via User Management
  - AI sidebar gracefully skips conversation creation instead of throwing auth error
- Dashboard error display with status codes, duration, and error messages
  - Status code badge with color coding (500+ red, 4xx yellow)
  - Show request duration in milliseconds
  - Display error_message from performance logs

### Changed
- Complete Phase 7 RAG implementation with memory retrieval and conversation summaries
  - Memory chunks now correctly injected with UNTRUSTED boundary marker
  - Conversation summaries provide rolling context for AI conversations
  - Tenant isolation verified via mock tests and RLS policies
  - All environment variables have sensible defaults (topK=8, minSimilarity=0.7)

---

## [3.6.18] - 2025-12-30

### Added
- Dashboard bundle optimization with pre-aggregated data (45% faster: 389ms → 214ms)
  - `leadsBySource` pre-aggregation (eliminates LeadSourceChart API call)
  - Increase bundle limits: 100 leads (was 5), 50 opps (was 5)
  - `funnelAggregates` from materialized view dashboard_funnel_counts
  - Extra fields: email, phone, source, is_test_data for richer widgets
- Caching to dashboard-stats (90s TTL, 78% faster: 443ms → 98ms)
- Caching to funnel-counts (120s TTL, 37% faster: 133ms → 84ms)

### Fixed
- Testing support for GH_TOKEN env var from Doppler (check both GITHUB_TOKEN and GH_TOKEN)
- E2E test selectors for leads, opportunities, system logs (all 12 CRUD E2E tests pass)
- System logs cache invalidation after delete operations
- Testing endpoint tenant_id handling in cron/jobs full-scan endpoint
- System logs tenant_id=system alias handling for UUID column (fixes 24% API error rate)

### Changed
- CLS Optimization: Enlarge Recent Activities chart + Graphics centering
  - Recent Activities: h-72 → h-[26rem] (288px → 416px)
  - Chart width: max-w-2xl → max-w-3xl
  - Pie Chart: radius 80→120, container h-[28rem]
  - Sales Funnel: 550x450 (was 480x340)
  - All widgets: Uniform 600px height for zero layout shift

---

## [3.6.14] - 2025-12-30

### Security (BREAKING CHANGE)
- Enforce tenant isolation + add caching to 16 endpoints
  - Enforce mandatory tenant_id validation on bizdevsources, cashflow, modulesettings, synchealths, notifications, announcements, audit-logs, notes, webhooks, cron, accounts
  - Prevents multi-tenant data leakage vulnerability
  - Returns 400 error when tenant_id is missing
- Added Redis caching to all 11 security-fixed endpoints (60-300s TTL)
- Added caching to activities, opportunities, employees, users, system-logs (120-180s TTL)
- Performance gains: 11-77% faster response times on cached requests

### Fixed
- Superadmin access, JWT payload enhancement, and robust tenant validation
- Production 401/403 errors by fixing token refresh and auth status codes
- JWT secret fallback alignment in authenticate middleware
- API test files protection with .gitignore updates
- CORS issues for app.aishacrm.com with proper error response headers
- Server.js authenticateRequest import to resolve backend crash
- Authenticate middleware to /api/ai routes to enable Bearer token auth

### Changed
- Fixed cron.route.test.js to include tenant_id in all requests

---

## [3.5.0 - 3.5.9] - 2025-12-27 to 2025-12-30

### Added
- Token burn reduction by capping history + tool summaries
  - MAX_INCOMING = 8 messages limit
  - MAX_CHARS = 1500 per message content
  - Tool summary cap at 1200 chars
  - CostGuard logging to track optimization
- Entity context extraction to conversation message metadata
  - Extract lead_id, contact_id, account_id, opportunity_id, activity_id from tool interactions
  - Comprehensive test suite for entity extraction and context persistence
- Deterministic intent routing system (v3.5.0 - BREAKING CHANGE)
  - Created intentClassifier.js with regex patterns for 100+ intent codes
  - Created intentRouter.js mapping intent codes to Braid tools
  - Confidence-based fallback: high → forced tool, medium → focused subset, low → all tools
  - 60-70% reduction in tokens sent per request
- Intent column to LLM Activity Monitor
- Entity filter params to Braid list tools (listLeads, listActivities, listOpportunitiesByStage)
- `suggestNextActions` to BRAID_PARAM_ORDER for proper arg binding
- Status label resolver for tenant terminology normalization

### Fixed
- Lead search functionality and OpenAI API authentication
  - Fixed broken text search in /api/v2/leads endpoint
  - Updated OpenAI API key from deprecated sk-svcacct to sk-proj key
- Pagination limits and immediate delete reflection
  - Add limit: 10000 to Accounts and Contacts
  - Fix bulk delete not reflecting immediately (cache issue)
- Production API key error from malformed OpenAI API keys
- Auth issues - handle AuthSessionMissingError gracefully
- Dashboard data fetching optimization with visible widgets in cache key
- Sales Pipeline chart vertical centering

### Changed
- Refine intent classifier patterns and add comprehensive test coverage (28 tests)
- Frontend entity extraction - read from result.data not result
- Entity extraction for bare array tool results (search_leads)
- Extract entity context from URL for suggest_next_actions
- Bind session focus to suggest_next_actions tool
- Force suggest_next_actions tool call when user asks for next steps
- Simplify suggest_next_actions tool description
- Add tools display to LLM Monitor + fix suggest_next_actions routing
- Register suggest_next_actions in Braid toolkit

---

## [3.5.13] - 2025-12-28

### Fixed
- **Lead Search Functionality:** Fixed broken text search in `/api/v2/leads` endpoint
  - Changed from word-splitting logic to full-query pattern matching
  - Search now correctly finds leads like "Iso Check" with query `%Iso Check%`
  - Simplified OR conditions to search across `first_name`, `last_name`, `email`, `company` fields
  - Fixed Supabase PostgREST query chaining issue that caused 0 results

- **Braid SDK searchLeads Tool:** Fixed query parameter passing
  - Updated `braid-llm-kit/examples/assistant/leads.braid` to include `query` in params object
  - AI chat now successfully searches and finds leads by name

- **OpenAI API Authentication:** Fixed invalid API key errors in chat endpoint
  - Updated OpenAI API key from deprecated `sk-svcacct-*` to project key `sk-proj-*`
  - Updated key in three locations: `backend/.env`, `docker-compose.yml`, `system_settings` database
  - Chat endpoint now successfully authenticates and processes requests

### Added
- **Debug Logging:** Added HTTP GET debug logging to Braid SDK
  - Logs full URL, response status, and data keys for troubleshooting
  - Helps identify search result issues and API response structure

### Changed
- **Docker Compose:** Added explicit `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` environment variables to backend service

---

## [3.1.6] - 2025-12-21

### Fixed
- **Braid SDK Endpoint Configuration:** Fixed all Braid .braid tool files to use correct API endpoints
  - Replaced non-existent `/search` endpoints with list endpoints using query parameters
  - Updated accounts.braid: `/api/v2/accounts/search` → `/api/v2/accounts?search=`
  - Updated contacts.braid: `/api/v2/contacts/search` → `/api/v2/contacts`
  - Updated leads.braid: `/api/v2/leads/search` → `/api/v2/leads`
  - Updated opportunities.braid: `/api/v2/opportunities/search` → `/api/v2/opportunities`
  - Updated activities.braid: `/api/v2/activities/search` → `/api/v2/activities`
  - Updated notes.braid: `/api/notes/search` → `/api/notes`

- **Braid Integration URL Configuration:** Fixed `braidIntegration-v2.js` to use correct backend URL
  - Now uses `CRM_BACKEND_URL || BACKEND_URL || 'http://localhost:4001'` for Docker compatibility
  - Fixed `userRole` and `userEmail` variable scoping issue causing `ReferenceError`

- **Braid Test Configuration:** Fixed `braidToolExecution.test.js` BASE_URL for Docker environment
  - Tests now use `CRM_BACKEND_URL` when running inside Docker containers

### Added
- **Braid SDK Scenario Tests:** New comprehensive end-to-end test suite (`braidScenarios.test.js`)
  - 14 scenario tests covering real CRM data retrieval and updates
  - Retrieval scenarios: accounts, contacts, leads, opportunities, activities
  - CRUD scenarios: create, update, multi-entity operations
  - Security scenarios: tenant isolation, permission validation, injection prevention
  - Registry scenarios: tool availability, capability verification
  - Audit scenarios: tool execution logging

### Testing
- All 40 Braid SDK tests passing (14 scenario + 26 execution)

---

## [2.3.6] - 2025-12-14

### Added
- **AI Profile Summary Feature:** Implemented AI-powered executive summaries for lead/contact profiles
  - New endpoint: `POST /api/ai/summarize-person-profile` with 24-hour intelligent caching
  - Prevents excessive LLM API calls by checking cache on both frontend and backend
  - Stores summaries in `public.person_profile` table (column: `ai_summary`) for persistence
  - 24-hour cache validation via `updated_at` timestamp
  - Graceful fallback to basic summary if AI generation fails
  - Integrates with multi-provider LLM engine (OpenAI → Anthropic → Groq failover)
  - Includes profile context: name, company, position, contact info, activity, opportunities, notes

- **Standalone Lead Profile Page:** New standalone page displaying comprehensive lead profiles
  - Route: `GET /leads/:leadId?tenant_id=<tenantId>` (public, no Layout wrapper)
  - Professional report-style layout with sections for contact info, key dates, AI summary, notes, activities, opportunities
  - Fetches profile data from Supabase Edge Function with proper authentication
  - Resolves employee UUIDs to human-readable names via database lookups
  - Includes cached AI-generated summary for each profile

### Fixed
- **AI Summary Route Implementation:** Corrected aiSummary.js module imports and exports
  - Fixed incorrect import of non-existent `supabaseClient.js` → now uses `getSupabaseClient()` from `supabase-db.js`
  - Fixed incorrect import of non-existent `callLLMWithFailover()` → now properly uses `generateChatCompletion()`, `resolveLLMApiKey()`, `selectLLMConfigForTenant()` from AI engine
  - Fixed router mounting in server.js (removed incorrect function call syntax)
  - All AI engine tests pass ✅ (routes, triggers, campaigns)

### Updated
- **Documentation:** Added comprehensive AI architecture and profile feature documentation
  - Updated CLAUDE.md with AI Engine Architecture section
  - Added AI Profile Summaries section to CLAUDE.md (standalone page features and API integration)
  - Updated backend/README.md with AI Profile Summaries endpoint documentation

---

## [2.3.5] - 2025-12-13

### Fixed
- **UUID Validation for System Tenant ID:** Fixed `invalid input syntax for type uuid: "system"` errors after Supabase UUID migration
  - Applied `sanitizeUuidInput()` to convert 'system' literal to NULL for UUID columns
  - Updated `logBackendEvent` in server.js to handle system-level logging with UUID tenant_id column
  - Updated system-logs.js routes (POST and bulk insert endpoints) with UUID validation
  - Uses existing `backend/lib/uuidValidator.js` utility for consistent sanitization
  - Supports optional `SYSTEM_TENANT_ID` environment variable for valid UUID override
  - Eliminates backend startup/shutdown logging errors caused by Supabase best-practice UUID migration

---

## [2.3.4] - 2025-12-13

### Fixed
- **Opportunities Unassigned Filter UUID Error:** Fixed `invalid input syntax for type uuid: ""` in Opportunities v2 backend route
  - Sanitized `assigned_to` filter to use NULL instead of empty string for unassigned opportunities
  - Updated frontend Opportunities.jsx to preserve $or filters via $and merging
  - Prevents UUID parsing errors when filtering by unassigned opportunities

---

## [2.2.37] - 2025-06-19

### Fixed
- **Employee Assignment (assigned_to) Field Migration:** Fixed critical bug where assigning employees to entities failed
  - `assigned_to` column migrated from TEXT (email) to UUID (employee.id) in migration 081
  - Backend routes (contacts, leads, opportunities) now properly handle `assigned_to` and `assigned_to_name` fields
  - `EmployeeSelector` component returns `employee.id` instead of email
  - `DenormalizationHelper` lookups changed from email filter to UUID-based `Employee.get(id)`
  - Removed all `user.email` defaults from entity forms (ContactForm, LeadForm, AccountForm, OpportunityForm, LeadConversionDialog)

- **Employee Scope Filter Not Showing Employees:** Fixed filter dropdown showing empty when employees exist
  - Changed field check from `user_email` to `email || user_email` for proper field detection

### Added
- **Doppler Documentation:** Added secrets management documentation to `copilot-instructions.md`
  - Documented `doppler run -- command` pattern for running commands with secrets
  - Listed key environment variable names (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)

- **Data Cleanup Scripts:** Added utility scripts for clearing entity data
  - `backend/clear-all-data.js` - Clears all customer data from activities, opportunities, contacts, leads, accounts
  - `backend/cleanup-assigned-to.js` - Utility for auditing assigned_to field values

---

## [2.2.36] - 2025-12-10

### Added
  - Activities, Leads, Contacts, Accounts, Opportunities, and BizDevSources pages updated
  - Example: If "Leads" is renamed to "Prospects" in settings, buttons show "Add Prospect" instead of "Add Lead"
  - Dialog titles, tooltips, and empty state messages all use the dynamic labels

- **Automatic GitHub Issue Creation for Critical API Errors:** Production environments now auto-create GitHub issues when critical/high severity API errors occur
  - New `_createGitHubIssueAsync` method in apiHealthMonitor
  - Includes endpoint, error type, context, and suggested fix in issue body
  - Shows toast notification with link to created issue

### Fixed
  - All 4 detection functions (leads, opportunities, activities, hot opportunities) now filter out `is_test_data: true` records
  - Test file `activities.filters.test.js` now correctly marks all test activities as `is_test_data: true`
  - AI suggestion rejection cooldown increased from 24 hours to 7 days

- **AI Suggestions Badge Visibility & Information:**
  - Suggestions now display the actual record name (activity subject, lead name, deal name) instead of generic "activity"
  - Shows days info prominently (e.g., "22 days overdue - Activity is overdue...")

- **Construction Projects Module Bugs:**
  - Fixed `SelectItem` with empty string value causing React warning (now uses `__none__` sentinel value)
  - Fixed `leads.name` column reference (leads table has `first_name`, `last_name`, `company` - not `name`)
  - Form state initialization now uses `__none__` for optional foreign key fields
  - `toNullable` helper converts `__none__` back to `null` before API calls

- **Module Manager Toggle 500 Error:** Fixed when toggling modules that don't have an existing setting record
  - Now creates a new modulesettings record if none exists for tenant + module
  - Migration 098 adds unique constraint on `(tenant_id, module_name)` for proper upsert support

- **Construction Projects Icon:** Changed from generic Building2 to HardHat icon in navigation

### Changed
- **AI Suggestions Cooldown:** Increased from 24 hours to 7 days to reduce notification fatigue

---

## [2.2.35] - 2025-12-10

### Added
- **Construction Projects Module:** New toggleable module for staffing companies supplying workers to construction clients
  - **Database:** Migration 097 adds `construction_projects` and `construction_assignments` tables with full RLS
  - **Backend API:** `/api/construction/projects` and `/api/construction/assignments` endpoints with full CRUD
  - **Frontend Page:** `ConstructionProjects.jsx` with project list, detail panels, and assignment management
  - **Module Manager:** Can be enabled/disabled per tenant via Settings → Module Manager
  - **Features:**
    - Track construction projects with site info, dates, project value, and status
    - Link projects to client Accounts and original Leads
    - Assign Project Manager and Supervisor contacts
    - Manage worker assignments with roles (Laborer, Carpenter, Electrician, etc.)
    - Track pay rates vs bill rates for margin visibility
    - Assignment status tracking (Pending, Active, Completed, Cancelled)
  - **Navigation:** Hard hat icon, accessible to all roles when module is enabled

---

## [2.2.34] - 2025-12-09

### Fixed
- **Navigation Order Per-Tenant Isolation:** Fixed bug where dragging navigation items to reorder affected all tenants
  - Root cause: localStorage keys for navigation order were global (`aisha_crm_nav_order`)
  - Fix: Keys now include tenant ID (`aisha_crm_nav_order_${tenantId}`) for per-tenant isolation
  - Each tenant now has independent navigation item ordering
  - Switching tenants correctly shows that tenant's custom navigation order

---

## [2.2.33] - 2025-12-09

### Added
- **Enhanced View Panels:** All entity view panels now show comprehensive field information
  - Account, Contact, Lead, Opportunity views display all available fields without requiring Edit
  - Activity views unified to use UniversalDetailPanel for consistent styling
  - Fields with no value show helpful placeholder text (e.g., "Not set", "Unassigned")
  - Smart field formatting: currency, percentages, dates, clickable URLs, status badges

- **Description & Notes Contextual Hints:** Added clarifying hints to help users understand field purposes
  - Description: "— What is this about?" (static context for the record)
  - Notes & Activity: "— What happened?" (running log of updates)

- **Cross-Linked Notes for Activities:** When adding a note to an Activity with a related record
  - Note is automatically created on both the Activity AND the related Contact/Account/Lead/Opportunity
  - Related note includes metadata linking back to source activity
  - Keeps all records in sync without manual duplication

- **Activity View Panel Improvements:**
  - Now uses UniversalDetailPanel for consistent styling with other entities
  - Shows all fields: Due Date, Assigned To, Related To, Priority, Location, Duration, Description, Outcome
  - Includes Notes & Activity section with full note management

### Fixed
- **Entity Labels Per-Tenant Isolation:** Fixed critical bug where changing entity labels affected all tenants
  - Root cause: Supabase SQL adapter regex failed when SQL lacked ORDER BY/LIMIT/OFFSET clauses
  - Fixed `extractClause` regex in `supabase-db.js` to include `$` as fallback end pattern
  - EntityLabelsManager now uses global TenantContext correctly

---

## [Unreleased] - 2025-12-06

### Added
- **Multi-Provider LLM Support:** AI engine now supports multiple LLM providers with automatic failover
  - **OpenAI:** gpt-4o, gpt-4o-mini, gpt-4o-realtime-preview
  - **Anthropic:** claude-3-5-sonnet-20241022, claude-3-haiku-20240307
  - **Groq:** llama-3.3-70b-versatile, llama-3.1-8b-instant (or custom models)
  - **Local:** Any OpenAI-compatible server (LM Studio, vLLM, etc.)
  - Configurable failover chain via `LLM_FAILOVER_CHAIN` env var
  - Per-tenant provider overrides via `tenant_integrations` table

- **aiEngine Abstraction Layer:** New `backend/lib/aiEngine/` module for unified LLM access
  - `selectLLMConfigForTenant()` - Gets provider+model config with tenant overrides
  - `callLLMWithFailover()` - Automatic provider failover on errors
  - `resolveLLMApiKey()` - Cascading key resolution (explicit → tenant → system → env)
  - `getProviderDefaultModel()` - Provider-specific model defaults per capability

- **Capability-Based Model Routing:** Models selected by task requirements
  - `chat_tools` - Full tool calling (gpt-4o, claude-3-5-sonnet, llama-3.3-70b)
  - `chat_light` - Quick responses (gpt-4o-mini, claude-3-haiku, llama-3.1-8b)
  - `json_strict` - Structured JSON output
  - `brain_read_only` / `brain_plan_actions` - AI Brain analytics and planning
  - `realtime_voice` - WebRTC voice (OpenAI only)

- **Wake Word Detection:** Hands-free "Hey Aisha" wake word activation for realtime voice
  - New `useWakeWordDetection.js` hook using Web Speech API
  - Recognizes: "Aisha", "Hey Aisha", "Hi Aisha", "AI-SHA", "Isha", "Alisha", "Ayesha"
  - Auto-sleep after 60 seconds of inactivity
  - End phrases: "thanks", "goodbye", "that's all", "done"
  - Wake Word toggle button added to AiSidebar

- **AI Greeting on Activation:** AI now greets user when activated via wake word
  - Added `triggerGreeting()` function to `useRealtimeAiSHA.js`
  - Sends system message to prompt AI to acknowledge with friendly greeting

- **Search Endpoints for All Entities:** Added `/search` endpoints for AI to find records by name
  - `GET /api/leads/search?q=...` - Search leads by name, email, company
  - `GET /api/accounts/search?q=...` - Search accounts by name, industry, website
  - `GET /api/opportunities/search?q=...` - Search opportunities by name, description
  - `GET /api/activities/search?q=...` - Search activities by subject, body, type
  - Added corresponding Braid functions: `searchLeads`, `searchAccounts`, `searchOpportunities`, `searchActivities`
  - Added 15 new tests across 5 test files

- **Stage Filter for Opportunities:** `GET /api/opportunities` now supports `stage` query parameter

### Fixed
- **Braid Syntax Errors:** Fixed critical syntax errors preventing 33 tools from loading
  - Removed `type:` reserved keyword usage in `activities.braid`
  - Removed unsupported `if` statements from `leads.braid`, `activities.braid`, `workflows.braid`
  - Simplified `callContact` function in `telephony.braid` (removed `return` in match arms)
  - **Before:** 27 tools loaded; **After:** 48 tools loaded

- **Status/Stage Filter Handling:** Backend routes now properly ignore "all"/"any" filter values
  - `leads.js` - status filter ignores "all", "any", ""
  - `activities.js` - status filter ignores "all", "any", ""
  - `opportunities.js` - stage filter ignores "all", "any", ""

### Changed
- **Tool Descriptions:** Updated all `list_*` tool descriptions with clarification and limit guidance
  - AI now prompted to ask user for status/stage preference before listing
  - If >5 results, AI summarizes count and refers user to UI for full list

- **System Prompt:** Added "LISTING DATA - CLARIFICATION & LIMITS" section
  - Explicit rules about asking for filter preferences
  - 5-item limit for voice/chat responses
  - Never read out more than 5 items - refer to UI for browsing

### Documentation
- Added `docs/SESSION_HANDOFF_20251206.md` for session continuity

---

## [2.1.41] - 2025-01-31

### Fixed
- **AI Tenant Context Resolution:** AI assistant now uses authenticated user's assigned `tenant_id` as the primary source
  - Previously relied on `localStorage.selected_tenant_id` which could be stale or wrong
  - Regular users without TenantSwitcher now automatically get correct tenant context
  - Modified `useAiSidebarState.jsx` to import `useUser()` and pass user to context resolver
  - Updated `resolveTenantContext()` to prioritize `user.tenant_id` over localStorage
  - Fixed `commandRouter.ts` to pass `context.tenantId` to the API call
  - Added debug logging to `functions.js` to trace tenant source (dev mode only)

- **[CRITICAL] Braid Tool Tenant Injection:** Fixed AI tools (create, update, delete) using wrong tenant
  - `normalizeToolArgs()` was only injecting tenant for LIST operations (snapshot, list_leads, etc.)
  - CREATE, UPDATE, DELETE tools were NOT receiving the authorized tenant context
  - Now ALL Braid tools receive the server-side authorized tenant, regardless of what AI passes
  - Added security warning log when AI attempts to pass a different tenant than authorized
  - This prevents AI from creating records in wrong tenants (e.g., Labor Depot instead of Local Dev)

### Security
- **Superadmin Tenant Restriction:** Superadmins are now restricted to their assigned tenant in AI routes
  - Previously superadmins bypassed all tenant checks and could access any tenant
  - Now ALL users (including superadmins) are bound to their `user.tenant_id`
  - This keeps everyone in proper tenant context with no global AI access
  - Superadmins can still use TenantSwitcher UI to view other tenants, but AI stays scoped

### Added
- **Activity Tools for AI:** Added missing `list_activities` and `get_activity_details` Braid tools
  - AI can now list all activities with status/limit filters
  - AI can get details of a specific activity by ID
  - Registered new tools in `braidIntegration-v2.js` with proper parameter order
  - Added functions to `activities.braid` file

- **Entity Details Tools for AI:** Added missing "get details" tools for all major entities
  - `get_lead_details` - Retrieve full details of a specific lead by ID
  - `get_opportunity_details` - Retrieve full details of a specific opportunity by ID
  - `get_contact_details` - Retrieve full details of a specific contact by ID
  - `get_note_details` - Retrieve full details of a specific note by ID
  - All tools registered in `TOOL_REGISTRY` and `BRAID_PARAM_ORDER`
  - Functions added to respective `.braid` files (leads, opportunities, contacts, notes)

- **Wake Word Detection:** Added hands-free "Hey Aisha" wake word activation for realtime voice
  - New `useWakeWordDetection` hook using Web Speech API (free, browser-native)
  - Wake words: "Aisha", "Hey Aisha", "Hi Aisha" (and common mishearings)
  - End phrases: "Thanks", "Thank you", "Goodbye", "That's all" - returns to listening mode
  - Auto-sleep timeout after 60 seconds of silence
  - Visual indicator shows listening status (pulsing green dot when waiting for wake word)
  - "Wake Word" toggle button in AiSidebar - enables continuous background listening
  - When wake word detected: activates realtime voice session automatically
  - When end phrase detected: gracefully ends session and returns to standby

---

## [Unreleased]

### Added
- Phase 4 closure documentation

### Security
- **[CRITICAL] AI Tenant Authorization:** Added `validateUserTenantAccess` helper function to `ai.js` routes
  - Prevents cross-tenant data access via AI assistant
  - All AI conversation and chat endpoints now validate user is authorized for requested tenant
  - Superadmins can access any tenant; other roles restricted to their assigned tenant
  - Returns friendly error messages for unauthorized access attempts
  - Comprehensive security logging for blocked access attempts
  - Secured endpoints: `/conversations`, `/conversations/:id`, `/conversations/:id/messages`, `/conversations/:id/stream`, `/chat`, `/snapshot-internal`

- **[CRITICAL] Braid Tool Access Token:** Added `TOOL_ACCESS_TOKEN` contract to `braidIntegration-v2.js`
  - Acts as a "key to the toolshed" - tools cannot execute without a valid access token
  - Token is only provided after tenant authorization passes in `ai.js`
  - Double-layer security: authorization must pass AND token must be present
  - All `executeBraidTool` calls now require the access token parameter
  - Invalid/missing tokens are logged and blocked with friendly error messages

---

## [1.1.x] - December 4, 2025

### Phase 4 – Full Cutover Complete

#### Changed
- **AiSHA Executive Avatar:** New branded portrait applied across all AI assistant surfaces
  - `AiSidebar.jsx` - Main assistant panel hero
  - `AiAssistantLauncher.jsx` - Header pill avatar
  - `AvatarWidget.jsx` - Floating avatar widget
  - `FloatingAIWidget.jsx` - Secondary floating widget
  - `AIAssistantWidget.jsx` - Legacy widget (updated)
  - `AgentChat.jsx` - Agent chat interface (updated)
  - `Layout.jsx` - Navigation sidebar (updated)

#### Fixed
- Legacy `/aisha-avatar.jpg` references migrated to `/assets/aisha-executive-portrait.jpg`
- Documentation updated with correct avatar paths

#### Documentation
- Created `PHASE_4_CLOSURE_SUMMARY.md`
- Created `BRANDING_GUIDE.md`
- Created `UI_STANDARDS.md`
- Created `ASSET_LICENSES.md`
- Updated `AISHA_ASSISTANT_USER_GUIDE.md`
- Updated `AISHA_CRM_DEVELOPER_MANUAL.md`

---

## [1.1.9] - November 29, 2025

### Security & Monitoring Improvements

#### Fixed
- MCP/N8N container health check false negatives
- IDR dashboard blocked IPs display
- False positive bulk extraction alerts

#### Added
- External threat intelligence integration (GreyNoise, AbuseIPDB)
- Blocked IPs management UI in Internal Performance Dashboard

#### Changed
- Renamed duplicate "Security" tabs to "Auth & Access" and "Intrusion Detection"

---

## [1.0.95] - November 28, 2025

### Dashboard Fixes

#### Fixed
- Phantom counts showing incorrect data when tables empty
- Cross-tenant cache leakage in dashboard bundle
- Superadmin global view regression

---

## [1.0.92] - November 27, 2025

### Performance

#### Fixed
- Tenant resolution cache consolidated to single canonical resolver
- AI routes now use shared cache (previously bypassed)

---

## [1.0.91] - November 27, 2025

### Integrations

#### Fixed
- GitHub health issue reporter idempotency
- Duplicate issue prevention with Redis-backed deduplication
- Retry logic with exponential backoff

---

## [1.0.90] - November 26, 2025

### MCP/Braid Integration

#### Fixed
- MCP connectivity restored in production
- Health proxy endpoint enhanced with diagnostics
- GitHub token injection for container authentication

---

## [1.0.75] - November 26, 2025

### API

#### Added
- Backend endpoint for `generateUniqueId` function
- Eliminated console warnings in production

---

## [1.0.74] - November 25, 2025

### Infrastructure

#### Fixed
- `APP_BUILD_VERSION` runtime injection via `env-config.js`
- Tenant/employee fetch failures resolved

---

## [Earlier Versions]

See `orchestra/PLAN.md` for detailed history of bugfixes and features.

---

*This changelog was created as part of Phase 4 closure on December 4, 2025.*
