What the Brain is:
“The AI Brain is implemented as an OpenAI agent using the Braid MCP server with CRM tools (read/search/create/update only).”

Input schema:
tenant_id, user_id, task_type, context_entities, mode (read_only | propose_actions | apply_allowed).

Output schema:
summary, insights[], proposed_actions[] (with type, entity, payload), requires_confirmation.

Treat the Braid MCP server as the “AI Brain”

Instead of inventing a new brain service, do this:

- AI Brain = OpenAI + Braid MCP + your CRUD tools (no delete)
- The “brain” is essentially:

A set of MCP tools:

      - crm.search_*
      - crm.create_*
      - crm.update_*
      - crm.list_workflow_templates
      - crm.get_workflow_template
      - crm.instantiate_workflow_template
      - crm.update_workflow
      - crm.toggle_workflow_status
      - (no delete_*, by policy)

A policy file (no-delete, scoped actions).

A thin orchestrator client in your backend that:

- Packs context (tenant, user, entities).
- Calls the MCP tools via OpenAI.
- Returns summary + actions to the CRM.
- Future AI features (e.g., AI Assistant, AI Reports) call this Brain interface.

---

## Workflow Management Tools

The AI can manage workflows through MCP tools:

### Tool Reference

| Tool | Purpose | Requires tenant_id |
|------|---------|-------------------|
| `crm.list_workflow_templates` | List all available templates | ❌ No |
| `crm.get_workflow_template` | Get template details with nodes/connections | ❌ No |
| `crm.instantiate_workflow_template` | Create workflow from template | ✅ Yes |
| `crm.update_workflow` | Update workflow config (name, nodes, connections) | ✅ Yes |
| `crm.toggle_workflow_status` | Activate/deactivate workflow | ✅ Yes |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  WORKFLOW_TEMPLATE                       │
│  (System-wide, read-only for AI)                        │
│  ├── is_system=true → Cannot be modified               │
│  └── Used as blueprints for creating workflows         │
└───────────────────────────┬─────────────────────────────┘
                            │ instantiate
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     WORKFLOW                             │
│  (Tenant-scoped, fully manageable by AI)                │
│  ├── tenant_id = required                              │
│  ├── AI can: create, update, activate, deactivate      │
│  └── AI can NOT: delete templates                      │
└─────────────────────────────────────────────────────────┘
```

### Permissions Model

- **Templates** are read-only references (system templates cannot be modified)
- **Workflows** are tenant-specific instances that can be configured
- AI can create workflows FROM templates with custom parameters
- AI can update workflow configurations but cannot delete templates