/**
 * LeadHistory Entity Schema
 * Full JSON schema with RLS rules for LeadHistory
 */

export const LeadHistorySchema = {
  "name": "LeadHistory",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "lead_id": {
      "type": "string",
      "description": "Reference to the Lead this history belongs to"
    },
    "snapshot_date": {
      "type": "string",
      "format": "date-time",
      "description": "When this snapshot was taken"
    },
    "change_type": {
      "type": "string",
      "enum": [
        "created",
        "updated",
        "status_changed",
        "qualified",
        "converted",
        "lost",
        "assigned"
      ],
      "description": "Type of change that occurred"
    },
    "changed_by": {
      "type": "string",
      "format": "email",
      "description": "User who made the change"
    },
    "changed_fields": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of fields that changed"
    },
    "snapshot_data": {
      "type": "object",
      "additionalProperties": true,
      "description": "Complete snapshot of lead data at this point in time"
    },
    "previous_values": {
      "type": "object",
      "additionalProperties": true,
      "description": "Previous values of changed fields"
    },
    "new_values": {
      "type": "object",
      "additionalProperties": true,
      "description": "New values of changed fields"
    },
    "score_change": {
      "type": "object",
      "properties": {
        "old_score": {
          "type": "number"
        },
        "new_score": {
          "type": "number"
        },
        "reason": {
          "type": "string"
        }
      },
      "description": "Lead score changes if applicable"
    },
    "conversion_data": {
      "type": "object",
      "properties": {
        "converted_to_contact_id": {
          "type": "string"
        },
        "converted_to_account_id": {
          "type": "string"
        },
        "conversion_date": {
          "type": "string",
          "format": "date-time"
        }
      },
      "description": "Conversion details if lead was converted"
    }
  },
  "required": [
    "lead_id",
    "snapshot_date",
    "change_type",
    "changed_by"
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

export default LeadHistorySchema;
