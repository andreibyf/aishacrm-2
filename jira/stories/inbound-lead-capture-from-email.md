Title: Inbound Lead Capture From Email

Epic:
Self-Hosted Communications Module

Goal:
Turn unknown inbound business email into controlled CRM lead capture for the owner tenant.

Description:
When inbound mail comes from an address that is not already linked to a Contact, Lead, or Account, the module should classify it, create a reviewable lead-capture item, and optionally promote it into a Lead through backend/Braid workflows. This keeps prospect intake inside AiSHA CRM without relying on Google Workspace.

Acceptance Criteria:
- unknown senders can be placed into a tenant-scoped lead-capture queue
- promotion into Lead is executed by backend/Braid only
- duplicate suppression uses tenant, sender address, sender domain, and recent thread history
- captured leads retain source metadata from the inbound message

Dependencies:
- Email Ingestion Service
- CRM Email Threading and Linking
