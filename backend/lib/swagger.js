/**
 * Swagger/OpenAPI Configuration
 * Auto-generates API documentation from route files
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Aisha CRM API',
      version: '1.0.0',
      description: 'Independent CRM backend with 197 endpoints across 26 categories',
      contact: {
        name: 'API Support',
        email: 'support@aishacrm.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'https://api.aishacrm.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'error'
            },
            message: {
              type: 'string',
              example: 'Error description'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'success'
            },
            data: {
              type: 'object'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      { name: 'accounts', description: 'Account management operations' },
      { name: 'activities', description: 'Activity logging and tracking' },
      { name: 'ai', description: 'AI-powered features and assistants' },
      { name: 'announcements', description: 'System announcements' },
      { name: 'apikeys', description: 'API key management' },
      { name: 'billing', description: 'Billing and payment operations' },
      { name: 'bizdev', description: 'Business development tools' },
      { name: 'cashflow', description: 'Cash flow analysis' },
      { name: 'clients', description: 'Client relationship management' },
      { name: 'contacts', description: 'Contact management' },
      { name: 'cron', description: 'Scheduled job management' },
      { name: 'database', description: 'Database operations' },
      { name: 'documents', description: 'Document storage' },
      { name: 'employees', description: 'Employee management' },
      { name: 'integrations', description: 'Third-party integrations' },
      { name: 'leads', description: 'Lead generation and management' },
      { name: 'metrics', description: 'Performance metrics and analytics' },
      { name: 'notes', description: 'Note-taking and comments' },
      { name: 'notifications', description: 'User notifications' },
      { name: 'opportunities', description: 'Sales opportunity tracking' },
      { name: 'permissions', description: 'Access control' },
      { name: 'reports', description: 'Dashboard stats and exports' },
      { name: 'storage', description: 'File storage operations' },
      { name: 'system-logs', description: 'System logging' },
      { name: 'system', description: 'Health checks and diagnostics' },
      { name: 'tenants', description: 'Multi-tenant management' },
      { name: 'users', description: 'User account management' },
      { name: 'validation', description: 'Data validation' },
      { name: 'webhooks', description: 'Webhook handling' },
      { name: 'workflows', description: 'Workflow automation' }
    ]
  },
  // Paths to files containing OpenAPI definitions
  apis: ['./routes/*.js', './server.js']
};

export const swaggerSpec = swaggerJsdoc(options);
