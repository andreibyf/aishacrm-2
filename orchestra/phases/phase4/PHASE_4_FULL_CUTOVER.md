# Phase 4: Full Cutover (Months 7-8)

> Current framing (2025): **Internal Readiness (pre-customer)**. This plan still describes a full external v2.0.0 launch and v1 deprecation, but in the near term we are using Phase 4 to harden a few key flows (e.g., opportunities + activities) and make API Health solid for the Local Development Tenant.

**Status**: Not Started  
**Depends On**: Phase 3 (Autonomous Operations)  
**Target Start**: July 2026  
**Target End**: August 2026  
**Owner**: Engineering Lead + Product Manager

---

## Objectives

Complete v2.0.0 launch and v1 deprecation:
1. Migrate all remaining endpoints to v2 AI-enhanced
2. Add deprecation warnings to v1 endpoints
3. Prepare v2.0.0 launch materials and documentation
4. Execute launch and support 6-month v1 sunset

---

## Detailed Tasks

### Week 1-2: Remaining Endpoint Migration

#### Task 4.1: Endpoint Audit & Planning
- [ ] List all v1-style endpoints still in use
- [ ] Prioritize by usage (API analytics, logs)
- [ ] Create migration checklist per endpoint/cluster
- [ ] Identify breaking changes needed
- [ ] Document v1 → v2 mapping
- [ ] Flag AI-dependent vs. "plain" endpoints

> This section is intended as a **living audit**, not a one-shot task. Start by capturing the high-priority domains below, then expand per endpoint as we touch each area.

**Migration Checklist Template (per endpoint or cluster)**:
```markdown
## Endpoint: POST /api/v1/opportunities

### Current v1 Behavior
- Input: Basic opportunity fields
- Output: Created opportunity object
- Auth/tenant rules: [e.g., tenant-scoped by `tenant_id`, RLS via Supabase]

### v1 Consumers
- Frontend components: [e.g., Deal create form, pipeline board]
- Background jobs: [e.g., campaign worker, workflows]
- External integrations: [e.g., n8n, webhooks]

### v2 Target Behavior / AI Enhancements
- [x] AI-powered deal health score on creation
- [x] Automatic related account/contact suggestions
- [x] Win probability estimation
- [x] Suggested next steps
- [ ] Competitive intelligence integration (future)

### Breaking Changes / Contracts
- Response includes `aiContext` object (new)
- `stage` field now requires enum value (was free text)
- Error surface / codes: [e.g., stricter validation, 422 on bad enums]

### Migration Path
1. Create `/api/v2/ai/opportunities` (or equivalent) endpoint
2. Add AI enrichment middleware / Braid tool hooks
3. Update response schema + OpenAPI / API docs
4. Update all known consumers (frontend, workers, integrations)
5. Write tests (unit + integration + happy-path E2E)
6. Deploy behind feature flag or tenant allowlist

### Operational Notes
- Telemetry: [what to log, how to compare v1 vs v2]
- Rollback: [conditions + how to revert to v1 behavior]

### Estimated Effort: T-shirt size (S/M/L)
```

**Initial High-Priority Domains to Audit**

These are **starting points**, not an exhaustive list. As we dig into routes and Supabase functions, expand this into a full table.

- Opportunities (full CRUD, pipeline, forecasts)
- Activities (calls, emails, meetings, tasks)
- Contacts & Accounts (core CRM objects)
- Documents / Files (storage, AI summaries, embeddings)
- Reports & Dashboards (aggregates, AI insights)
- Workflows & Workflow Executions
- System & Module Settings (feature flags, AI knobs)
- Integrations (GitHub issues, telephony, third-party CRMs)
- Webhooks (including v2 AI event hooks)
- Memory / AI-specific endpoints (sessions, transcripts, tools)

**Seed Audit: Opportunities Domain (Example)**

This table seeds the audit for the opportunities domain based on `backend/routes/opportunities.js`. Populate the remaining columns as we introduce explicit v2 routes or AI layers.

