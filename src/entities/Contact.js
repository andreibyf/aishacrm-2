/**
 * Contact Entity Schema
 * Full JSON schema with RLS rules for Contact
 */

export const ContactSchema = {
  "name": "Contact",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this contact belongs to"
    },
    "unique_id": {
      "type": "string",
      "description": "Auto-generated unique identifier (e.g., CONT-000001) that may have originated from a Lead conversion"
    },
    "assigned_to": {
      "type": "string",
      "format": "email",
      "description": "Email of the user responsible for this contact"
    },
    "assigned_to_name": {
      "type": "string",
      "description": "Denormalized: Full name of assigned employee for faster display"
    },
    "first_name": {
      "type": "string",
      "description": "Contact's first name"
    },
    "last_name": {
      "type": "string",
      "description": "Contact's last name"
    },
    "email": {
      "type": "string",
      "format": "email",
      "pattern": "^\\S+@\\S+\\.\\S+$",
      "description": "Primary email address (optional - can be empty for contacts without email)"
    },
    "phone": {
      "type": "string",
      "description": "Primary phone number"
    },
    "mobile": {
      "type": "string",
      "description": "Mobile phone number"
    },
    "job_title": {
      "type": "string",
      "description": "Job title or position"
    },
    "department": {
      "type": "string",
      "description": "Department within organization"
    },
    "account_id": {
      "type": "string",
      "description": "Associated account/company ID"
    },
    "account_name": {
      "type": "string",
      "description": "Denormalized: Account name for faster display and search"
    },
    "account_industry": {
      "type": "string",
      "description": "Denormalized: Account industry for segmentation"
    },
    "lead_source": {
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
      "description": "How the contact was acquired"
    },
    "status": {
      "type": "string",
      "enum": [
        "active",
        "inactive",
        "prospect",
        "customer"
      ],
      "default": "prospect",
      "description": "Contact status"
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
    "notes": {
      "type": "string",
      "description": "Additional notes about the contact"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for categorization"
    },
    "score": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "Contact score (0-100)"
    },
    "score_reason": {
      "type": "string",
      "description": "Explanation for the contact score"
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
    "legacy_id": {
      "type": "string",
      "description": "The ID of this record from a previous or external system."
    },
    "processed_by_ai_doc": {
      "type": "boolean",
      "default": false,
      "description": "True if this contact was created by AI document processing (business cards, etc.)"
    },
    "ai_doc_source_type": {
      "type": "string",
      "enum": [
        "business_card",
        "document_extraction"
      ],
      "description": "Type of AI document processing that created this contact"
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

export default ContactSchema;
