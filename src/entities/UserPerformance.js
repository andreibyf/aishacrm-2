/**
 * UserPerformanceCache Entity Schema
 * Full JSON schema with RLS rules for UserPerformanceCache
 */

export const UserPerformanceCacheSchema = {
  "name": "UserPerformanceCache",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "user_email": {
      "type": "string",
      "format": "email",
      "description": "User this cache is for"
    },
    "period": {
      "type": "string",
      "enum": [
        "today",
        "week",
        "month",
        "quarter",
        "year"
      ],
      "description": "Time period for these metrics"
    },
    "start_date": {
      "type": "string",
      "format": "date",
      "description": "Start of period"
    },
    "end_date": {
      "type": "string",
      "format": "date",
      "description": "End of period"
    },
    "total_contacts": {
      "type": "number",
      "default": 0
    },
    "total_leads": {
      "type": "number",
      "default": 0
    },
    "total_opportunities": {
      "type": "number",
      "default": 0
    },
    "opportunities_won": {
      "type": "number",
      "default": 0
    },
    "opportunities_lost": {
      "type": "number",
      "default": 0
    },
    "revenue_won": {
      "type": "number",
      "default": 0
    },
    "pipeline_value": {
      "type": "number",
      "default": 0
    },
    "activities_completed": {
      "type": "number",
      "default": 0
    },
    "calls_made": {
      "type": "number",
      "default": 0
    },
    "meetings_held": {
      "type": "number",
      "default": 0
    },
    "emails_sent": {
      "type": "number",
      "default": 0
    },
    "tasks_completed": {
      "type": "number",
      "default": 0
    },
    "win_rate": {
      "type": "number",
      "default": 0
    },
    "average_deal_size": {
      "type": "number",
      "default": 0
    },
    "conversion_rate": {
      "type": "number",
      "default": 0
    },
    "activity_rate": {
      "type": "number",
      "default": 0,
      "description": "Activities per day"
    },
    "last_calculated": {
      "type": "string",
      "format": "date-time"
    },
    "cache_expires": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": [
    "tenant_id",
    "user_email",
    "period"
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
              "user_email": "{{user.email}}"
            }
          ]
        }
      ]
    },
    "write": {}
  }
};

export default UserPerformanceCacheSchema;
