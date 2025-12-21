# Phase 1: Foundation (Months 1-2)

**Status**: Not Started  
**Target Start**: January 2026  
**Target End**: February 2026  
**Owner**: Backend Team + AI Integration Team

---

## Objectives

Establish the technical foundation for AI-first architecture:
1. Build `/api/v2/ai/*` endpoint structure parallel to v1
2. Create AI router middleware for request enrichment
3. Set up MCP server as production service
4. Add AI context enrichment to 3 core entities (accounts, contacts, leads)

---

## Detailed Tasks

### Week 1-2: API v2 Foundation

#### Task 1.1: Create v2 API Structure
- [ ] Create `backend/routes/v2/` directory structure
- [ ] Set up v2 router in `backend/server.js`
- [ ] Add version detection middleware
- [ ] Create v2 response wrapper utility
- [ ] Add OpenAPI spec for v2 endpoints

**Files to Create**:
```
backend/routes/v2/
├── index.js                 # v2 router aggregator
├── aiRouter.js             # AI routing middleware
├── accounts.js             # AI-enhanced accounts endpoints
├── contacts.js             # AI-enhanced contacts endpoints
├── leads.js                # AI-enhanced leads endpoints
└── intent.js               # Natural language intent endpoints
```

**Deliverable**: `/api/v2/health` endpoint returning AI service status

---

#### Task 1.2: AI Context Response Schema
- [ ] Define `AIContext` TypeScript interface
- [ ] Create `enrichResponse()` utility function
- [ ] Add confidence scoring system
- [ ] Build suggestion generation framework
- [ ] Add prediction result formatting

**Schema**:
```typescript
interface AIContext {
  confidence: number;              // 0.0 to 1.0
  suggestions: ActionSuggestion[]; // Recommended next actions
  predictions?: PredictionResult;  // Optional predictions
  insights: string[];              // Human-readable insights
  relatedItems: RelatedItem[];     // Context-aware related data
  processingTime: number;          // AI processing time in ms
}

interface ActionSuggestion {
  action: string;                  // Action identifier
  priority: 'low' | 'medium' | 'high';
  reason: string;                  // Explanation for suggestion
  confidence: number;              // Confidence in this suggestion
}
```

**File**: `backend/types/aiContext.js`

**Deliverable**: Response wrapper working with all v2 endpoints

---

### Week 3-4: AI Router Middleware

#### Task 1.3: Build AI Router Core
- [ ] Create `backend/lib/aiRouter.js`
- [ ] Add request interception logic
- [ ] Build intent detection using OpenAI function calling
- [ ] Add context extraction from request body
- [ ] Create response enrichment pipeline

**Core Functions**:
```javascript
// backend/lib/aiRouter.js
async function enrichRequest(req) {
  // Parse intent from request
  // Extract entities and parameters
  // Build context object
}

async function enrichResponse(data, context) {
  // Generate suggestions based on data
  // Add predictions if applicable
  // Format insights
  // Return AI-enhanced response
}

async function routeThrough AI(req, res, next) {
  // Intercept request
  // Enrich with AI context
  // Pass to handler
  // Enrich response before sending
}
```

**Dependencies**:
- OpenAI SDK >= 4.0
- Add `OPENAI_API_KEY` to `.env`

**Deliverable**: Middleware functional on test endpoint

---

#### Task 1.4: OpenAI Integration
- [ ] Set up OpenAI client wrapper
- [ ] Create function calling schemas for CRM entities
- [ ] Build prompt templates for intent parsing
- [ ] Add error handling and fallbacks
- [ ] Implement rate limiting and retry logic

**File**: `backend/lib/openaiClient.js`

**Function Schemas**:
```javascript
// Example: Account creation intent
{
  name: "create_account",
  description: "Create a new account in the CRM",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Account name" },
      industry: { type: "string", description: "Industry sector" },
      // ... more fields
    },
    required: ["name"]
  }
}
```

**Deliverable**: OpenAI client working with intent detection

---

### Week 5-6: MCP Server Production Setup

#### Task 1.5: MCP Production Configuration
- [ ] Review `braid-mcp-node-server/docker-compose.yml`
- [ ] Add health check endpoints
- [ ] Configure auto-restart policies
- [ ] Set up monitoring and alerting
- [ ] Document MCP production requirements

**Configuration Updates**:
```yaml
# docker-compose.yml (update existing)
services:
  braid-mcp-node-server:
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 1GB
        reservations:
          memory: 512MB
```

**Deliverable**: MCP server running with 99.5% uptime guarantee

---

#### Task 1.6: Backend ↔ MCP Integration
- [ ] Update backend to use MCP for memory operations
- [ ] Add MCP health checks to system status
- [ ] Create MCP client wrapper in backend
- [ ] Add memory session management
- [ ] Build transcript analysis integration

**File**: `backend/lib/mcpClient.js`

**Integration Points**:
```javascript
// Automatic memory storage after AI interactions
async function storeAIInteraction(tenantId, userId, interaction) {
  await mcpClient.memory.store({
    tenantId,
    userId,
    type: 'ai_interaction',
    content: interaction,
    timestamp: new Date()
  });
}

// Retrieve context for AI enrichment
async function getRelevantContext(tenantId, userId, query) {
  return await mcpClient.memory.search({
    tenantId,
    userId,
    query,
    limit: 5
  });
}
```

**Deliverable**: Backend AI operations using MCP memory

---

### Week 7-8: Core Entity AI Enhancement

