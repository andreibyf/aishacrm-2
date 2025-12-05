# API v2 Migration Guide

**Version:** 1.0  
**Last Updated:** December 4, 2025  
**Status:** Production Ready

---

## Overview

AiSHA CRM API v2 introduces AI-enhanced endpoints that return intelligent context alongside standard data. All v2 endpoints include an `aiContext` object with predictions, suggestions, and insights powered by our AI layer.

## Quick Start

### Base URL Change
```
v1: /api/{entity}
v2: /api/v2/{entity}
```

### Response Structure Change
```javascript
// v1 Response
{
  "status": "success",
  "data": { /* entity data */ }
}

// v2 Response
{
  "status": "success",
  "data": { /* entity data */ },
  "aiContext": {
    "confidence": 0.85,
    "suggestions": [...],
    "predictions": {...},
    "insights": [...]
  },
  "meta": {
    "api_version": "v2",
    "processingTime": 45
  }
}
```

---

## Available v2 Endpoints

### 1. Opportunities (`/api/v2/opportunities`)

AI-enhanced deal management with win probability and health scoring.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/opportunities` | List with AI prioritization |
| GET | `/api/v2/opportunities/:id` | Get with deal health analysis |
| POST | `/api/v2/opportunities` | Create with AI suggestions |
| PUT | `/api/v2/opportunities/:id` | Update with impact analysis |
| DELETE | `/api/v2/opportunities/:id` | Delete with dependency check |

**AI Context Includes:**
- `winProbability` - Predicted close likelihood (0-1)
- `healthScore` - Deal health (0-100)
- `riskFactors` - Identified risks
- `suggestedNextSteps` - Recommended actions
- `stageProgression` - Stage change predictions

**Example Response:**
```javascript
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Enterprise Deal",
    "amount": 50000,
    "stage": "proposal"
  },
  "aiContext": {
    "confidence": 0.87,
    "predictions": {
      "winProbability": 0.72,
      "expectedCloseDate": "2025-01-15",
      "estimatedValue": 52000
    },
    "suggestions": [
      {
        "action": "schedule_demo",
        "priority": "high",
        "reason": "Decision maker hasn't seen product demo"
      }
    ],
    "insights": [
      "Similar deals close 15% faster with executive sponsor",
      "Competitor mentioned in last call - prepare battle card"
    ],
    "health": {
      "score": 78,
      "status": "healthy",
      "factors": ["Active engagement", "Budget confirmed"]
    }
  }
}
```

---

### 2. Activities (`/api/v2/activities`)

AI-enhanced activity tracking with sentiment analysis and urgency detection.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/activities` | List with AI prioritization |
| GET | `/api/v2/activities/:id` | Get with sentiment analysis |
| POST | `/api/v2/activities` | Create with auto-enrichment |
| PUT | `/api/v2/activities/:id` | Update with context |
| DELETE | `/api/v2/activities/:id` | Delete |

**AI Context Includes:**
- `sentiment` - Detected sentiment (positive/neutral/negative)
- `urgency` - Urgency level (low/medium/high/critical)
- `followUpSuggestions` - Recommended follow-up actions
- `keyTopics` - Extracted key topics
- `actionItems` - Detected action items

---

### 3. Contacts (`/api/v2/contacts`)

AI-enhanced contact management with engagement scoring and relationship analysis.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/contacts` | List with engagement scores |
| GET | `/api/v2/contacts/:id` | Get with relationship insights |
| POST | `/api/v2/contacts` | Create with enrichment |
| PUT | `/api/v2/contacts/:id` | Update |
| DELETE | `/api/v2/contacts/:id` | Delete |

**AI Context Includes:**
- `engagementScore` - Contact engagement level (0-100)
- `relationshipStrength` - Relationship health indicator
- `bestContactTime` - Optimal time to reach out
- `communicationPreference` - Preferred channel
- `influenceLevel` - Decision-making influence

---

### 4. Accounts (`/api/v2/accounts`)

AI-enhanced account management with health scoring and churn prediction.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/accounts` | List with health indicators |
| GET | `/api/v2/accounts/:id` | Get with full analysis |
| POST | `/api/v2/accounts` | Create with enrichment |
| PUT | `/api/v2/accounts/:id` | Update |
| DELETE | `/api/v2/accounts/:id` | Delete |

**AI Context Includes:**
- `healthScore` - Account health (0-100)
- `churnRisk` - Churn probability
- `upsellPotential` - Upsell opportunity score
- `industryInsights` - Industry-specific insights
- `competitorMentions` - Detected competitor activity

---

### 5. Leads (`/api/v2/leads`)

