Title: Implement Inbound Message Normalizer

Epic:
Provider-Agnostic Communications Module

Story:
Email Ingestion Service

Estimate:
3 hours

Description:
Build the normalization step that converts provider-retrieved MIME messages into a structured envelope containing headers, participants, text and HTML bodies, attachments, provider metadata, safety metadata, and threading headers.

Acceptance Criteria:
- normalizer output schema is defined
- plain text and HTML parts are both handled
- provider metadata is preserved without direct CRM writes
- malformed messages fail into retry or dead-letter handling
