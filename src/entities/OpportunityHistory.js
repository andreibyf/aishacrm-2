/**
 * OpportunityHistory Entity Schema
 * Full JSON schema with RLS rules for OpportunityHistory
 */

export const OpportunityHistorySchema = {
  "name": "OpportunityHistory",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "opportunity_id": {
      "type": "string",
      "description": "Reference to the Opportunity this history belongs to"
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
        "stage_changed",
        "amount_changed",
        "won",
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
      "description": "Complete snapshot of opportunity data at this point in time"
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
    "stage_change": {
      "type": "object",
      "properties": {
        "old_stage": {
          "type": "string"
        },
        "new_stage": {
          "type": "string"
        },
        "days_in_previous_stage": {
          "type": "number"
        }
      },
      "description": "Stage progression tracking"
    },
    "amount_change": {
      "type": "object",
      "properties": {
        "old_amount": {
          "type": "number"
        },
        "new_amount": {
          "type": "number"
        },
        "change_reason": {
          "type": "string"
        }
      },
      "description": "Deal value changes"
    },
    "close_data": {
      "type": "object",
      "properties": {
        "close_date": {
          "type": "string",
          "format": "date-time"
        },
        "close_reason": {
          "type": "string"
        },
        "actual_vs_expected": {
          "type": "number"
        }
      },
      "description": "Win/loss details"
    }
  },
  "required": [
    "opportunity_id",
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

export default OpportunityHistorySchema;
