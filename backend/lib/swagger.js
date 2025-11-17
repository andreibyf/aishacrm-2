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
      version: '2.0.0',
      description: `# Independent CRM Backend

**197 endpoints** organized across **26 API categories** for comprehensive customer relationship management.

## Key Features

- **Multi-tenant Architecture**: UUID-based tenant isolation and management
- **Database**: PostgreSQL (Supabase) with automatic Base44 failover
- **Workflow Automation**: n8n integration for visual workflow creation
- **AI Agent Operations**: MCP (Model Context Protocol) server support
- **Performance**: Real-time monitoring with intelligent caching
- **Security**: Rate limiting, CORS protection, JWT authentication
- **Deployment**: Docker containers (Frontend: port 4000, Backend: port 4001)

## Documentation

For detailed guides and examples, visit the API documentation at \`/api-docs\``,
      contact: {
        name: 'API Support',
        email: 'support@aishacrm.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:4001',
        description: 'Development server (Docker)'
      },
      {
        url: 'http://localhost:3001',
        description: 'Development server (Local)'
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
      { name: 'accounts', description: 'Manage customer accounts and organizations' },
      { name: 'activities', description: 'Track and log customer interactions' },
      { name: 'bizdev', description: 'Business development tools and pipelines (legacy endpoints)' },
      { name: 'bizdevsources', description: 'External data sources for lead generation' },
      { name: 'clients', description: 'Client relationship and account management' },
      { name: 'contacts', description: 'Individual contact management and profiles' },
      { name: 'documents', description: 'Document upload, storage, and retrieval' },
      { name: 'employees', description: 'Employee profiles, roles, and permissions' },
      { name: 'integrations', description: 'Third-party integrations (n8n, webhooks, APIs)' },
      { name: 'leads', description: 'Lead capture, qualification, and conversion' },
      { name: 'modulesettings', description: 'Application module configuration and toggles' },
      { name: 'notes', description: 'Internal notes, comments, and annotations' },
      { name: 'notifications', description: 'User alerts and notification preferences' },
      { name: 'opportunities', description: 'Sales pipeline and opportunity management' },
      { name: 'permissions', description: 'User roles and access control management' },
      { name: 'reports', description: 'Generate reports, exports, and dashboard data' },
      { name: 'storage', description: 'Cloud file storage and asset management' },
      { name: 'system-logs', description: 'Application logs, errors, and audit trails' },
      { name: 'system', description: 'System health, status, and diagnostics' },
      { name: 'telephony', description: 'Phone system integration and call management' },
      { name: 'tenants', description: 'Multi-tenant management and provisioning' },
      { name: 'users', description: 'User authentication, profiles, and sessions' },
      { name: 'workflows', description: 'n8n workflow automation and triggers' }
    ]
  },
  // Paths to files containing OpenAPI definitions
  apis: ['./routes/*.js', './server.js']
};

export const swaggerSpec = swaggerJsdoc(options);