| Area                | Current Route                    | Style  | Notes / v2 Target                                      |
|---------------------|----------------------------------|--------|--------------------------------------------------------|
| List opportunities  | `GET /api/opportunities`         | v1-ish | Supabase `opportunities` query by `tenant_id`, filter + count; candidate for AI sort/prioritization and deal health surfacing. |
| Create opportunity  | `POST /api/opportunities`        | v1-ish | Basic create with numeric `probability`; future: AI-enriched default stage/amount/probability + suggested next steps. |
| Get opportunity     | `GET /api/opportunities/:id`     | v1-ish | Tenant-scoped fetch; future: include `aiContext` (health, risks, next-best-actions). |
| Update opportunity  | `PUT /api/opportunities/:id`     | v1-ish | Manual field updates; future: AI-assisted field updates and change summaries. |
| Delete opportunity  | `DELETE /api/opportunities/:id`  | v1-ish | Hard delete; v2 should confirm impact (activities, forecasts) and optionally soft-delete. |

> Follow-up: create a dedicated `opportunities` section in a separate audit doc or appendix if this table grows large; keep Phase 4 doc high-level and link out.

**Seed Audit: Activities Domain**

Based on `backend/routes/activities.js`.

| Area                | Current Route                 | Style  | Notes / v2 Target                                                   |
|---------------------|-------------------------------|--------|---------------------------------------------------------------------|
| List activities     | `GET /api/activities`         | v1-ish | Supabase `activities` list by `tenant_id`, rich metadata; candidate for AI-ranked agenda and follow-up queue. |
| Create activity     | `POST /api/activities`        | v1-ish | Creates generic activity (calls, tasks, emails); v2 can auto-fill details from AI (duration, outcome, summaries). |
| Get activity        | `GET /api/activities/:id`     | v1-ish | Fetch single activity; v2 could attach AI call/email summaries and sentiment. |
| Update activity     | `PUT /api/activities/:id`     | v1-ish | Manual updates; v2 can suggest status changes, due dates, and owners. |
| Delete activity     | `DELETE /api/activities/:id`  | v1-ish | Hard/soft delete; consider AI impact on pipelines and reminders. |

**Seed Audit: Accounts Domain**

Based on `backend/routes/accounts.js`.

| Area                | Current Route                | Style  | Notes / v2 Target                                                   |
|---------------------|------------------------------|--------|---------------------------------------------------------------------|
| List accounts       | `GET /api/accounts`          | v1-ish | Cached list by `tenant_id`/`type`; v2: AI-prioritized account list, risk flags, upsell opportunities. |
| Create account      | `POST /api/accounts`         | v1-ish | Basic create with metadata; v2: AI-enriched firmographics and duplicate detection. |
| Get account         | `GET /api/accounts/:id`      | v1-ish | Single account fetch; v2: roll up AI signals from activities, opportunities, and support history. |
| Update account      | `PUT /api/accounts/:id`      | v1-ish | Field updates; v2: AI suggestions for ideal customer profile fields and health. |
| Delete account      | `DELETE /api/accounts/:id`   | v1-ish | Delete account; v2 should gate on dependent contacts/opps and archive instead. |

**Seed Audit: Contacts Domain**

Based on `backend/routes/contacts.js`.

| Area                | Current Route                | Style  | Notes / v2 Target                                                   |
|---------------------|------------------------------|--------|---------------------------------------------------------------------|
| List contacts       | `GET /api/contacts`          | v1-ish | Tenant-scoped list with filters and search; v2: AI-ranked people to engage today, plus smart segments. |
| Create contact      | `POST /api/contacts`         | v1-ish | Basic person record with tags/metadata; v2: AI enrichment (job title, LinkedIn, company) and dedupe. |
| Get contact         | `GET /api/contacts/:id`      | v1-ish | Single contact view; v2: full timeline + AI summary and relationship strength. |
| Update contact      | `PUT /api/contacts/:id`      | v1-ish | Field updates; v2: suggestions for best channel/time to contact and compliance flags. |
| Delete contact      | `DELETE /api/contacts/:id`   | v1-ish | Delete/archive; v2: ensure linked activities/opps are preserved with reassignment strategy. |

**Seed Audit: Leads Domain**

Based on `backend/routes/leads.js`.

