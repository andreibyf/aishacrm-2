-- Seed a minimal dataset for labor-depot for reports/calendar validation
DO $$
DECLARE
  v_tenant text := 'labor-depot';
  v_account uuid;
  v_contact uuid;
  v_lead uuid;
  v_opp uuid;
BEGIN
  -- Account
  INSERT INTO accounts(tenant_id, name, industry, website, type, created_at)
  VALUES (v_tenant, 'Labor Depot Co', 'Industrial', 'https://labor-depot.example', 'prospect', now())
  RETURNING id INTO v_account;

  -- Contact
  INSERT INTO contacts(tenant_id, account_id, first_name, last_name, email, phone, status, metadata, created_at)
  VALUES (v_tenant, v_account, 'Lara', 'Depot', 'lara@labor-depot.example', '+1-555-4444', 'active', '{}'::jsonb, now())
  RETURNING id INTO v_contact;

  -- Lead (linked to account)
  INSERT INTO leads(tenant_id, first_name, last_name, email, phone, company, status, source, account_id, metadata, created_at)
  VALUES (v_tenant, 'Lee', 'Worker', 'lee@workers.example', '+1-555-3333', 'Workers LLC', 'contacted', 'website', v_account, '{}'::jsonb, now())
  RETURNING id INTO v_lead;

  -- Opportunity
  INSERT INTO opportunities(tenant_id, name, stage, amount, probability, close_date, account_id, contact_id, metadata, created_at)
  VALUES (v_tenant, 'Labor Depot Trial', 'prospecting', 5000, 30, (now() + interval '21 days')::date, v_account, v_contact, '{}'::jsonb, now())
  RETURNING id INTO v_opp;

  -- Activities (one with date/time for calendar, one without)
  INSERT INTO activities(tenant_id, type, subject, body, related_id, metadata, created_at)
  VALUES
    (v_tenant, 'meeting', 'Kickoff with Lara', 'Discuss needs', v_contact,
      jsonb_build_object('related_to','contact','assigned_to','ops@labor-depot.example','due_date', to_char((now() + interval '3 days')::date,'YYYY-MM-DD'),'due_time','09:00'),
      now()),
    (v_tenant, 'email', 'Send pricing sheet', 'Follow-up pricing', v_contact,
      jsonb_build_object('related_to','contact'),
      now());
END$$;