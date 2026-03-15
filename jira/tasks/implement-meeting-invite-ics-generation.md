Title: Implement Meeting Invite ICS Generation

Epic:
Self-Hosted Communications Module

Story:
Self-Hosted Meeting Scheduling

Estimate:
2 hours

Description:
Generate RFC-compliant ICS invitations from CRM meeting Activities and send them through the outbound mail flow.

Acceptance Criteria:
- ICS payload includes organizer, attendees, UID, DTSTART, DTEND, and status
- invite generation is tied to existing Activity data
- outbound invite stays linked to the original thread and Activity
