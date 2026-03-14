Title: Implement Entity Linking Rules

Epic:
Self-Hosted Communications Module

Story:
CRM Email Threading and Linking

Estimate:
3 hours

Description:
Define the deterministic linking rules that associate a message or thread with Lead, Contact, Account, Opportunity, and Activity.

Acceptance Criteria:
- linking precedence is documented
- sender and recipient address matching is tenant-scoped
- account linking can use domain mapping without crossing tenants
- opportunity linking supports explicit operator selection and rule-based fallback
