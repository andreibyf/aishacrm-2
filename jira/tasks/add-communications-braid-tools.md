Title: Add Communications Braid Tools

Epic:
AI Email Intelligence Layer

Story:
Communications Platform Foundation

Estimate:
3 hours

Description:
Define the Braid tool surface required by the communications module.

Tool Candidates:
- upsert_email_thread
- ingest_email_message
- queue_outbound_email
- link_email_entities
- queue_inbound_lead_review
- reconcile_delivery_event
- process_meeting_reply

Acceptance Criteria:
- tool list is approved and scoped
- no direct database write path is required from mail containers
- tool responsibilities align with backend route boundaries
