/**
 * DataManagementSettings Entity Schema
 * Full JSON schema with RLS rules for DataManagementSettings
 */

export const DataManagementSettingsSchema = {
  "name": "DataManagementSettings",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant these settings apply to."
    },
    "activity_retention_days": {
      "type": "number",
      "minimum": 30,
      "maximum": 365,
      "default": 365,
      "description": "Number of days to keep completed/cancelled activities in the active database."
    },
    "opportunity_retention_days": {
      "type": "number",
      "minimum": 30,
      "maximum": 365,
      "default": 365,
      "description": "Number of days to keep closed-won/lost opportunities in the active database."
    }
  },
  "required": [
    "tenant_id"
  ],
  "rls": {
    "read": {
      "tenant_id": "{{user.tenant_id}}"
    },
    "write": {
      "$and": [
        {
          "tenant_id": "{{user.tenant_id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
  }
};

export default DataManagementSettingsSchema;
