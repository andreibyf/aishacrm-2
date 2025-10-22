/**
 * DocumentationFile Entity Schema
 * Full JSON schema with RLS rules for DocumentationFile
 */

export const DocumentationFileSchema = {
  "name": "DocumentationFile",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "The title of the document."
    },
    "description": {
      "type": "string",
      "description": "A brief description of the document's content."
    },
    "file_name": {
      "type": "string",
      "description": "The name of the file stored in R2 (e.g., 'report.pdf'). Used to generate signed URLs."
    },
    "file_uri": {
      "type": "string",
      "description": "The unique URI for the private file, used to generate signed URLs."
    },
    "file_type": {
      "type": "string",
      "description": "The type of file (e.g., 'pdf', 'docx', 'png')."
    },
    "extracted_content": {
      "type": "string",
      "description": "Extracted text content from the document for AI search."
    },
    "category": {
      "type": "string",
      "enum": [
        "user_guide",
        "api_reference",
        "tutorial",
        "policy",
        "faq",
        "receipt",
        "invoice",
        "other"
      ],
      "default": "other",
      "description": "The category for organizing the document."
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for searching and filtering."
    },
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this document belongs to. Null or missing for system-wide admin docs."
    },
    "receipt_data": {
      "type": "object",
      "properties": {
        "merchant_name": {
          "type": "string"
        },
        "total_amount": {
          "type": "number"
        },
        "transaction_date": {
          "type": "string"
        },
        "payment_method": {
          "type": "string"
        },
        "items": {
          "type": "array"
        },
        "suggested_category": {
          "type": "string"
        },
        "confidence_score": {
          "type": "number"
        }
      },
      "description": "Extracted receipt data from AI processing"
    },
    "processed_for_cashflow": {
      "type": "boolean",
      "default": false,
      "description": "Whether this receipt has been converted to a cash flow transaction"
    }
  },
  "required": [
    "title",
    "file_name",
    "file_type"
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
          "tenant_id": "{{user.tenant_id}}"
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
          "tenant_id": "{{user.tenant_id}}"
        }
      ]
    }
  }
};

export default DocumentationFileSchema;
