-- Enforce account name uniqueness within tenant
DO $$ BEGIN
    -- Remove duplicates first (keep the oldest record)
    DELETE FROM accounts a1 USING accounts a2
    WHERE a1.tenant_id = a2.tenant_id 
    AND a1.name = a2.name 
    AND a1.created_at > a2.created_at;
    
    -- Add unique constraint per tenant
    ALTER TABLE accounts ADD CONSTRAINT accounts_tenant_name_unique UNIQUE (tenant_id, name);
END $$;