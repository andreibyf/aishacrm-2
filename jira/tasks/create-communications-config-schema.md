Title: Create Communications Config Schema

Epic:
Provider-Agnostic Communications Module

Story:
Communications Platform Foundation

Estimate:
2 hours

Description:
Define the tenant-level mailbox, provider connection, sync, and sending configuration schema used by the communications module.

Acceptance Criteria:
- schema covers provider type, inbound connection settings, outbound submission settings, mailbox identifiers, sender identity, and feature flags
- schema maps cleanly to tenant UUIDs
- owner-tenant bootstrap path is defined
- schema supports multiple providers without changing backend contracts