| Area                | Current Route             | Style  | Notes / v2 Target                                                   |
|---------------------|---------------------------|--------|---------------------------------------------------------------------|
| List leads          | `GET /api/leads`          | v1-ish | Tenant-scoped list with status/source filters; v2: AI scoring, prioritization, and routing suggestions. |
| Create lead         | `POST /api/leads`         | v1-ish | Lead capture from forms/imports; v2: enrichment (firmographics), spam detection, and auto-qualification. |
| Get lead            | `GET /api/leads/:id`      | v1-ish | Single lead record; v2: AI summary + next-best-action and objection handling hints. |
| Update lead         | `PUT /api/leads/:id`      | v1-ish | Status/field updates; v2: AI-assisted stage transitions and playbook recommendations. |
| Delete/convert lead | `DELETE /api/leads/:id`   | v1-ish | Delete/archive; v2 should prefer convert-to-contact/account/opportunity flows with AI guidance. |

**API Health & Monitoring Coverage (for audited endpoints)**

For each audited domain/endpoint cluster above, ensure we can **observe and test** behavior similarly to existing API Health tools under Settings:

- [ ] Add or update API Health checks for each new `/api/v2/...` endpoint (where applicable)
- [ ] Verify latency, error rate, and auth/tenant failures are surfaced in API Health dashboards
- [ ] Include v1 vs v2 comparison checks for migrated endpoints (status codes, payload shape)
- [ ] Wire basic synthetic tests (ping + simple happy-path) for critical domains (opportunities, activities, accounts, contacts, leads)
- [ ] Document test harness locations (e.g., Postman collections, Playwright/API tests, or in-app health probes)

**Deliverable**: Living migration inventory doc + initial v1 → v2 mapping and priorities, with API Health coverage items identified for all audited domains

---

#### Task 4.2: Batch Endpoint Migration (Priority 1)
- [ ] Migrate opportunities endpoints (5 endpoints)
- [ ] Migrate activities endpoints (4 endpoints)
- [ ] Migrate documents endpoints (3 endpoints)
- [ ] Migrate reports endpoints (4 endpoints)
- [ ] Add AI context to all responses

**Sprint Structure** (2 weeks):
- Week 1: Opportunities + Activities
- Week 2: Documents + Reports

**Quality Gates**:
- All tests passing (unit + integration)
- AI enrichment latency <200ms
- Backward compatibility preserved (where possible)
- API docs updated

**Deliverable**: 16 v2 endpoints live and tested

> Phase 4A: **Internal Pilot Focus** (pre-customer) – For now, treat Task 4.2 as primarily about hardening two internal flows (Opportunities + Activities) and ensuring they show up cleanly in API Health for the Local Development Tenant. Documents/Reports and broader external migration work remain future-facing until real tenants exist.

---

### Week 3-4: Deprecation Strategy

#### Task 4.3: Deprecation Warning System
- [ ] Add `X-API-Version` header to all v1 responses
- [ ] Create deprecation warning middleware
- [ ] Build notification system for v1 API users
- [ ] Add sunset timeline to response headers
- [ ] Create migration guide for each endpoint

**Response Headers**:
```http
HTTP/1.1 200 OK
X-API-Version: v1
X-API-Deprecation-Date: 2027-02-01
X-API-Sunset-Date: 2027-08-01
X-Migration-Guide: https://docs.aishacrm.com/api/v2/migration
Link: </api/v2/ai/accounts>; rel="alternate"
```

**In-App Notifications**:
```javascript
// For users making v1 API calls
notification: {
  type: "warning",
  title: "API v1 Deprecation Notice",
  message: "You're using API v1 which will be retired on August 1, 2027. Migrate to v2 for AI-enhanced features.",
  actions: [
    { label: "View Migration Guide", link: "/docs/api-v2-migration" },
    { label: "Dismiss for 7 days", action: "snooze" }
  ]
}
```

**Deliverable**: Deprecation warnings active on all v1 endpoints

---

#### Task 4.4: Backward Compatibility Mode
- [ ] Create compatibility layer for breaking changes
- [ ] Add v1 → v2 request/response transformers
- [ ] Build toggle for "strict v2" vs "compatibility mode"
- [ ] Document compatibility limitations
- [ ] Add telemetry for compatibility mode usage

