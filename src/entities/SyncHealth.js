/**
 * SyncHealth Entity Schema
 * Full JSON schema with RLS rules for SyncHealth
 */

export const SyncHealthSchema = {
  "name": "SyncHealth",
  "type": "object",
  "properties": {
    "sync_type": {
      "type": "string",
      "enum": [
        "denormalization",
        "orphan_cleanup",
        "data_integrity"
      ],
      "description": "Type of sync job"
    },
    "tenant_id": {
      "type": "string",
      "description": "Tenant this sync ran for (null for system-wide)"
    },
    "start_time": {
      "type": "string",
      "format": "date-time",
      "description": "When sync started"
    },
    "end_time": {
      "type": "string",
      "format": "date-time",
      "description": "When sync completed"
    },
    "duration_ms": {
      "type": "number",
      "description": "Duration in milliseconds"
    },
    "status": {
      "type": "string",
      "enum": [
        "running",
        "completed",
        "failed",
        "partial"
      ],
      "default": "running",
      "description": "Sync execution status"
    },
    "mode": {
      "type": "string",
      "enum": [
        "incremental",
        "full"
      ],
      "description": "Sync mode used"
    },
    "records_processed": {
      "type": "number",
      "default": 0,
      "description": "Total records processed"
    },
    "records_updated": {
      "type": "number",
      "default": 0,
      "description": "Records that were updated"
    },
    "error_count": {
      "type": "number",
      "default": 0,
      "description": "Number of errors encountered"
    },
    "errors": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "entity": {
            "type": "string"
          },
          "record_id": {
            "type": "string"
          },
          "error": {
            "type": "string"
          }
        }
      },
      "description": "Detailed error log"
    },
    "entity_stats": {
      "type": "object",
      "properties": {
        "contacts": {
          "type": "number"
        },
        "leads": {
          "type": "number"
        },
        "opportunities": {
          "type": "number"
        },
        "activities": {
          "type": "number"
        }
      },
      "description": "Per-entity sync statistics"
    },
    "triggered_by": {
      "type": "string",
      "enum": [
        "cron",
        "manual",
        "api"
      ],
      "default": "cron",
      "description": "How this sync was initiated"
    }
  },
  "required": [
    "sync_type",
    "start_time",
    "status"
  ],
  "rls": {
    "read": {
      "user_condition": {
        "role": "admin"
      }
    },
    "write": {}
  }
};

export default SyncHealthSchema;
