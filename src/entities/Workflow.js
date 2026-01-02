/**
 * Workflow Entity Schema
 * Full JSON schema with RLS rules for Workflow
 */

export const WorkflowSchema = {
  "name": "Workflow",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this workflow belongs to"
    },
    "name": {
      "type": "string",
      "description": "Workflow name"
    },
    "description": {
      "type": "string",
      "description": "Workflow description"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether the workflow is currently active"
    },
    "trigger": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "webhook",
            "schedule",
            "entity_event"
          ],
          "description": "Type of trigger"
        },
        "config": {
          "type": "object",
          "additionalProperties": true,
          "description": "Trigger configuration"
        }
      },
      "description": "Workflow trigger configuration"
    },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Unique node identifier"
          },
          "type": {
            "type": "string",
            "enum": [
              "webhook_trigger",
              "http_request",
              "find_lead",
              "create_lead",
              "update_lead",
              "find_contact",
              "update_contact",
              "find_account",
              "update_account",
              "create_opportunity",
              "update_opportunity",
              "create_activity",
              "create_note",
              "send_email",
              "send_sms",
              "wait",
              "condition",
              "assign_record",
              "update_status",
              "initiate_call",
              "ai_classify_opportunity_stage",
              "ai_generate_email",
              "ai_enrich_account",
              "ai_route_activity",
              "ai_summarize",
              "ai_generate_note",
              "thoughtly_message",
              "callfluent_message",
              "pabbly_webhook",
              "wait_for_webhook"
            ],
            "description": "Node type"
          },
          "config": {
            "type": "object",
            "additionalProperties": true,
            "description": "Node configuration"
          },
          "position": {
            "type": "object",
            "properties": {
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          }
        }
      },
      "description": "Workflow nodes/steps"
    },
    "connections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "from": {
            "type": "string"
          },
          "to": {
            "type": "string"
          }
        }
      },
      "description": "Connections between nodes"
    },
    "execution_count": {
      "type": "number",
      "default": 0,
      "description": "Number of times this workflow has been executed"
    },
    "last_executed": {
      "type": "string",
      "format": "date-time",
      "description": "Last execution timestamp"
    },
    "webhook_url": {
      "type": "string",
      "description": "Generated webhook URL for this workflow"
    }
  },
  "required": [
    "tenant_id",
    "name"
  ],
  "rls": {
    "read": {
      "$or": [
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "tenant_id": "{{user.tenant_id}}"
        }
      ]
    },
    "write": {
      "$or": [
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "tenant_id": "{{user.tenant_id}}"
        }
      ]
    }
  }
};

export default WorkflowSchema;
