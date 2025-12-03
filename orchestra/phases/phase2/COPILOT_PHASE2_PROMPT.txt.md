You are assisting in implementing Phase 2 of the AI-SHA CRM v2.0 upgrade: the Conversational Interface Overhaul.

Your objectives:

1. Integrate aiBrain.runTask into all conversational flows.
2. Route all chat interactions through a task-type + mode selector:
   - read_only for questions
   - propose_actions for modification requests
3. Add support for task types:
   - summarize_entity
   - improve_followups
   - update_records
   - find_tasks
   - generate_report
   - draft_workflow
   - resolve_issue
4. Enhance system prompts for chat:
   - Require tool use before answering any CRM data questions
   - No hallucination of CRM data
   - Always call fetch_tenant_snapshot first
5. Build multi-turn tool architecture:
   - Messages → AI → tool_calls → tool results → tool summaries → AI → final answer
6. Overhaul conversation UI behavior:
   - Auto-title from first message
   - Auto-topic classification
   - Save AI proposed actions as JSON in ai_pending_operations
7. Add confirmation step in UI when AI proposes actions.

Constraints:
- DO NOT allow delete_* tools under any circumstances.
- apply_allowed mode must remain disabled.
- All writes must go through propose_actions until Phase 3.
- Maintain full tenant isolation.
- Use existing aiBrain.ts implementation as authoritative behavior.

Deliverables Copilot must generate:
- Updated ai.js conversation handler logic
- New task selector logic
- Updated prompts
- UI changes needed for confirmation workflow
- Any new DB tables needed for proposed actions
- Complete code diffs (PR-ready)

Begin when prompted with tasks or file refs.
