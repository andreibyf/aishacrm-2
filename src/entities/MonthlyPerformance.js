/**
 * MonthlyPerformance Entity Schema
 * Full JSON schema with RLS rules for MonthlyPerformance
 */

export const MonthlyPerformanceSchema = {
  "name": "MonthlyPerformance",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "year": {
      "type": "number",
      "description": "Year (e.g., 2025)"
    },
    "month": {
      "type": "number",
      "description": "Month (1-12)"
    },
    "total_leads": {
      "type": "number",
      "default": 0,
      "description": "New leads created this month"
    },
    "total_contacts": {
      "type": "number",
      "default": 0,
      "description": "New contacts created this month"
    },
    "total_opportunities": {
      "type": "number",
      "default": 0,
      "description": "New opportunities created this month"
    },
    "opportunities_won": {
      "type": "number",
      "default": 0,
      "description": "Opportunities closed-won this month"
    },
    "opportunities_lost": {
      "type": "number",
      "default": 0,
      "description": "Opportunities closed-lost this month"
    },
    "revenue_won": {
      "type": "number",
      "default": 0,
      "description": "Total revenue from won deals"
    },
    "pipeline_value": {
      "type": "number",
      "default": 0,
      "description": "Total pipeline value at month end"
    },
    "win_rate": {
      "type": "number",
      "default": 0,
      "description": "Win rate percentage for the month"
    },
    "average_deal_size": {
      "type": "number",
      "default": 0,
      "description": "Average size of won deals"
    },
    "average_sales_cycle": {
      "type": "number",
      "default": 0,
      "description": "Average days from create to close"
    },
    "lead_conversion_rate": {
      "type": "number",
      "default": 0,
      "description": "Percentage of leads converted to contacts/opportunities"
    },
    "activities_completed": {
      "type": "number",
      "default": 0,
      "description": "Total activities completed this month"
    },
    "top_performers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "user_email": {
            "type": "string"
          },
          "user_name": {
            "type": "string"
          },
          "opportunities_won": {
            "type": "number"
          },
          "revenue": {
            "type": "number"
          }
        }
      },
      "description": "Top performing sales reps"
    },
    "lead_sources": {
      "type": "object",
      "additionalProperties": {
        "type": "number"
      },
      "description": "Lead count by source"
    },
    "industry_breakdown": {
      "type": "object",
      "additionalProperties": {
        "type": "number"
      },
      "description": "Pipeline value by industry"
    },
    "last_calculated": {
      "type": "string",
      "format": "date-time",
      "description": "When these metrics were last computed"
    }
  },
  "required": [
    "tenant_id",
    "year",
    "month"
  ],
  "rls": {
    "read": {
      "$or": [
        {
          "user_condition": {
            "role": "superadmin"
          }
        },
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "user_condition": {
                "role": "power-user"
              }
            }
          ]
        }
      ]
    },
    "write": {}
  }
};

export default MonthlyPerformanceSchema;
