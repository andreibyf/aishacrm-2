/**
 * CashFlow Entity Schema
 * Full JSON schema with RLS rules for CashFlow
 */

export const CashFlowSchema = {
  "name": "CashFlow",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this cash flow record belongs to"
    },
    "transaction_type": {
      "type": "string",
      "enum": [
        "income",
        "expense"
      ],
      "description": "Type of cash flow transaction"
    },
    "category": {
      "type": "string",
      "enum": [
        "sales_revenue",
        "recurring_revenue",
        "refund",
        "operating_expense",
        "marketing",
        "equipment",
        "supplies",
        "utilities",
        "rent",
        "payroll",
        "professional_services",
        "travel",
        "meals",
        "other"
      ],
      "description": "Transaction category"
    },
    "amount": {
      "type": "number",
      "description": "Transaction amount (positive for income, positive for expenses)"
    },
    "transaction_date": {
      "type": "string",
      "format": "date",
      "description": "Date of the transaction"
    },
    "description": {
      "type": "string",
      "description": "Description of the transaction"
    },
    "vendor_client": {
      "type": "string",
      "description": "Vendor (for expenses) or Client (for income)"
    },
    "related_opportunity_id": {
      "type": "string",
      "description": "Related opportunity ID if this came from a closed deal"
    },
    "related_account_id": {
      "type": "string",
      "description": "Related account ID for client/vendor tracking"
    },
    "is_recurring": {
      "type": "boolean",
      "default": false,
      "description": "Whether this is a recurring transaction"
    },
    "recurrence_pattern": {
      "type": "string",
      "enum": [
        "weekly",
        "monthly",
        "quarterly",
        "annually"
      ],
      "description": "How often this transaction repeats"
    },
    "status": {
      "type": "string",
      "enum": [
        "actual",
        "projected",
        "pending",
        "cancelled"
      ],
      "default": "actual",
      "description": "Transaction status"
    },
    "entry_method": {
      "type": "string",
      "enum": [
        "manual",
        "crm_auto",
        "document_extracted",
        "recurring_auto"
      ],
      "default": "manual",
      "description": "How this transaction was created"
    },
    "is_editable": {
      "type": "boolean",
      "default": true,
      "description": "Whether this transaction can be edited"
    },
    "adjustment_reason": {
      "type": "string",
      "description": "Reason for any manual adjustments"
    },
    "original_amount": {
      "type": "number",
      "description": "Original amount before adjustments"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Custom tags for categorization"
    },
    "ai_suggested_tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "AI-suggested tags based on description"
    },
    "tax_category": {
      "type": "string",
      "enum": [
        "deductible",
        "non_deductible",
        "asset",
        "unknown"
      ],
      "default": "unknown",
      "description": "Tax treatment category"
    },
    "receipt_url": {
      "type": "string",
      "description": "URL to uploaded receipt/invoice document"
    },
    "invoice_number": {
      "type": "string",
      "description": "Invoice or receipt number"
    },
    "payment_method": {
      "type": "string",
      "enum": [
        "cash",
        "check",
        "credit_card",
        "bank_transfer",
        "other"
      ],
      "description": "How payment was made/received"
    },
    "notes": {
      "type": "string",
      "description": "Additional notes about the transaction"
    },
    "processed_by_ai": {
      "type": "boolean",
      "default": false,
      "description": "Whether this transaction was extracted by AI from documents"
    },
    "is_test_data": {
      "type": "boolean",
      "default": false,
      "description": "Flag for test data"
    }
  },
  "required": [
    "transaction_type",
    "category",
    "amount",
    "transaction_date",
    "description"
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
                  "created_by": "{{user.email}}"
                },
                {
                  "user_condition": {
                    "role": "power-user"
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
                  "created_by": "{{user.email}}"
                },
                {
                  "user_condition": {
                    "role": "power-user"
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

export default CashFlowSchema;