**Compatibility Examples**:
```javascript
// v1 request with free-text stage
{
  "name": "Acme Deal",
  "stage": "Talking to decision maker"  // Free text
}

// Compatibility layer transforms to v2
{
  "name": "Acme Deal",
  "stage": "qualification",  // Enum (AI-inferred from text)
  "_v1_legacy_stage": "Talking to decision maker"
}

// v2 response includes AI context
{
  "id": "123",
  "name": "Acme Deal",
  "stage": "qualification",
  "aiContext": { ... },  // New in v2
  "_compatibility_mode": true  // Flag for client
}

// Compatibility mode removes aiContext for v1 clients
{
  "id": "123",
  "name": "Acme Deal",
  "stage": "qualification"
  // aiContext stripped for v1 compatibility
}
```

**Deliverable**: 95% of v1 clients work with v2 backend

---

### Week 5-6: Launch Preparation

#### Task 4.5: Documentation Overhaul
- [ ] Write comprehensive API v2 documentation
- [ ] Create interactive API playground
- [ ] Build migration tutorials (video + written)
- [ ] Update SDK code examples (Python, Node.js)
- [ ] Create v1 → v2 diff documentation

**Documentation Structure**:
```
/docs/api/v2/
├── getting-started.md           # Quick start guide
├── authentication.md            # API keys, OAuth
├── ai-context.md               # Understanding AI responses
├── endpoints/
│   ├── accounts.md
│   ├── contacts.md
│   ├── leads.md
│   └── ...
├── migration/
│   ├── v1-to-v2-guide.md       # Step-by-step migration
│   ├── breaking-changes.md     # All breaking changes listed
│   └── compatibility-mode.md   # How to use compatibility layer
└── examples/
    ├── python-sdk.md
    ├── nodejs-sdk.md
    └── rest-api-examples.md
```

**Deliverable**: Complete API v2 documentation portal

---

#### Task 4.6: v2.0.0 Launch Marketing
- [ ] Create launch announcement blog post
- [ ] Record product demo video (10 min)
- [ ] Design infographics (AI-first features)
- [ ] Plan webinar series (3 sessions)
- [ ] Build case studies (beta user success stories)

**Launch Messaging**:
- **Headline**: "AI-SHA 2.0: Your AI Executive Assistant is Here"
- **Key Points**:
  - AI is now core, not optional
  - Natural language interface (talk to your CRM)
  - Proactive suggestions (AI tells you what to do next)
  - Predictive analytics (know outcomes before they happen)
  - Autonomous operations (AI works while you sleep)

**Launch Assets**:
- Blog post: 1,500 words with screenshots
- Video: 10-minute feature tour
- Webinars: "Intro to v2.0" (Week 1), "Advanced AI Features" (Week 2), "API Migration" (Week 3)
- Email campaign: 3-part series to all users
- Social media: 10-post campaign

**Deliverable**: All launch materials ready 1 week before launch

---

### Week 7: v2.0.0 Launch

#### Task 4.7: Production Deployment
- [ ] Final QA testing on staging
- [ ] Deploy v2 backend to production
- [ ] Enable v2 frontend (with v1 fallback toggle)
- [ ] Monitor error rates and performance
- [ ] On-call rotation for launch support (48 hours)

**Deployment Checklist**:
```markdown
## Pre-Deployment (T-24 hours)
- [x] All tests passing (unit, integration, E2E)
- [x] Load testing completed (2x expected traffic)
- [x] Database migrations tested
- [x] Rollback plan documented
- [x] Monitoring dashboards configured
- [x] On-call team briefed

## Deployment (T-0)
- [x] Deploy backend v2 (blue-green deployment)
- [x] Smoke tests pass
- [x] Enable v2 for 5% of users (canary)
- [x] Monitor for 1 hour
- [x] Ramp to 25% (if no issues)
- [x] Monitor for 2 hours
- [x] Ramp to 100%

## Post-Deployment (T+2 hours)
- [x] All dashboards green
- [x] Error rate <0.5%
- [x] Performance within SLA
- [x] User feedback positive
- [x] Announce launch (blog, email, social)

## Rollback Criteria
- Error rate >2%
- Critical feature broken
- Performance degradation >20%
- Database migration failure
```

