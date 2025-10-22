/**
 * ImportLog Entity Schema
 * Full JSON schema with RLS rules for ImportLog
 */

export const ImportLogSchema = {
  "name": "ImportLog",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID for data isolation"
    },
    "entity_type": {
      "type": "string",
      "description": "Entity being imported (Contact, Account, etc.)"
    },
    "status": {
      "type": "string",
      "enum": [
        "in_progress",
        "completed",
        "failed",
        "partially_completed"
      ],
      "description": "Import status"
    },
    "total_rows": {
      "type": "number",
      "description": "Total rows in CSV"
    },
    "successful_imports": {
      "type": "number",
      "default": 0,
      "description": "Successfully imported records"
    },
    "failed_imports": {
      "type": "number",
      "default": 0,
      "description": "Failed records"
    },
    "skipped_rows": {
      "type": "number",
      "default": 0,
      "description": "Skipped rows"
    },
    "error_log": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "row_number": {
            "type": "number"
          },
          "error": {
            "type": "string"
          },
          "data": {
            "type": "object"
          }
        }
      },
      "description": "Detailed error log per row"
    },
    "success_log": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "row_number": {
            "type": "number"
          },
          "record_id": {
            "type": "string"
          },
          "data": {
            "type": "object"
          }
        }
      },
      "description": "Successfully created records"
    },
    "mapping_config": {
      "type": "object",
      "description": "Column mapping used"
    },
    "file_name": {
      "type": "string",
      "description": "Original CSV file name"
    },
    "import_duration_ms": {
      "type": "number",
      "description": "How long import took"
    },
    "assigned_to": {
      "type": "string",
      "description": "Who performed the import"
    }
  },
  "required": [
    "tenant_id",
    "entity_type",
    "status",
    "total_rows"
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
              "created_by": "{{user.email}}"
            }
          ]
        }
      ]
    },
    "write": {
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
          "created_by": "{{user.email}}"
        }
      ]
    }
  }
};

export default ImportLogSchema;
