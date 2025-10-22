/**
 * Opportunity Entity Schema
 * Full JSON schema with RLS rules for Opportunity
 */

export const OpportunitySchema = {
  "name": "Opportunity",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this opportunity belongs to"
    },
    "assigned_to": {
      "type": "string",
      "format": "email",
      "description": "Email of the user responsible for this opportunity"
    },
    "assigned_to_name": {
      "type": "string",
      "description": "Denormalized: Full name of assigned employee for faster display"
    },
    "name": {
      "type": "string",
      "description": "Opportunity name"
    },
    "account_id": {
      "type": "string",
      "description": "Associated account ID"
    },
    "account_name": {
      "type": "string",
      "description": "Denormalized: Account name for faster display and reporting"
    },
    "account_industry": {
      "type": "string",
      "description": "Denormalized: Account industry for pipeline segmentation"
    },
    "contact_id": {
      "type": "string",
      "description": "Primary contact ID"
    },
    "contact_name": {
      "type": "string",
      "description": "Denormalized: Contact name for faster display"
    },
    "contact_email": {
      "type": "string",
      "description": "Denormalized: Contact email for quick access"
    },
    "lead_id": {
      "type": "string",
      "description": "Related lead ID if this opportunity pertains to a Lead"
    },
    "stage": {
      "type": "string",
      "enum": [
        "prospecting",
        "qualification",
        "proposal",
        "negotiation",
        "closed_won",
        "closed_lost"
      ],
      "default": "prospecting",
      "description": "Sales stage"
    },
    "amount": {
      "type": "number",
      "description": "Opportunity value in USD"
    },
    "probability": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "description": "Win probability percentage"
    },
    "close_date": {
      "type": "string",
      "format": "date",
      "description": "Expected close date"
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
      "description": "Original lead source"
    },
    "type": {
      "type": "string",
      "enum": [
        "new_business",
        "existing_business",
        "renewal"
      ],
      "description": "Opportunity type"
    },
    "description": {
      "type": "string",
      "description": "Opportunity description"
    },
    "next_step": {
      "type": "string",
      "description": "Next action to take"
    },
    "competitor": {
      "type": "string",
      "description": "Main competitor"
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
    "name",
    "amount",
    "close_date"
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

export default OpportunitySchema;
