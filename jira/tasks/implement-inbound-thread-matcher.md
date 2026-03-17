Title: Implement Inbound Thread Matcher

Epic:
AI Email Intelligence Layer

Story:
Email Ingestion Service

Estimate:
2 hours

Description:
Match inbound messages to existing communications threads using RFC identifiers and tenant-local fallbacks.

Acceptance Criteria:
- primary match uses `message-id`, `in-reply-to`, and `references`
- secondary match uses normalized subject and participants within one tenant
- ambiguous matches route to review or create a new thread deterministically
