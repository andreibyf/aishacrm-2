# n8n External Access Configuration

**Status:** n8n is no longer embedded in the CRM UI as of this update.

## Overview

n8n workflow automation platform runs as a separate Docker container and is accessed externally via its own URL, not embedded within the CRM interface.

## Access URLs

### Development
- **Direct access:** http://localhost:5678
- **Via nginx proxy:** http://localhost:5679
- Both URLs provide the same n8n editor interface

### Production
- **Via nginx proxy:** http://147.189.173.237:5679
- Access n8n directly through this URL in a separate browser tab/window
- Optionally accessible via reverse proxy at production domain path

## Docker Configuration

The n8n service remains in both `docker-compose.yml` and `docker-compose.prod.yml` for:
- Building custom workflows that interact with CRM APIs
- Creating automation pipelines using n8n's 400+ integrations
- Webhook-based CRM data operations

### Environment Variables

Key n8n configuration (see docker-compose files):
```bash
N8N_PORT=5678
N8N_HOST=0.0.0.0
N8N_EDITOR_BASE_URL=https://app.aishacrm.com/n8n  # Production
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
```

## Workflow Integration with CRM

While n8n is not embedded in the CRM UI, workflows can still interact with the CRM via:

1. **Webhook Endpoints**: n8n workflows can call CRM API endpoints
2. **HTTP Request Node**: Use n8n's HTTP request node to interact with CRM backend
3. **Authentication**: Use API keys or bearer tokens for CRM API authentication

### Example: Calling CRM API from n8n

```javascript
// HTTP Request Node Configuration
Method: POST
URL: http://backend:3001/api/leads
Authentication: Bearer Token
Headers:
  Content-Type: application/json
Body:
  {
    "tenant_id": "your-tenant-uuid",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }
```

## Security Notes

- n8n uses Basic Auth for access control
- Set strong credentials via `N8N_BASIC_AUTH_USER` and `N8N_BASIC_AUTH_PASSWORD`
- Production instances should be accessed via HTTPS reverse proxy
- Consider IP whitelisting for additional security

## Migration from Embedded UI

Previously, n8n was accessible via the CRM Settings page under the "n8n Workflows" tab. This has been removed to:
- Simplify the CRM UI
- Reduce iframe complexity and security concerns
- Allow n8n to be used independently with full functionality
- Improve performance by removing iframe overhead

Users who need n8n should bookmark the external URL and access it directly.

## Container Management

The n8n containers (`n8n` and `n8n-proxy`) remain in the docker-compose configuration:

```bash
# Start all services including n8n
docker compose up -d

# Check n8n status
docker compose ps n8n n8n-proxy

# View n8n logs
docker logs aishacrm-n8n

# Restart n8n only
docker compose restart n8n
```

## Related Documentation

- See `N8N_PATH_EMBEDDING.md` for historical embedded configuration (deprecated)
- See `N8N_VALIDATION_CHECKLIST.md` for deployment validation steps
