/**
 * Lead Entity Schema
 * Full JSON schema with RLS rules for Lead
 */

export const LeadSchema = {
  "name": "Lead",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this lead belongs to"
    },
    "unique_id": {
      "type": "string",
      "description": "Auto-generated unique identifier (e.g., LEAD-000001) that persists through conversions"
    },
    "assigned_to": {
      "type": "string",
      "format": "email",
      "description": "Email of the user responsible for this lead"
    },
    "assigned_to_name": {
      "type": "string",
      "description": "Denormalized: Full name of assigned employee for faster display"
    },
    "first_name": {
      "type": "string",
      "description": "Lead's first name"
    },
    "last_name": {
      "type": "string",
      "description": "Lead's last name"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Email address (optional - can be empty for leads without email)"
    },
    "phone": {
      "type": "string",
      "description": "Phone number"
    },
    "do_not_call": {
      "type": "boolean",
      "default": false,
      "description": "DNC flag - do not call this lead"
    },
    "do_not_text": {
      "type": "boolean",
      "default": false,
      "description": "DNT flag - do not text this lead"
    },
    "company": {
      "type": "string",
      "description": "Company name"
    },
    "account_id": {
      "type": "string",
      "description": "ID of the associated account"
    },
    "account_name": {
      "type": "string",
      "description": "Denormalized: Account name for faster display"
    },
    "job_title": {
      "type": "string",
      "description": "Job title"
    },
    "source": {
      "type": "string",
      "enum": [
        "website",
        "referral",
        "cold_call",
        "email",
        "social_media",
        "trade_show",
        "advertising",
        "other"
      ],
      "description": "Lead source"
    },
    "status": {
      "type": "string",
      "enum": [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "converted",
        "lost"
      ],
      "default": "new",
      "description": "Lead status"
    },
    "score": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "Lead score (0-100)"
    },
    "score_reason": {
      "type": "string",
      "description": "Explanation for the lead score"
    },
    "ai_action": {
      "type": "string",
      "enum": [
        "none",
        "follow_up",
        "nurture",
        "qualify",
        "disqualify"
      ],
      "default": "none",
      "description": "AI-recommended next action"
    },
    "last_contacted": {
      "type": "string",
      "format": "date",
      "description": "Date of last contact"
    },
    "next_action": {
      "type": "string",
      "description": "Planned next action or step"
    },
    "activity_metadata": {
      "type": "object",
      "additionalProperties": true,
      "description": "JSON object for engagement tracking"
    },
    "estimated_value": {
      "type": "number",
      "description": "Estimated deal value in USD"
    },
    "converted_contact_id": {
      "type": "string",
      "description": "Contact ID if converted"
    },
    "converted_contact_name": {
      "type": "string",
      "description": "Denormalized: Contact name after conversion"
    },
    "converted_account_id": {
      "type": "string",
      "description": "Account ID if converted"
    },
    "converted_account_name": {
      "type": "string",
      "description": "Denormalized: Account name after conversion"
    },
    "address_1": {
      "type": "string",
      "description": "Address line 1"
    },
    "address_2": {
      "type": "string",
      "description": "Address line 2 (apartment, suite, etc.)"
    },
    "city": {
      "type": "string",
      "description": "City"
    },
    "state": {
      "type": "string",
      "description": "State or province"
    },
    "zip": {
      "type": "string",
      "description": "ZIP or postal code"
    },
    "country": {
      "type": "string",
      "description": "Country"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for categorization"
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
    "first_name",
    "last_name"
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
              "assigned_to": "{{user.email}}"
            }
          ]
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
              "assigned_to": "{{user.email}}"
            }
          ]
        }
      ]
    }
  }
};

export default LeadSchema;
