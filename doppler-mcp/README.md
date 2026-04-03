# Doppler MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes Doppler secrets management as tools for LLM agents. Built with FastMCP (Python).

## Why this exists

The AiSHA CRM sandbox environment has no outbound network access. Doppler secrets can't be queried directly via `curl`. This MCP runs outside the sandbox (like Supabase MCP does) and proxies Doppler API calls as structured tools.

---

## Tools

| Tool                         | Description                                      | Token type required  |
| ---------------------------- | ------------------------------------------------ | -------------------- |
| `doppler_list_projects`      | List all workspace projects                      | Personal (`dp.pt.*`) |
| `doppler_get_project`        | Get project details by slug                      | Personal or Service  |
| `doppler_list_configs`       | List configs/environments for a project          | Personal or Service  |
| `doppler_get_config`         | Get config details                               | Personal or Service  |
| `doppler_list_secrets`       | List secret names (values optional, default off) | Personal or Service  |
| `doppler_get_secret`         | Get a single secret value                        | Personal or Service  |
| `doppler_get_secrets`        | Get multiple or all secret values                | Personal or Service  |
| `doppler_download_secrets`   | Download secrets in env/json/yaml/docker format  | Personal or Service  |
| `doppler_list_activity_logs` | View who changed what and when                   | Personal or Service  |

### Token types

| Token prefix | Scope          | Use for                                        |
| ------------ | -------------- | ---------------------------------------------- |
| `dp.st.*`    | Single config  | Fetching secrets from one specific environment |
| `dp.pt.*`    | Full workspace | Listing projects, browsing all configs         |

---

## Setup

### Prerequisites

- Python 3.10+
- pip

### Install dependencies

```bash
cd doppler-mcp
pip install "mcp[cli]>=1.0.0" "httpx>=0.27.0" "pydantic>=2.0.0"
```

### Run manually (test)

```bash
DOPPLER_TOKEN=dp.pt.YOUR_TOKEN python server.py
```

If `DOPPLER_TOKEN` is not set, the server exits immediately with a clear error message.

---

## Connecting to Cowork / Claude

Add the server as an MCP in your Claude/Cowork configuration:

```json
{
  "mcpServers": {
    "doppler": {
      "command": "python",
      "args": ["/path/to/aishacrm-2/doppler-mcp/server.py"],
      "env": {
        "DOPPLER_TOKEN": "dp.pt.YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Replace `/path/to/aishacrm-2` with the actual path on your machine and `dp.pt.YOUR_TOKEN_HERE` with a real token from the [Doppler dashboard](https://dashboard.doppler.com) → **Access** → **Service Tokens** or **Personal Tokens**.

### Windows path example

```json
"args": ["C:\\Users\\andre\\Documents\\GitHub\\aishacrm-2\\doppler-mcp\\server.py"]
```

---

## Security notes

- `doppler_list_secrets` defaults to **names only** (`include_values: false`). Values are only returned when explicitly requested.
- All tools are read-only — no secrets are created, updated, or deleted.
- The token is passed via environment variable, never hardcoded.
- Rate limit: Doppler allows 240 requests/minute per token. The server surfaces 429 errors with a clear retry message.

---

## Project structure

```
doppler-mcp/
├── server.py        # FastMCP server with 9 tools
├── pyproject.toml   # Package metadata and dependencies
└── README.md        # This file
```
