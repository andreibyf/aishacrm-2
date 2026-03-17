Title: AI Email Intelligence Layer

Epic:
AI Email Intelligence Layer

Goal:
Provide one coherent AI email drafting capability across operator and workflow surfaces while keeping thread history, activity sync, and C.A.R.E. approvals as the system of record.

Description:
AiSHA should be able to draft emails from multiple entry points, including scheduled Activities, AiSHA Chat, Tasks, Notes, and threaded reply flows. The drafting layer must use tenant-scoped CRM context, canonical communications history, and reusable prompt contracts so generated email remains explainable, reviewable, and safe to route through C.A.R.E. execution controls.

Acceptance Criteria:

- drafting can be initiated from Activities, AiSHA Chat, Tasks, Notes, and threaded reply context
- draft generation uses canonical thread, message, activity, and related CRM entity context where available
- every draft can be routed into C.A.R.E. approval or autonomous execution controls without bypasses
- templates and human-style guardrails can be applied consistently across drafting surfaces
- generated drafts remain linked to the relevant CRM entity and communications context

Dependencies:

- Inbound Lead Capture From Email
- CRM Email Threading and Linking
- AI Email Intelligence Layer
