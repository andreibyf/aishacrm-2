Title: Create Email Message Schema

Epic:
Self-Hosted Communications Module

Story:
CRM Email Threading and Linking

Estimate:
2 hours

Description:
Define the tenant-scoped schema for `communications_messages`, including RFC metadata, direction, delivery state, attachment references, and message body storage.

Fields:
- id
- tenant_id
- thread_id
- mailbox_id
- direction
- message_id
- in_reply_to
- references
- from_address
- to_addresses
- cc_addresses
- bcc_addresses
- subject
- text_body
- html_body
- attachment_manifest
- delivery_status
- received_at
- sent_at
- metadata

Acceptance Criteria:
- schema supports inbound and outbound messages
- unique constraints prevent duplicate ingest within a tenant
- indexes support thread timeline retrieval
