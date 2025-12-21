-- Seed a minimal dataset for reports/calendar validation
DO $$
DECLARE
  v_tenant text := 'test-tenant-001';
  v_account uuid;
  v_contact uuid;
  v_lead uuid;
  v_opp uuid;
BEGIN
  -- Account
  INSERT INTO accounts(tenant_id, name, industry, website, type, created_at)
  VALUES (v_tenant, 'ReportCo', 'Software', 'https://reportco.example', 'prospect', now())
  RETURNING id INTO v_account;

  -- Contact
  INSERT INTO contacts(tenant_id, account_id, first_name, last_name, email, phone, status, metadata, created_at)
  VALUES (v_tenant, v_account, 'Rita', 'Reports', 'rita@reportco.example', '+1-555-7777', 'active', '{}'::jsonb, now())
  RETURNING id INTO v_contact;

  -- Lead (linked to account for related-people view)
  INSERT INTO leads(tenant_id, first_name, last_name, email, phone, company, status, source, account_id, metadata, created_at)
  VALUES (v_tenant, 'Leo', 'Lead', 'leo@prospects.example', '+1-555-8888', 'Prospects LLC', 'contacted', 'website', v_account, '{}'::jsonb, now())
  RETURNING id INTO v_lead;

  -- Opportunity
  INSERT INTO opportunities(tenant_id, name, stage, amount, probability, close_date, account_id, contact_id, metadata, created_at)
  VALUES (v_tenant, 'ReportCo POC', 'prospecting', 12000, 25, (now() + interval '30 days')::date, v_account, v_contact, '{}'::jsonb, now())
  RETURNING id INTO v_opp;

  -- Activities (one with date/time for calendar, one without)
  INSERT INTO activities(tenant_id, type, subject, body, related_id, metadata, created_at)
  VALUES
    (v_tenant, 'meeting', 'Kickoff with Rita', 'Discuss scope', v_contact,
      jsonb_build_object('related_to','contact','assigned_to','manager@example.com','due_date', to_char((now() + interval '2 days')::date,'YYYY-MM-DD'),'due_time','10:30'),
      now()),
    (v_tenant, 'email', 'Send deck', 'Follow-up materials', v_contact,
      jsonb_build_object('related_to','contact'),
      now());
END$$;
