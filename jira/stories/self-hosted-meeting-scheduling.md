Title: Provider-Agnostic Meeting Scheduling

Epic:
Provider-Agnostic Communications Module

Goal:
Support meeting scheduling from the communications module using existing CRM activities rather than Google Calendar.

Description:
Generate standards-based calendar invites from CRM meeting activities, send them through the provider-backed outbound pipeline, and process invite replies from inbound mail. Scheduling must use existing Activity and calendar structures so the module fits the current CRM timeline and Braid `schedule_meeting` behavior.

Acceptance Criteria:
- outbound meeting emails can include valid ICS invitations
- meeting invitation creation results in a CRM Activity of type `meeting`
- inbound accept, decline, and tentative responses update the related meeting Activity
- invite processing remains tenant-scoped and auditable
- scheduling flow is not coupled to a single mailbox vendor

Dependencies:
- Outbound Email Service
- Email Ingestion Service
- CRM Email Threading and Linking
