Title: Define Provider Adapter Runtime Contract

Epic:
Provider-Agnostic Communications Module

Story:
Communications Platform Foundation

Estimate:
2 hours

Description:
Define the runtime contract for provider adapters used by communications-worker and communications-dispatcher. The contract must support IMAP-style inbound retrieval and SMTP-style outbound submission without hard-coding Zoho, Fastmail, Proton, or Google.

Acceptance Criteria:
- provider adapter interface is documented for inbound retrieval and outbound submission
- tenant-scoped credential and connection expectations are defined
- fallback and retry expectations are defined
- adapter contract avoids provider-specific CRM logic