**Deliverable**: v2.0.0 live in production with <0.5% error rate

---

#### Task 4.8: Launch Day Support
- [ ] Monitor support tickets (real-time)
- [ ] Triage critical issues (P0/P1)
- [ ] Hotfix deployment process ready
- [ ] Communicate with users (status updates)
- [ ] Collect initial feedback

**Support War Room**:
- Engineering Lead (coordinator)
- Backend Engineer (on-call)
- Frontend Engineer (on-call)
- Product Manager (user liaison)
- Support Lead (ticket triage)

**Communication Channels**:
- Status page: https://status.aishacrm.com
- Twitter: @AishaCRM (updates every 2 hours)
- In-app banner: "v2.0.0 launched! Report issues here"
- Slack channel: #v2-launch-support

**Deliverable**: 24-hour post-launch report

---

### Week 8: Post-Launch & v1 Sunset

#### Task 4.9: v1 Sunset Timeline Communication
- [ ] Email all v1 API users (3-month warning)
- [ ] Add deprecation banners to v1 UI (if still available)
- [ ] Offer migration assistance (white-glove service)
- [ ] Track v1 usage decline
- [ ] Set v1 sunset date (6 months post-launch)

**Sunset Schedule**:
```
Launch Day (August 1, 2026):
- v2.0.0 live
- v1 still available with deprecation warnings

+3 months (November 1, 2026):
- Final warning to v1 users
- v1 usage should be <20%

+6 months (February 1, 2027):
- v1 sunset date
- v1 endpoints return 410 Gone (with migration link)
- Compatibility mode still available for 3 more months

+9 months (May 1, 2027):
- Compatibility mode disabled
- Pure v2 only
```

**Deliverable**: v1 sunset plan executed, <5% users still on v1

---

#### Task 4.10: Retrospective & Lessons Learned
- [ ] Conduct Phase 4 retrospective (team)
- [ ] Collect user feedback (survey + interviews)
- [ ] Analyze metrics vs. targets
- [ ] Document lessons learned
- [ ] Plan v2.1 roadmap (iterative improvements)


**Retrospective Questions**:
- What went well?
- What could have been better?
- What surprised us?
- What should we do differently next time?
- What risks didn't materialize?
- What new risks emerged?

**Deliverable**: Retrospective document + v2.1 roadmap draft

#### Task 4.11: AiSHA Executive Assistant Branding & Avatar Cutover

- [ ] Finalize AiSHA Executive Assistant visual identity:
  - [ ] Primary executive-assistant portrait (hero image) for the AI panel
  - [ ] Compact circular avatar for header pill / launcher (“Ask AiSHA anything – Voice ready”)
  - [ ] Fallback icon for low-bandwidth / no-image environments
- [ ] Replace legacy avatar image in all surfaces:
  - [ ] Top header AiSHA pill (left-side “Ask AiSHA anything” area)
  - [ ] AiSidebar.jsx (full-screen right-hand assistant panel)
  - [ ] AiAssistantLauncher / Floating widgets
  - [ ] Any legacy AIAssistantWidget/CommandPaletteWidget entry points still exposed
- [ ] Align header pill + tenant badge:
  - [ ] Ensure avatar, assistant name, status (“Voice ready”), tenant selector, and “Managing Client” badge are vertically centered and visually balanced.
  - [ ] Confirm layout works at common breakpoints (1280, 1440, 1920).
- [ ] Update AI panel hero section:
  - [ ] Use the new executive-assistant portrait as the primary visual in the panel intro state.
  - [ ] Ensure image scales gracefully and does not interfere with message bubbles or voice controls.
  - [ ] Maintain dark/light theme contrast and accessibility (AA) for text over/around the portrait.
- [ ] Regression pass:
  - [ ] Verify avatar loads correctly for all tenants and roles.
  - [ ] Verify no impact to realtime voice, Braid tools, or autonomous operations.
  - [ ] Confirm all snapshots / storybook stories updated (if applicable).

**Deliverable**: Consistent AiSHA Executive Assistant branding and avatar usage across header, AI panel, and launchers, with pixel-correct alignment at cutover.


