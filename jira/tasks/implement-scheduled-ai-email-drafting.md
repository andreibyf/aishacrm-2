Title: Implement Scheduled AI Email Drafting

Epic:
AI Email Intelligence Layer

Story:
AI Email Intelligence Layer

Estimate:
3 hours

Description:
Connect `scheduled_ai_email` activities and `ai_email_config` into the AI email drafting pipeline so scheduled activities can generate a draft using related CRM and communications context.

Acceptance Criteria:

- scheduled AI email activities can request a draft from backend AI orchestration
- `ai_email_config` subject and body fields are used as structured draft inputs
- generated drafts attach back to the originating activity and related entity context
- resulting send or approval flow remains compatible with C.A.R.E. controls
