/**
 * IndustryMarketData Entity Schema
 * Full JSON schema with RLS rules for IndustryMarketData
 */

export const IndustryMarketDataSchema = {
  "name": "IndustryMarketData",
  "type": "object",
  "properties": {
    "industry": {
      "type": "string",
      "description": "The industry this data pertains to (matches Tenant.industry enum)"
    },
    "industry_label": {
      "type": "string",
      "description": "Human-readable industry name"
    },
    "market_size_usd": {
      "type": "number",
      "description": "Global market size in USD"
    },
    "growth_rate_percent": {
      "type": "number",
      "description": "Annual growth rate percentage"
    },
    "key_trends": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "trend": {
            "type": "string"
          },
          "impact": {
            "type": "string"
          },
          "timeframe": {
            "type": "string"
          }
        }
      },
      "description": "Current market trends"
    },
    "top_players": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Leading companies in this industry"
    },
    "customer_segments": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Primary customer segments"
    },
    "challenges": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Industry challenges and risks"
    },
    "opportunities": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Growth opportunities"
    },
    "market_forecast": {
      "type": "object",
      "additionalProperties": true,
      "description": "3-5 year market forecast data"
    },
    "competitive_analysis": {
      "type": "object",
      "additionalProperties": true,
      "description": "Competitive landscape analysis"
    },
    "regulatory_environment": {
      "type": "object",
      "additionalProperties": true,
      "description": "Key regulations and compliance requirements"
    },
    "tenant_count": {
      "type": "number",
      "description": "Number of tenants using this industry"
    },
    "last_updated": {
      "type": "string",
      "format": "date-time",
      "description": "When this data was last refreshed"
    },
    "data_quality_score": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "Confidence score for data accuracy"
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Data sources used for this intelligence"
    }
  },
  "required": [
    "industry",
    "industry_label",
    "last_updated"
  ],
  "rls": {
    "read": {},
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default IndustryMarketDataSchema;
