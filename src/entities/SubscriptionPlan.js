/**
 * SubscriptionPlan Entity Schema
 * Full JSON schema with RLS rules for SubscriptionPlan
 */

export const SubscriptionPlanSchema = {
  "name": "SubscriptionPlan",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Name of the plan (e.g., Starter, Growth)"
    },
    "description": {
      "type": "string",
      "description": "A short description of the plan"
    },
    "price_monthly": {
      "type": "number",
      "description": "Monthly price in USD"
    },
    "user_limit": {
      "type": "number",
      "description": "Maximum number of users allowed (-1 for unlimited)"
    },
    "stripe_price_id": {
      "type": "string",
      "description": "The Price ID from your Stripe account for this plan"
    },
    "features": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of features included in this plan"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether this plan is available for new subscriptions"
    },
    "display_order": {
      "type": "number",
      "default": 0
    }
  },
  "required": [
    "name",
    "price_monthly",
    "user_limit",
    "stripe_price_id"
  ],
  "rls": {
    "read": {},
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default SubscriptionPlanSchema;