#### Task 1.7: Accounts AI Enhancement
- [ ] Create `/api/v2/ai/accounts` endpoints
- [ ] Add duplicate detection on account creation
- [ ] Build industry prediction model
- [ ] Add related contacts/opportunities enrichment
- [ ] Implement account health scoring

**Endpoints**:
```javascript
POST   /api/v2/ai/accounts              # Create with AI enrichment
GET    /api/v2/ai/accounts/:id          # Get with AI insights
GET    /api/v2/ai/accounts/:id/insights # Get detailed AI analysis
POST   /api/v2/ai/accounts/:id/suggest  # Get action suggestions
```

**AI Enrichments**:
- Duplicate check (name similarity > 85%)
- Industry classification (based on name/description)
- Suggested related contacts to add
- Health score (based on activity, opportunities, age)

**Deliverable**: Accounts API v2 with AI context

---

#### Task 1.8: Contacts AI Enhancement
- [ ] Create `/api/v2/ai/contacts` endpoints
- [ ] Add email validation and enrichment
- [ ] Build contact scoring (engagement, fit)
- [ ] Add relationship mapping
- [ ] Implement best contact time prediction

**AI Enrichments**:
- Email validity check + domain verification
- Job title normalization and seniority detection
- Engagement score (based on interactions)
- Best time to contact (based on response patterns)
- Suggested accounts to link

**Deliverable**: Contacts API v2 with AI context

---

#### Task 1.9: Leads AI Enhancement
- [ ] Create `/api/v2/ai/leads` endpoints
- [ ] Build real-time lead scoring model
- [ ] Add automatic lead routing logic
- [ ] Implement conversion probability prediction
- [ ] Create lead nurture suggestions

**AI Enrichments**:
- Lead score (0-100 based on fit, engagement, timing)
- Optimal sales rep assignment
- Conversion probability (based on similar leads)
- Suggested nurture actions (email, call, demo)
- Time-to-convert estimation

**Lead Scoring Model**:
```javascript
// Factors (weighted)
- Company size match (20%)
- Industry fit (15%)
- Job title/seniority (15%)
- Engagement level (25%)
- Source quality (10%)
- Timing indicators (15%)

// Output: 0-100 score + confidence
```

**Deliverable**: Leads API v2 with AI scoring

---

## Testing & Validation

### Test Plan
- [ ] Unit tests for AI router middleware (95% coverage)
- [ ] Integration tests for v2 endpoints (all scenarios)
- [ ] Load testing for AI enrichment latency (<500ms p95)
- [ ] MCP server failover testing (graceful degradation)
- [ ] End-to-end tests for 3 core entities

### Performance Benchmarks
| Metric | Target | Measurement |
|--------|--------|-------------|
| AI enrichment latency | <200ms median | New Relic |
| v2 API response time | <500ms p95 | Custom middleware |
| MCP uptime | >99.5% | Health check logs |
| OpenAI API errors | <0.1% | Error tracking |

### Acceptance Criteria
- ✅ All v2 endpoints return AI context in response
- ✅ MCP server runs continuously without manual intervention
- ✅ AI enrichment doesn't block core CRUD operations
- ✅ Confidence scores accurately reflect prediction quality (validated with sample data)
- ✅ Duplicate detection catches >90% of known duplicates

---

## Dependencies

### External Services
- OpenAI API (GPT-4 access required)
- MCP server (production-ready deployment)
- Vector database (Pinecone trial account)

### Environment Variables
```bash
# Add to backend/.env
OPENAI_API_KEY=sk-...
MCP_SERVER_URL=http://braid-mcp-node-server:8000
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1-aws
AI_ENRICHMENT_ENABLED=true
AI_CONFIDENCE_THRESHOLD=0.7
```

### New npm Packages
```bash
# Backend
npm install openai@^4.20.0
npm install @pinecone-database/pinecone@^1.1.0
npm install tiktoken@^1.0.0  # Token counting
```

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OpenAI API rate limits | High | Medium | Implement caching + fallback to simpler models |
| MCP server instability | Critical | Low | Add auto-restart + health monitoring + graceful degradation |
| AI enrichment latency | Medium | High | Async processing for non-critical enrichments + caching |
| Cost overruns (OpenAI) | Medium | Medium | Set monthly budget alerts + optimize prompts |

---

## Success Metrics

### Technical Metrics
- [ ] v2 API endpoints respond in <500ms (p95)
- [ ] AI enrichment success rate >99%
- [ ] MCP server uptime >99.5%
- [ ] Zero impact on v1 API performance

### Product Metrics
- [ ] AI suggestions accuracy >70% (measured by user acceptance)
- [ ] Lead scoring correlation with actual conversions >0.6
- [ ] Duplicate detection precision >90%

---

## Rollout Plan

### Week 8: Internal Testing
- Deploy to staging environment
- Internal team testing (10 users)
- Bug fixes and refinements

### Week 9: Beta Release
- Enable v2 endpoints for 5% of users
- Monitor metrics and gather feedback
- Iterate based on learnings

### Week 10: Phase 1 Complete
- Document Phase 1 outcomes
- Review metrics against targets
- Plan Phase 2 kickoff

---

## Handoff to Phase 2

### Deliverables Ready for Phase 2
- ✅ Working v2 API infrastructure
- ✅ AI router middleware (production-ready)
- ✅ MCP server (stable in production)
- ✅ 3 core entities with AI enhancement

### Outstanding Items for Phase 2
- Conversational interface components
- Voice input/output
- Natural language command parser
- Full entity coverage (opportunities, campaigns, etc.)

---

**Phase Owner**: [Engineering Lead Name]  
**Last Updated**: November 29, 2025  
**Status**: Ready for Review
