/**
 * ArchiveIndex Entity Schema
 * Full JSON schema with RLS rules for ArchiveIndex
 */

export const ArchiveIndexSchema = {
  "name": "ArchiveIndex",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this archive belongs to"
    },
    "entity_type": {
      "type": "string",
      "enum": [
        "BizDevSource",
        "Contact",
        "Lead",
        "Opportunity",
        "Activity"
      ],
      "description": "Type of entity that was archived"
    },
    "batch_id": {
      "type": "string",
      "description": "Batch identifier for grouped archives"
    },
    "archive_path": {
      "type": "string",
      "description": "R2 object key/path where the archive is stored"
    },
    "record_count": {
      "type": "number",
      "description": "Number of records in this archive"
    },
    "file_size_bytes": {
      "type": "number",
      "description": "Size of the archive file in bytes"
    },
    "file_format": {
      "type": "string",
      "enum": [
        "json",
        "csv"
      ],
      "default": "json",
      "description": "Format of the archived file"
    },
    "archived_at": {
      "type": "string",
      "format": "date-time",
      "description": "When the archive was created"
    },
    "archived_by": {
      "type": "string",
      "format": "email",
      "description": "Email of user who created the archive"
    },
    "source_description": {
      "type": "string",
      "description": "Description of what was archived (e.g., 'Construction Directory Q4 2025')"
    },
    "metadata": {
      "type": "object",
      "additionalProperties": true,
      "description": "Additional metadata about the archive"
    },
    "is_accessible": {
      "type": "boolean",
      "default": true,
      "description": "Whether the archive file is still accessible in R2"
    }
  },
  "required": [
    "tenant_id",
    "entity_type",
    "archive_path",
    "record_count",
    "archived_at",
    "archived_by"
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
              "$or": [
                {
                  "user_condition": {
                    "employee_role": "manager"
                  }
                },
                {
                  "user_condition": {
                    "employee_role": null
                  }
                }
              ]
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
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "$or": [
                {
                  "user_condition": {
                    "employee_role": "manager"
                  }
                },
                {
                  "user_condition": {
                    "employee_role": null
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

export default ArchiveIndexSchema;
