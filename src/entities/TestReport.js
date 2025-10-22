/**
 * TestReport Entity Schema
 * Full JSON schema with RLS rules for TestReport
 */

export const TestReportSchema = {
  "name": "TestReport",
  "type": "object",
  "properties": {
    "test_date": {
      "type": "string",
      "format": "date-time",
      "description": "The date and time the test was run."
    },
    "component_name": {
      "type": "string",
      "description": "The name of the component that was tested."
    },
    "status": {
      "type": "string",
      "enum": [
        "success",
        "warning",
        "error"
      ],
      "description": "The overall status of the test run."
    },
    "summary": {
      "type": "string",
      "description": "A brief summary of the test outcome."
    },
    "report_data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "check": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "success",
              "warning",
              "error"
            ]
          },
          "details": {
            "type": "string"
          }
        }
      },
      "description": "An array containing the detailed results of the test."
    },
    "triggered_by": {
      "type": "string",
      "format": "email",
      "description": "The email of the admin who triggered the test."
    },
    "trigger_type": {
      "type": "string",
      "enum": [
        "manual",
        "scheduled"
      ],
      "default": "manual",
      "description": "How the test was triggered."
    }
  },
  "required": [
    "test_date",
    "component_name",
    "status",
    "report_data",
    "triggered_by"
  ],
  "rls": {
    "read": {
      "user_condition": {
        "role": "admin"
      }
    },
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default TestReportSchema;
