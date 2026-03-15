# AiSHA Coding Agent Guardrails

This file defines operational rules for AI coding agents working inside the AiSHA repository.

Agents must read this file before proposing or making changes.

## Core Rules

1. Inspect the repository before making architectural assumptions.
2. All services must run in Docker containers.
3. All containers must connect to the `aisha_net` network.
4. LLMs must not access the database directly.
5. Tool execution must go through the Braid orchestration layer.
6. Do not introduce third‑party CRM platforms.
7. Tasks must originate from the /jira directory.