# CHANGELOG

All notable changes to Aisha CRM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
