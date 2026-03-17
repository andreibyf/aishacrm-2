Title: Create Email Thread Schema

Epic:
AI Email Intelligence Layer

Story:
CRM Email Threading and Linking

Estimate:
2 hours

Description:
Define the tenant-scoped schema for `communications_threads`, including mailbox ownership, canonical subject, thread key strategy, and last-message tracking.

Fields:
- id
- tenant_id
- mailbox_id
- thread_key
- canonical_subject
- first_message_at
- last_message_at
- last_direction
- last_message_id
- status
- metadata

Acceptance Criteria:
- thread table fields are defined with tenant_id as a required isolation key
- indexes support tenant-scoped thread lookup by thread key and recency
- schema supports linking to Activities without duplicating message payloads
