/**
 * ContactHistory Entity Schema
 * Full JSON schema with RLS rules for ContactHistory
 */

export const ContactHistorySchema = {
  "name": "ContactHistory",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "contact_id": {
      "type": "string",
      "description": "Reference to the Contact this history belongs to"
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
        "assigned",
        "archived",
        "deleted"
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
      "description": "Complete snapshot of contact data at this point in time"
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
    "metadata": {
      "type": "object",
      "properties": {
        "ip_address": {
          "type": "string"
        },
        "user_agent": {
          "type": "string"
        },
        "source": {
          "type": "string"
        }
      },
      "description": "Additional context about the change"
    }
  },
  "required": [
    "contact_id",
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

export default ContactHistorySchema;
