-- ============================================================
-- Add Foreign Key Constraints for V2 API FK Joins
-- ============================================================
-- These constraints enable Supabase PostgREST to perform 
-- automatic joins in V2 routes for denormalized names like
-- assigned_to_name, account_name, contact_name, etc.
--
-- IMPORTANT: This script handles both cases:
-- 1. If assigned_to is TEXT -> converts to UUID first
-- 2. If assigned_to is already UUID -> just adds FK constraint
-- ============================================================

-- Helper function to check column type and convert if needed
DO $$
DECLARE
    col_type text;
BEGIN
    -- ============================================================
    -- LEADS TABLE
    -- ============================================================
    -- Check if assigned_to column exists and its type
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'assigned_to' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        -- Column doesn't exist, create it as UUID
        ALTER TABLE leads ADD COLUMN assigned_to UUID;
        RAISE NOTICE 'Created column: leads.assigned_to as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        -- Column exists but is TEXT, convert to UUID
        -- First, null out any non-UUID values
        UPDATE leads SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
          AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        -- Then convert type
        ALTER TABLE leads ALTER COLUMN assigned_to TYPE UUID USING assigned_to::uuid;
        RAISE NOTICE 'Converted leads.assigned_to from TEXT to UUID';
    ELSE
        RAISE NOTICE 'leads.assigned_to is already UUID type';
    END IF;

    -- Add FK constraint if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'leads_assigned_to_fkey' 
        AND table_name = 'leads'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT leads_assigned_to_fkey 
        FOREIGN KEY (assigned_to) REFERENCES employees(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: leads.assigned_to -> employees.id';
    ELSE
        RAISE NOTICE 'FK already exists: leads_assigned_to_fkey';
    END IF;

    -- ============================================================
    -- CONTACTS TABLE - assigned_to
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'assigned_to' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE contacts ADD COLUMN assigned_to UUID;
        RAISE NOTICE 'Created column: contacts.assigned_to as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE contacts SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
          AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE contacts ALTER COLUMN assigned_to TYPE UUID USING assigned_to::uuid;
        RAISE NOTICE 'Converted contacts.assigned_to from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'contacts_assigned_to_fkey' 
        AND table_name = 'contacts'
    ) THEN
        ALTER TABLE contacts 
        ADD CONSTRAINT contacts_assigned_to_fkey 
        FOREIGN KEY (assigned_to) REFERENCES employees(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: contacts.assigned_to -> employees.id';
    END IF;

    -- ============================================================
    -- CONTACTS TABLE - account_id
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'account_id' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE contacts ADD COLUMN account_id UUID;
        RAISE NOTICE 'Created column: contacts.account_id as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE contacts SET account_id = NULL 
        WHERE account_id IS NOT NULL 
          AND account_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE contacts ALTER COLUMN account_id TYPE UUID USING account_id::uuid;
        RAISE NOTICE 'Converted contacts.account_id from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'contacts_account_id_fkey' 
        AND table_name = 'contacts'
    ) THEN
        ALTER TABLE contacts 
        ADD CONSTRAINT contacts_account_id_fkey 
        FOREIGN KEY (account_id) REFERENCES accounts(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: contacts.account_id -> accounts.id';
    END IF;

    -- ============================================================
    -- OPPORTUNITIES TABLE - assigned_to
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'assigned_to' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE opportunities ADD COLUMN assigned_to UUID;
        RAISE NOTICE 'Created column: opportunities.assigned_to as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE opportunities SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
          AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE opportunities ALTER COLUMN assigned_to TYPE UUID USING assigned_to::uuid;
        RAISE NOTICE 'Converted opportunities.assigned_to from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'opportunities_assigned_to_fkey' 
        AND table_name = 'opportunities'
    ) THEN
        ALTER TABLE opportunities 
        ADD CONSTRAINT opportunities_assigned_to_fkey 
        FOREIGN KEY (assigned_to) REFERENCES employees(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: opportunities.assigned_to -> employees.id';
    END IF;

    -- ============================================================
    -- OPPORTUNITIES TABLE - account_id
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'account_id' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE opportunities ADD COLUMN account_id UUID;
        RAISE NOTICE 'Created column: opportunities.account_id as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE opportunities SET account_id = NULL 
        WHERE account_id IS NOT NULL 
          AND account_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE opportunities ALTER COLUMN account_id TYPE UUID USING account_id::uuid;
        RAISE NOTICE 'Converted opportunities.account_id from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'opportunities_account_id_fkey' 
        AND table_name = 'opportunities'
    ) THEN
        ALTER TABLE opportunities 
        ADD CONSTRAINT opportunities_account_id_fkey 
        FOREIGN KEY (account_id) REFERENCES accounts(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: opportunities.account_id -> accounts.id';
    END IF;

    -- ============================================================
    -- OPPORTUNITIES TABLE - contact_id
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'contact_id' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE opportunities ADD COLUMN contact_id UUID;
        RAISE NOTICE 'Created column: opportunities.contact_id as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE opportunities SET contact_id = NULL 
        WHERE contact_id IS NOT NULL 
          AND contact_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE opportunities ALTER COLUMN contact_id TYPE UUID USING contact_id::uuid;
        RAISE NOTICE 'Converted opportunities.contact_id from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'opportunities_contact_id_fkey' 
        AND table_name = 'opportunities'
    ) THEN
        ALTER TABLE opportunities 
        ADD CONSTRAINT opportunities_contact_id_fkey 
        FOREIGN KEY (contact_id) REFERENCES contacts(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: opportunities.contact_id -> contacts.id';
    END IF;

    -- ============================================================
    -- ACTIVITIES TABLE - assigned_to
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'assigned_to' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE activities ADD COLUMN assigned_to UUID;
        RAISE NOTICE 'Created column: activities.assigned_to as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE activities SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
          AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE activities ALTER COLUMN assigned_to TYPE UUID USING assigned_to::uuid;
        RAISE NOTICE 'Converted activities.assigned_to from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'activities_assigned_to_fkey' 
        AND table_name = 'activities'
    ) THEN
        ALTER TABLE activities 
        ADD CONSTRAINT activities_assigned_to_fkey 
        FOREIGN KEY (assigned_to) REFERENCES employees(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: activities.assigned_to -> employees.id';
    END IF;

    -- ============================================================
    -- ACCOUNTS TABLE - assigned_to
    -- ============================================================
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'assigned_to' AND table_schema = 'public';
    
    IF col_type IS NULL THEN
        ALTER TABLE accounts ADD COLUMN assigned_to UUID;
        RAISE NOTICE 'Created column: accounts.assigned_to as UUID';
    ELSIF col_type IN ('text', 'character varying') THEN
        UPDATE accounts SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
          AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        ALTER TABLE accounts ALTER COLUMN assigned_to TYPE UUID USING assigned_to::uuid;
        RAISE NOTICE 'Converted accounts.assigned_to from TEXT to UUID';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'accounts_assigned_to_fkey' 
        AND table_name = 'accounts'
    ) THEN
        ALTER TABLE accounts 
        ADD CONSTRAINT accounts_assigned_to_fkey 
        FOREIGN KEY (assigned_to) REFERENCES employees(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created FK: accounts.assigned_to -> employees.id';
    END IF;

END $$;

-- ============================================================
-- Create indexes for FK columns (improves JOIN performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON accounts(assigned_to);

-- ============================================================
-- Summary of FK Constraints Created
-- ============================================================
-- leads.assigned_to -> employees.id
-- contacts.assigned_to -> employees.id
-- contacts.account_id -> accounts.id
-- opportunities.assigned_to -> employees.id
-- opportunities.account_id -> accounts.id
-- opportunities.contact_id -> contacts.id
-- activities.assigned_to -> employees.id
-- accounts.assigned_to -> employees.id
-- ============================================================