---

## Testing & Validation

### Regression Testing
- [ ] All v1 functionality still works in compatibility mode
- [ ] v2 endpoints backward compatible where feasible
- [ ] No breaking changes to v1 API contracts
- [ ] Performance not degraded vs. v1

### Load Testing
- [ ] 2x expected traffic (1,000 req/sec sustained)
- [ ] Spike testing (10x traffic for 5 minutes)
- [ ] AI enrichment doesn't cause timeouts
- [ ] Database query performance acceptable

### User Acceptance Testing
- [ ] 50 beta users test v2 for 2 weeks
- [ ] Critical user journeys completed successfully
- [ ] No blockers for daily workflows
- [ ] Positive feedback on AI features

---

## Success Metrics

### Technical Metrics
- [ ] v2.0.0 launches with <0.5% error rate
- [ ] Performance within 10% of v1 (no regression)
- [ ] 99.9% uptime in first month
- [ ] <50 P0/P1 bugs in first week

### Adoption Metrics
- [ ] 80% of users try v2 features in first week
- [ ] 60% of users prefer v2 over v1 (survey)
- [ ] 50% of API calls switch to v2 in first month
- [ ] <5% of users still on v1 at 6-month mark

### Business Metrics
- [ ] User satisfaction (NPS) increases by 20 points
- [ ] Customer retention improves by 10%
- [ ] Average revenue per user (ARPU) increases by 15%
- [ ] Support tickets decrease by 25% (easier to use)

---

## Dependencies

### Infrastructure
- Production servers sized for 2x load
- Database replication lag <1s
- CDN configured for v2 assets
- Monitoring tools upgraded (New Relic, Sentry)

### External Services
- OpenAI API upgraded to higher tier
- MCP server scaled to 3 instances (HA)
- Pinecone vector DB production plan

---

## Acceptance Criteria

### Must Have
- ✅ All endpoints migrated to v2 with AI enrichment
- ✅ v1 deprecation warnings active
- ✅ Backward compatibility mode working
- ✅ Complete API v2 documentation
- ✅ v2.0.0 launched successfully (<0.5% error rate)

### Nice to Have
- 🎯 Interactive API playground
- 🎯 Migration automation tools (code generators)
- 🎯 v1 → v2 diff visualization
- 🎯 White-glove migration service for enterprise customers

---

## Rollout Plan

### Week 7: Launch Week
- **Day 1 (Tuesday)**: Deploy to production, 5% canary
- **Day 2 (Wednesday)**: Ramp to 25%
- **Day 3 (Thursday)**: Ramp to 50%
- **Day 4 (Friday)**: Ramp to 100%, announce launch
- **Weekend**: Monitor, emergency hotfixes if needed

### Week 8: Post-Launch
- Collect feedback, triage bugs
- Plan v2.1 improvements
- Begin v1 sunset communication

### Months 2-6: v1 Sunset
- Gradual decline of v1 usage
- White-glove migration assistance
- Final v1 sunset at 6-month mark

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Critical bug in v2 | Critical | Low | Rollback plan ready, blue-green deployment |
| Users resist v2 | High | Medium | Keep v1 available, gradual migration, training |
| Performance issues under load | High | Medium | Load testing pre-launch, auto-scaling |
| AI model downtime | Medium | Low | Graceful degradation, fallback to v1 behavior |
| Migration errors (v1 → v2) | Medium | Medium | Compatibility mode, migration tools, support |

---

## Post-Launch Roadmap (v2.1+)

### Immediate (v2.1 - Month 2)
- Bug fixes from launch feedback
- Performance optimizations
- Additional AI model training (more data)

### Short-term (v2.2 - Month 4)
- More autonomous actions (with user approval)
- Multi-language support (Spanish, French)
- Mobile app with AI chat

### Long-term (v3.0 - 12 months)
- Full autonomous mode (AI operates without prompting)
- Multi-modal AI (image analysis for documents)
- Voice-first interface (no screen needed)

---

**Phase Owner**: [Engineering Lead Name]  
**Last Updated**: November 29, 2025  
**Status**: Ready for Review
