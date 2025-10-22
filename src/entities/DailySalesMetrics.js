/**
 * DailySalesMetrics Entity Schema
 * Full JSON schema with RLS rules for DailySalesMetrics
 */

export const DailySalesMetricsSchema = {
  "name": "DailySalesMetrics",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "metric_date": {
      "type": "string",
      "format": "date",
      "description": "Date these metrics apply to"
    },
    "total_opportunities": {
      "type": "number",
      "default": 0,
      "description": "Total opportunities active on this date"
    },
    "total_pipeline_value": {
      "type": "number",
      "default": 0,
      "description": "Sum of all opportunity amounts"
    },
    "opportunities_won": {
      "type": "number",
      "default": 0,
      "description": "Opportunities closed-won on this date"
    },
    "opportunities_lost": {
      "type": "number",
      "default": 0,
      "description": "Opportunities closed-lost on this date"
    },
    "revenue_won": {
      "type": "number",
      "default": 0,
      "description": "Total revenue from won deals"
    },
    "revenue_lost": {
      "type": "number",
      "default": 0,
      "description": "Total value of lost deals"
    },
    "win_rate": {
      "type": "number",
      "default": 0,
      "description": "Percentage of opportunities won"
    },
    "average_deal_size": {
      "type": "number",
      "default": 0,
      "description": "Average opportunity amount"
    },
    "stage_breakdown": {
      "type": "object",
      "properties": {
        "prospecting": {
          "type": "number"
        },
        "qualification": {
          "type": "number"
        },
        "proposal": {
          "type": "number"
        },
        "negotiation": {
          "type": "number"
        },
        "closed_won": {
          "type": "number"
        },
        "closed_lost": {
          "type": "number"
        }
      },
      "description": "Count of opportunities by stage"
    },
    "assigned_to_breakdown": {
      "type": "object",
      "additionalProperties": {
        "type": "number"
      },
      "description": "Pipeline value by assigned user"
    },
    "last_calculated": {
      "type": "string",
      "format": "date-time",
      "description": "When these metrics were last computed"
    },
    "is_final": {
      "type": "boolean",
      "default": false,
      "description": "True if this date is complete and won't change"
    }
  },
  "required": [
    "tenant_id",
    "metric_date"
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

export default DailySalesMetricsSchema;
