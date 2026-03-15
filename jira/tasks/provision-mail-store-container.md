Title: Define Provider Sync State and Message Retention Contract

Epic:
Provider-Agnostic Communications Module

Story:
Communications Platform Foundation

Estimate:
2 hours

Description:
Define how AiSHA stores provider sync cursors, message fetch checkpoints, replay metadata, and optional raw message retention without assuming a self-hosted mail store.

Acceptance Criteria:
- sync cursor model is documented
- raw message retention expectations are defined
- replay and recovery path is documented
- tenant-scoped storage boundaries are explicit
