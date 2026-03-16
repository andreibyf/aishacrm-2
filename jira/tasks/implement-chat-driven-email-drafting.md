Title: Implement Chat-Driven Email Drafting

Epic:
AI Email Intelligence Layer

Story:
AI Email Intelligence Layer

Estimate:
3 hours

Description:
Allow AiSHA Chat to draft outbound emails using tenant-scoped CRM context and existing communications history where a thread already exists.

Acceptance Criteria:

- chat can request an email draft for a lead, contact, account, or opportunity context
- existing thread context is included when available
- the produced draft is persisted or surfaced in a form that can enter approval and send workflows
- chat drafting does not bypass C.A.R.E. execution gates
