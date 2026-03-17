Title: Add Outbound Delivery Status Reconciliation

Epic:
AI Email Intelligence Layer

Story:
Outbound Email Service

Estimate:
2 hours

Description:
Handle bounces, deferrals, and delivery confirmations by feeding delivery events back into backend communications routes.

Acceptance Criteria:
- delivery events map to a single outbound message record
- reconciliation updates Activity and message status through backend/Braid
- permanent failures are distinguishable from retryable failures
