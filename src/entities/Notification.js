/**
 * Notification Entity Schema
 * Full JSON schema with RLS rules for Notification
 */

export const NotificationSchema = {
  "name": "Notification",
  "type": "object",
  "properties": {
    "user_email": {
      "type": "string",
      "format": "email",
      "description": "The email of the user this notification is for."
    },
    "title": {
      "type": "string",
      "description": "The title of the notification."
    },
    "description": {
      "type": "string",
      "description": "A brief description of the event."
    },
    "is_read": {
      "type": "boolean",
      "default": false,
      "description": "Whether the user has read the notification."
    },
    "link": {
      "type": "string",
      "description": "A URL to navigate to when the notification is clicked."
    },
    "icon": {
      "type": "string",
      "description": "Lucide icon name to display (e.g., 'Users', 'Target')."
    }
  },
  "required": [
    "user_email",
    "title"
  ],
  "rls": {
    "read": {
      "$or": [
        {
          "user_email": "{{user.email}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    },
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default NotificationSchema;
