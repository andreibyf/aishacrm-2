---
description: Standards for Braid SDK, MCP tools, and AI engine integration.
---

# Braid + MCP Integration Standards

When generating code involving Braid SDK or MCP:
- Use braid-llm-kit conventions.
- Use tool calls for structured actions.
- Keep MCP node server logic modular.
- Use async handlers for tools.
- Follow aiEngine failover patterns.
- Use clear naming for tools and handlers.
- Follow folder structure: src/braid, src/mcp, src/ai.
- Write clear comments for complex logic.
- Ensure proper error handling and logging for MCP tools.
