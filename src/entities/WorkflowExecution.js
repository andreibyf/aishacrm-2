/**
 * WorkflowExecution Entity Schema
 * Full JSON schema with RLS rules for WorkflowExecution
 */

export const WorkflowExecutionSchema = {
  "name": "WorkflowExecution",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant"
    },
    "workflow_id": {
      "type": "string",
      "description": "The workflow that was executed"
    },
    "workflow_name": {
      "type": "string",
      "description": "Denormalized workflow name"
    },
    "status": {
      "type": "string",
      "enum": [
        "success",
        "failed",
        "running"
      ],
      "description": "Execution status"
    },
    "trigger_data": {
      "type": "object",
      "additionalProperties": true,
      "description": "Data that triggered the workflow"
    },
    "execution_log": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "node_id": {
            "type": "string"
          },
          "node_type": {
            "type": "string"
          },
          "status": {
            "type": "string"
          },
          "output": {
            "type": "object"
          },
          "error": {
            "type": "string"
          },
          "timestamp": {
            "type": "string"
          }
        }
      },
      "description": "Step-by-step execution log"
    },
    "duration_ms": {
      "type": "number",
      "description": "Execution duration in milliseconds"
    },
    "error_message": {
      "type": "string",
      "description": "Error message if execution failed"
    }
  },
  "required": [
    "tenant_id",
    "workflow_id",
    "status"
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
    "write": {}
  }
};

export default WorkflowExecutionSchema;
