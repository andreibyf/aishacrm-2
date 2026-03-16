Title: Implement Autonomous Drafting and Sending Controls

Epic:
AI Email Intelligence Layer

Story:
AI Email Intelligence Layer

Estimate:
4 hours

Description:
Wire AI email drafting into C.A.R.E. autonomy and approval policy gates so draft generation, approval, and send behavior follow one consistent control model.

Acceptance Criteria:

- AI email execution paths honor C.A.R.E. `use_ai_generation` and `require_approval` behavior
- autonomous send behavior is explicitly gated and auditable
- approval-required drafts pause in a reviewable state instead of sending directly
- no AI email send path bypasses C.A.R.E. controls
