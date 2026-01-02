# API Tests for Braid MCP Server

This directory contains HTTP request files for testing the Braid MCP Server.

## Recommended: REST Client Extension (FREE! ✨)

**Install:** [REST Client by Huachao Mao](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)

### Why REST Client over Thunder Client Free?

✅ **Completely free** - No limitations  
✅ **File-based** - Tests are saved in `.http` files (easy to version control)  
✅ **Variables** - Use `@variables` and `{{placeholders}}`  
✅ **Dynamic values** - `{{$timestamp}}`, `{{$datetime}}`, `{{$guid}}`  
✅ **Response saving** - Save responses for comparison  
✅ **Environment switching** - Dev, staging, prod configs  

## Files

- **`braid-mcp.http`** - Template file (tracked in git) with placeholder values
- **`braid-mcp.local.http`** - Your local copy (ignored by git) with actual tenant ID
- **`README.md`** - This file

## Quick Start

1. **Install REST Client extension**
2. **Use the local file:** `braid-mcp.local.http` (already has your tenant ID)
3. **Click "Send Request"** above any request

### First Test

Open `braid-mcp.local.http` and click "Send Request" above:

```http
### 1. Health Check
GET http://localhost:8000/health
```

That's it! Response appears in the right panel.

## Git Strategy

### ✅ Tracked in Git:
- `braid-mcp.http` - Template with placeholders (`YOUR_TENANT_ID_HERE`)
- `README.md` - Documentation

### ❌ Ignored by Git:
- `*.local.http` - Local copies with actual credentials
- Added to `.gitignore` for security

### Why This Approach?

- **Team shares templates** - Everyone gets the same test structure
- **Local credentials stay private** - Your tenant IDs never committed
- **Easy onboarding** - New developers copy template and fill in their values

## Configuration

Your local file (`braid-mcp.local.http`) has these variables at the top:

```http
@baseUrl = http://localhost:8000
@tenantId = a11dfb63-4b18-4eb8-872e-747af2e37c46
```

Update these if needed for different environments.

## Available Tests

1. **Health Check** - Server status
2. **List Adapters** - Available Braid adapters
3. **Queue Stats** - Job queue metrics
4. **Memory Status** - Redis memory layer status
5. **Search CRM Accounts** - Query accounts
6. **Search CRM Leads** - Query leads
7. **Search CRM Contacts** - Query contacts
8. **Search CRM Opportunities** - Query opportunities
9. **Create CRM Activity** - Create test activity
10. **Search Wikipedia** - Web adapter test
11. **Get Wikipedia Page** - Fetch full article
12. **Generate JSON with LLM** - AI-powered JSON generation
13. **List GitHub Repos** - GitHub integration test

## Alternatives

If you prefer other tools:

### 1. Thunder Client (Free version - limited)
- See `../braid-mcp-node-server/THUNDER_CLIENT_FREE.md` for copy-paste requests

### 2. curl (Command line)
```bash
curl http://localhost:8000/health
```

### 3. PowerShell (Windows)
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/health"
```

### 4. Postman (Desktop app)
- Import the requests manually
- Good for team collaboration

## Security Best Practices

✅ **DO:**
- Use `*.local.http` for files with real credentials
- Keep templates (`.http`) with placeholders in git
- Document required variables in templates

❌ **DON'T:**
- Commit files with actual tenant IDs (use `.local.http`)
- Put API keys or secrets in tracked files
- Share your `.local.http` files

## Troubleshooting

**Connection Refused:**
- Check if containers are running: `docker ps | grep braid`
- Restart server: `cd braid-mcp-node-server && docker compose restart`

**404 Not Found:**
- Verify endpoint: `/mcp/run` (POST) or `/health` (GET)
- Check request body format

**500 Internal Server Error:**
- Check container logs: `docker logs braid-mcp-server`
- Verify tenant ID is correct

---

**Recommendation:** Use `braid-mcp.local.http` with REST Client extension - it's the best free option! 🚀
