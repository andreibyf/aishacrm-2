Title: Implement Outbound Mail Queue Worker

Epic:
Provider-Agnostic Communications Module

Story:
Outbound Email Service

Estimate:
3 hours

Description:
Define the queue consumer that takes outbound jobs from backend coordination and submits them through the tenant-configured provider adapter.

Acceptance Criteria:
- worker input contract includes tenant_id, mailbox_id, thread_id, provider connection, and message payload
- RFC threading headers are generated or preserved
- retry behavior and poison-job handling are defined
- no worker path writes CRM state directly
