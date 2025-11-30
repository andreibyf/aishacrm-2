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
      - (no delete_*, by policy)

A policy file (no-delete, scoped actions).

A thin orchestrator client in your backend that:

- Packs context (tenant, user, entities).
- Calls the MCP tools via OpenAI.
- Returns summary + actions to the CRM.
- Future AI features (e.g., AI Assistant, AI Reports) call this Brain interface.