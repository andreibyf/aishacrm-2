Title: AI Email Intelligence Layer

Goal:
Build a tenant-safe AI email intelligence layer on top of the communications and activity system so AiSHA can draft, refine, and route email actions from structured CRM context without bypassing C.A.R.E. approval and autonomy controls.

Phase Scope:

- scheduled AI email drafting from Activities
- chat-driven email drafting from AiSHA Chat
- task-driven email drafting
- notes-driven email drafting
- threaded reply drafting from inbound and outbound email history
- template-aware drafting
- human-style guardrails and review controls
- C.A.R.E.-mediated approval and autonomous send gates

Architecture Summary:

- Frontend remains the operator surface for creating, reviewing, and approving AI-generated email drafts.
- Backend remains the policy boundary, tenant resolver, context hydrator, and Braid host.
- Communications threads, messages, and Activities remain the canonical source for thread history and timeline state.
- Draft generation must consume tenant-scoped CRM context only.
- C.A.R.E. remains the execution gate for any draft that can progress to send, approve, or autonomous follow-up behavior.
- AI email generation must reuse existing activity and communications records instead of inventing a parallel email state model.

Dependencies:

- Self-Hosted Communications Module
- Inbound Lead Capture From Email
- CRM Email Threading and Linking
- Implement Email Activity Timeline Sync
- C.A.R.E. playbook execution and approval controls

Constraints:

- tenant isolation must be preserved for every context lookup, prompt input, draft artifact, and execution path
- AI-generated email must not bypass C.A.R.E. `require_approval` and autonomy settings
- threaded drafting must anchor to canonical `communications_threads`, `communications_messages`, and email Activities
- outbound send remains queue-backed and transport-agnostic
- style guardrails must reduce robotic tone and preserve operator reviewability

Out of Scope:

- replacing the existing outbound email transport
- bypassing Activities for scheduled email workflows
- autonomous send without explicit C.A.R.E. gating
- full campaign automation redesign

Stories:

- AI Email Intelligence Layer

Success Criteria:

- AiSHA can generate tenant-scoped email drafts from Activities, Chat, Tasks, Notes, and existing threads
- operators can review or approve drafts using existing C.A.R.E. controls
- autonomous email behaviors are policy-gated through C.A.R.E. instead of custom shortcuts
- generated emails remain linked to canonical thread, message, and activity records
- draft quality is constrained by templates and human-style guardrails
