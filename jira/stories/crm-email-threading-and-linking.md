Title: CRM Email Threading and Linking

Epic:
Self-Hosted Communications Module

Goal:
Store every email as a durable thread and link it to the existing CRM entity graph.

Description:
Introduce the communications storage model and the logic that maps inbound and outbound messages onto Lead, Contact, Account, Opportunity, and Activity. Activities remain the primary timeline surface, while dedicated communications tables preserve RFC thread metadata, participants, attachments, and delivery history.

Acceptance Criteria:
- communications thread and message tables exist with tenant isolation
- each message can link to one or more CRM entities
- email Activity records are generated or updated for each message
- thread lookups and entity links are deterministic and auditable
- attachments and metadata remain scoped to the originating tenant

Dependencies:
- Communications Platform Foundation
