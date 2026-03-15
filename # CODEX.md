# CODEX.md
AiSHA Repository Guardrails for Coding Agents

This file defines the rules and operational boundaries for coding agents
(Codex, Cursor, Claude Code, Antigravity, etc.) working in this repository.

Agents MUST read this file before making any changes.

---

# 1. Project Overview

AiSHA is an agent-driven CRM platform built on containerized services.

Core goals:
- CRM automation
- AI agent orchestration
- multichannel communications
- workflow automation
- scheduling and appointment management

Agents should treat this repository as a **container-first distributed system**.

---

# 2. Architecture Principles

1. **Container First**
   - All services run in Docker containers.
   - Do NOT install system packages on the host.

2. **Network Isolation**
   - All services connect through the `aisha_net` Docker network.

3. **Modular Services**
   - Each capability must run as an independent service.

4. **CRM-Centric**
   - EspoCRM is the system of record for business data.

5. **AI Control Layer**
   - Braid or agent orchestration layer controls tool execution.

6. **Local AI**
   - Ollama is the primary local inference engine.

---

# 3. Core Services

The following services already exist and must not be replaced.

| Service | Role |
|------|------|
EspoCRM | CRM backend
EasyAppointments | Scheduling
n8n | Workflow orchestration
Flowise | LLM chains
Dockflare | Cloudflare tunnel + DNS
Grafana | monitoring
Ollama | local LLM inference
MCP Agent | multi-agent routing

Agents MUST integrate with these services rather than replacing them.

---

# 4. Resources Available to Agents

Agents may leverage the following tools and infrastructure.

### AI Models
- Ollama local models
- cloud LLM fallback if configured

### Data Systems
- PostgreSQL
- CRM entities in EspoCRM

### Workflow Systems
- n8n workflows
- MCP agent routing

### Infrastructure
- Docker
- Cloudflare tunnels
- Tailscale networking

### Storage
- Cloudflare R2
- container volumes

### Communications
- Zoho Mail
- SMS integrations
- phone call agents

---

# 5. Email System Design

Email capabilities must follow this architecture.
