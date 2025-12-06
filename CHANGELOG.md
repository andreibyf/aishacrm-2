# CHANGELOG

All notable changes to Aisha CRM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
