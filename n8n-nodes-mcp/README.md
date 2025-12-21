# n8n-nodes-mcp

This is an n8n community node for connecting to your Model Context Protocol (MCP) server from n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Features

This node allows you to:
- **List Contacts** - Retrieve all contacts from your CRM
- **Get Contact** - Get a specific contact by ID
- **Create Contact** - Create a new contact
- **List Accounts** - Retrieve all accounts
- **List Leads** - Retrieve all leads
- **List Opportunities** - Retrieve all opportunities
- **Custom Prompt** - Send custom prompts to the MCP server

## Installation

### n8n Cloud (not applicable for self-hosted)

For n8n cloud users, this node must be installed via npm.

### Self-hosted n8n

For self-hosted n8n instances, you can install this node manually:

#### Option 1: Install via Docker (Recommended)

1. Build the node package:
```bash
cd n8n-nodes-mcp
npm install
npm run build
```

2. Update your n8n docker-compose.yml to mount the node:
```yaml
n8n:
  image: n8nio/n8n:latest
  volumes:
    - n8n_data:/home/node/.n8n
    - ./n8n-nodes-mcp:/home/node/.n8n/custom
  environment:
    - N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom
```

3. Restart n8n:
```bash
docker compose restart n8n
```

#### Option 2: Install via npm

```bash
npm install n8n-nodes-mcp
```

Then set the `N8N_CUSTOM_EXTENSIONS` environment variable to point to the node_modules directory.

## Configuration

The MCP Server node requires:
- **MCP Server URL**: The URL of your MCP server (default: `http://braid-mcp-node-server:8000`)
- **Tenant ID**: Your CRM tenant identifier (default: `local-tenant-001`)

## Usage

### Example: List All Contacts

1. Add the "MCP Server" node to your workflow
2. Select Resource: **CRM**
3. Select Operation: **List Contacts**
4. Enter your Tenant ID
5. Execute the node

### Example: Create a Contact

1. Add the "MCP Server" node to your workflow
2. Select Resource: **CRM**
3. Select Operation: **Create Contact**
4. Enter contact data as JSON:
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "tenant_id": "local-tenant-001"
}
```
5. Execute the node

### Example: Custom Prompt

1. Add the "MCP Server" node to your workflow
2. Select Resource: **Custom Prompt**
3. Enter your prompt (e.g., "What are my top 5 opportunities?")
4. Execute the node

## Compatibility

Tested with:
- n8n version 1.x
- MCP Server version 1.0

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Model Context Protocol](https://modelcontextprotocol.io/)

## License

[MIT](LICENSE.md)
