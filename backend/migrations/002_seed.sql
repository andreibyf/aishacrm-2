-- Seed data for ai-sha crm
-- Inserts one tenant, one account, one contact, one lead, and one activity

INSERT INTO accounts (tenant_id, name, industry, website, metadata)
VALUES ('demo-tenant', 'ai-sha crm Demo Company', 'Software', 'https://ai-sha-crm.example', '{"source":"seed"}')
ON CONFLICT DO NOTHING;

WITH acct AS (
  SELECT id FROM accounts WHERE tenant_id='demo-tenant' LIMIT 1
)
INSERT INTO contacts (tenant_id, first_name, last_name, email, phone, account_id, metadata)
SELECT 'demo-tenant', 'Jane', 'Doe', 'jane.doe@example.com', '+15555550123', id, '{"role":"primary"}'
FROM acct
ON CONFLICT DO NOTHING;

INSERT INTO leads (tenant_id, first_name, last_name, email, company, status, metadata)
VALUES ('demo-tenant', 'Sam', 'Lead', 'sam.lead@example.com', 'ai-sha crm Demo Company', 'new', '{"source":"seed"}')
ON CONFLICT DO NOTHING;

INSERT INTO activities (tenant_id, type, subject, body, related_id, metadata)
VALUES ('demo-tenant', 'note', 'Welcome', 'This is a seeded welcome activity.', NULL, '{"seed":true}')
ON CONFLICT DO NOTHING;

SELECT 'accounts' AS table_name, count(*) FROM accounts WHERE tenant_id='demo-tenant'
UNION ALL
SELECT 'contacts', count(*) FROM contacts WHERE tenant_id='demo-tenant'
UNION ALL
SELECT 'leads', count(*) FROM leads WHERE tenant_id='demo-tenant'
UNION ALL
SELECT 'activities', count(*) FROM activities WHERE tenant_id='demo-tenant';
