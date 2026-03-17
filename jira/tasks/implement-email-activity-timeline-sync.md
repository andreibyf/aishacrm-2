Title: Implement Email Activity Timeline Sync

Epic:
AI Email Intelligence Layer

Story:
CRM Email Threading and Linking

Estimate:
2 hours

Description:
Define the synchronization behavior that mirrors communications messages into CRM Activities of type `email` and keeps status in sync.

Acceptance Criteria:
- each message creates or updates one email Activity
- inbound and outbound direction is visible in Activity metadata
- timeline entries point back to the canonical thread and message records
