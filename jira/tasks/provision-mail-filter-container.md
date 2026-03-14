Title: Define Inbound Classification and Safety Contract

Epic:
Provider-Agnostic Communications Module

Story:
Communications Platform Foundation

Estimate:
2 hours

Description:
Define how inbound safety checks, spam classification, and quarantine decisions are represented inside AiSHA when the mailbox provider is external.

Acceptance Criteria:
- inbound flow documents when a message is accepted, quarantined, or rejected
- provider-derived spam or trust metadata has a normalized schema
- worker contract defines how safety metadata is passed into backend/Braid flows
