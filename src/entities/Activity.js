/**
 * Activity Entity Schema
 * Full JSON schema with RLS rules for Activity
 */

export const ActivitySchema = {
  "name": "Activity",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this activity belongs to"
    },
    "assigned_to": {
      "type": "string",
      "format": "email",
      "description": "Email of the user responsible for this activity"
    },
    "assigned_to_name": {
      "type": "string",
      "description": "Denormalized: Full name of assigned employee for faster display"
    },
    "type": {
      "type": "string",
      "enum": [
        "call",
        "email",
        "meeting",
        "task",
        "note",
        "demo",
        "proposal",
        "scheduled_ai_call",
        "scheduled_ai_email"
      ],
      "description": "Activity type"
    },
    "subject": {
      "type": "string",
      "description": "Activity subject/title"
    },
    "description": {
      "type": "string",
      "description": "Activity description"
    },
    "status": {
      "type": "string",
      "enum": [
        "scheduled",
        "overdue",
        "completed",
        "cancelled",
        "in-progress",
        "failed"
      ],
      "default": "scheduled",
      "description": "Activity status"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "normal",
        "high",
        "urgent"
      ],
      "default": "normal",
      "description": "Priority level"
    },
    "due_date": {
      "type": "string",
      "format": "date",
      "description": "Due date"
    },
    "due_time": {
      "type": "string",
      "description": "Due time (HH:MM format)"
    },
    "duration": {
      "type": "number",
      "description": "Duration in minutes"
    },
    "related_to": {
      "type": "string",
      "enum": [
        "contact",
        "account",
        "lead",
        "opportunity"
      ],
      "description": "What this activity relates to"
    },
    "related_id": {
      "type": "string",
      "description": "ID of the record this activity is attached to"
    },
    "related_name": {
      "type": "string",
      "description": "Denormalized: Name of related entity for faster display"
    },
    "related_email": {
      "type": "string",
      "description": "Denormalized: Email of related contact/lead for quick access"
    },
    "outcome": {
      "type": "string",
      "description": "Activity outcome/result"
    },
    "location": {
      "type": "string",
      "description": "Meeting/call location"
    },
    "call_sid": {
      "type": "string",
      "description": "Unique identifier for the call from the telephony provider (e.g., Twilio/SignalWire SID)."
    },
    "ai_call_config": {
      "type": "object",
      "properties": {
        "ai_provider": {
          "type": "string",
          "enum": [
            "callfluent",
            "thoughtly"
          ],
          "default": "callfluent",
          "description": "AI calling provider to use"
        },
        "prompt": {
          "type": "string",
          "description": "Custom AI prompt for the call"
        },
        "contact_phone": {
          "type": "string",
          "description": "Phone number to call"
        },
        "contact_name": {
          "type": "string",
          "description": "Name of person being called"
        },
        "call_objective": {
          "type": "string",
          "enum": [
            "follow_up",
            "qualification",
            "appointment_setting",
            "customer_service",
            "survey",
            "custom"
          ],
          "description": "Purpose of the AI call"
        },
        "max_duration": {
          "type": "number",
          "default": 300,
          "description": "Maximum call duration in seconds"
        },
        "retry_count": {
          "type": "number",
          "default": 0,
          "description": "Number of retry attempts"
        },
        "max_retries": {
          "type": "number",
          "default": 2,
          "description": "Maximum retry attempts"
        }
      },
      "description": "Configuration for scheduled AI calls"
    },
    "ai_email_config": {
      "type": "object",
      "properties": {
        "subject_template": {
          "type": "string",
          "description": "Subject line for the email. Can include {{contact_name}}."
        },
        "body_prompt": {
          "type": "string",
          "description": "The AI prompt to generate the email body. Use variables like {{contact_name}} and {{company}}."
        }
      },
      "description": "Configuration for scheduled AI emails"
    },
    "execution_log": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "timestamp": {
            "type": "string",
            "format": "date-time"
          },
          "status": {
            "type": "string"
          },
          "message": {
            "type": "string"
          },
          "call_sid": {
            "type": "string"
          }
        }
      },
      "description": "Log of execution attempts"
    },
    "is_test_data": {
      "type": "boolean",
      "default": false,
      "description": "Flag for test data"
    },
    "last_synced": {
      "type": "string",
      "format": "date-time",
      "description": "Last time denormalized fields were synced"
    }
  },
  "required": [
    "type",
    "subject"
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
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "user_condition": {
                "employee_role": "employee"
              }
            },
            {
              "$or": [
                {
                  "created_by": "{{user.email}}"
                },
                {
                  "assigned_to": "{{user.email}}"
                },
                {
                  "assigned_to": null
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
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "user_condition": {
                "employee_role": "employee"
              }
            },
            {
              "$or": [
                {
                  "created_by": "{{user.email}}"
                },
                {
                  "assigned_to": "{{user.email}}"
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

export default ActivitySchema;