AI-enhanced lead management with scoring and qualification.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/leads` | List with AI scoring |
| GET | `/api/v2/leads/:id` | Get with qualification analysis |
| POST | `/api/v2/leads` | Create with auto-scoring |
| PUT | `/api/v2/leads/:id` | Update with re-scoring |
| DELETE | `/api/v2/leads/:id` | Delete |

**AI Context Includes:**
- `leadScore` - AI-calculated lead score (0-100)
- `conversionProbability` - Likelihood to convert
- `qualificationStatus` - MQL/SQL/Unqualified
- `idealCustomerFit` - ICP match score
- `recommendedActions` - Next best actions

---

### 6. Reports (`/api/v2/reports`)

AI-enhanced reporting with trend analysis and predictions.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/reports/dashboard-bundle` | Dashboard stats with insights |

**AI Context Includes:**
- `trends` - Detected trends in data
- `anomalies` - Unusual patterns flagged
- `forecasts` - Predicted future metrics
- `recommendations` - Data-driven suggestions

---

### 7. Workflows (`/api/v2/workflows`)

AI-enhanced workflow management with health analysis.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/workflows` | List with health summary |
| GET | `/api/v2/workflows/:id` | Get with execution analysis |
| GET | `/api/v2/workflows/:id/analyze` | Deep workflow analysis |

**AI Context Includes:**
- `health` - Workflow health score and status
- `executionStats` - Success/failure metrics
- `bottlenecks` - Identified performance issues
- `optimizationSuggestions` - Improvement recommendations

---

### 8. Documents (`/api/v2/documents`)

AI-enhanced document management with classification and sensitivity detection.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/documents` | List with classifications |
| GET | `/api/v2/documents/:id` | Get with full analysis |
| POST | `/api/v2/documents` | Create with auto-classification |
| PUT | `/api/v2/documents/:id` | Update |
| DELETE | `/api/v2/documents/:id` | Delete |

**AI Context Includes:**
- `classification` - Document type (contract/proposal/report/etc)
- `sensitivityLevel` - Data sensitivity (public/internal/confidential/restricted)
- `retentionRecommendation` - Suggested retention period
- `relatedEntities` - Detected related accounts/contacts
- `keyTerms` - Extracted key terms and topics

---

## Deprecation Timeline

### Current Status (December 2025)
All v1 endpoints now return deprecation headers:

```http
X-API-Version: v1
X-API-Deprecation-Date: 2027-02-01
X-API-Sunset-Date: 2027-08-01
X-Migration-Guide: https://docs.aishacrm.com/api/v2/migration
Link: </api/v2/opportunities>; rel="alternate"
Warning: 299 - "API v1 is deprecated. Migrate to v2 by 2027-08-01"
```

### Timeline

| Date | Milestone |
|------|-----------|
| December 2025 | v2 endpoints available, deprecation headers active |
| February 2027 | Official deprecation date - v1 usage warnings intensify |
| August 2027 | v1 sunset - endpoints return 410 Gone |

---

## Migration Checklist

### For Each Entity Type:

- [ ] Update endpoint URLs from `/api/{entity}` to `/api/v2/{entity}`
- [ ] Update response parsing to handle `aiContext` object
- [ ] Add UI components to display AI suggestions (optional)
- [ ] Update error handling for new response structure
- [ ] Test all CRUD operations against v2 endpoints
- [ ] Monitor deprecation headers in existing v1 calls

### Code Migration Example

```javascript
// Before (v1)
const response = await fetch('/api/opportunities');
const { data } = await response.json();
setOpportunities(data);

// After (v2)
const response = await fetch('/api/v2/opportunities');
const { data, aiContext } = await response.json();
setOpportunities(data);
setAiInsights(aiContext); // Optional: display AI insights
```

---

## Best Practices

### 1. Graceful AI Context Handling
```javascript
// Always handle missing aiContext gracefully
const insights = response.aiContext?.insights || [];
const suggestions = response.aiContext?.suggestions || [];
```

### 2. Performance Considerations
- AI enrichment adds ~50-200ms to response time
- Use `?skip_ai=true` query param to bypass AI (when available)
- Cache AI context appropriately (30-60 second TTL recommended)

### 3. Feature Flags
Consider feature flags for gradual v2 adoption:
```javascript
const useV2Api = featureFlags.get('use_v2_api');
const baseUrl = useV2Api ? '/api/v2' : '/api';
```

---

## Support

For migration assistance:
- Check API Health Dashboard: Settings → API Health
- Review error logs for deprecation warnings
- Contact support for enterprise migration planning

---

**Document Owner**: Engineering Team  
**Last Updated**: December 4, 2025
