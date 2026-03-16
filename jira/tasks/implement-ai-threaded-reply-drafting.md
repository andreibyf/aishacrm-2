Title: Implement AI Threaded Reply Drafting

Epic:
AI Email Intelligence Layer

Story:
AI Email Intelligence Layer

Estimate:
4 hours

Description:
Generate reply drafts from existing communications threads by using canonical message history, participants, and linked CRM entities.

Acceptance Criteria:

- reply drafting uses `communications_threads` and `communications_messages` as canonical history
- inbound and outbound message history is available to the drafting layer
- generated replies preserve thread context and can map to the existing thread on send
- reply drafting respects tenant-scoped participant and entity data only
