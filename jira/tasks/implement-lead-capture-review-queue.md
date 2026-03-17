Title: Implement Lead Capture Review Queue

Epic:
AI Email Intelligence Layer

Story:
Inbound Lead Capture From Email

Estimate:
2 hours

Description:
Define the review queue record used when inbound mail cannot be safely auto-promoted into a Lead.

Acceptance Criteria:
- queue record schema includes tenant_id, sender, subject, classification, and proposed entity links
- operators can review before promotion
- queue items point back to the source thread and message
