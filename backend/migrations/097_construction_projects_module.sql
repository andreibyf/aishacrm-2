-- Migration 097: Construction Projects Module
-- Adds construction_projects and construction_assignments tables
-- for staffing companies supplying workers to construction clients

-- ============================================
-- 1. CONSTRUCTION PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS construction_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  
  -- Basic project info
  project_name TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, -- Client construction company
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,       -- Original lead (optional)
  
  -- Site info (kept simple as requested)
  site_name TEXT,
  site_address TEXT,
  
  -- Key contacts (FK to contacts table)
  project_manager_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  supervisor_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Dates
  start_date DATE,
  end_date DATE,
  
  -- Financials
  project_value DECIMAL(15, 2),  -- Contract value or expected revenue
  
  -- Status
  status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'Active', 'Completed', 'Cancelled', 'On Hold')),
  
  -- Description/notes
  description TEXT,
  notes TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_construction_projects_tenant_id ON construction_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_construction_projects_account_id ON construction_projects(account_id);
CREATE INDEX IF NOT EXISTS idx_construction_projects_status ON construction_projects(status);
CREATE INDEX IF NOT EXISTS idx_construction_projects_start_date ON construction_projects(start_date);
CREATE INDEX IF NOT EXISTS idx_construction_projects_end_date ON construction_projects(end_date);

-- Comments
COMMENT ON TABLE construction_projects IS 'Construction projects for staffing companies - tracks client projects and site details';
COMMENT ON COLUMN construction_projects.account_id IS 'FK to accounts - the client construction company';
COMMENT ON COLUMN construction_projects.project_manager_contact_id IS 'FK to contacts - primary project manager';
COMMENT ON COLUMN construction_projects.supervisor_contact_id IS 'FK to contacts - on-site supervisor';
COMMENT ON COLUMN construction_projects.project_value IS 'Contract value or expected revenue from this project';

-- RLS Policies
ALTER TABLE construction_projects ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend operations)
CREATE POLICY construction_projects_service_policy ON construction_projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their tenant's projects
CREATE POLICY construction_projects_select_policy ON construction_projects
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can insert for their tenant
CREATE POLICY construction_projects_insert_policy ON construction_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can update their tenant's projects
CREATE POLICY construction_projects_update_policy ON construction_projects
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can delete their tenant's projects
CREATE POLICY construction_projects_delete_policy ON construction_projects
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );


-- ============================================
-- 2. CONSTRUCTION ASSIGNMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS construction_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  
  -- Core assignment info
  project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,  -- The worker
  
  -- Role and dates
  role TEXT NOT NULL,  -- 'Laborer', 'Carpenter', 'Electrician', 'Supervisor', etc.
  start_date DATE,
  end_date DATE,       -- NULL if ongoing
  
  -- Rates (optional but practical for staffing)
  pay_rate DECIMAL(10, 2),   -- What you pay the worker (hourly/daily)
  bill_rate DECIMAL(10, 2),  -- What you bill the client (hourly/daily)
  rate_type TEXT DEFAULT 'hourly' CHECK (rate_type IN ('hourly', 'daily', 'weekly', 'fixed')),
  
  -- Status
  status TEXT DEFAULT 'Active' CHECK (status IN ('Pending', 'Active', 'Completed', 'Cancelled')),
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate assignments of same worker to same project in same role
  UNIQUE(project_id, contact_id, role)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_construction_assignments_tenant_id ON construction_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_construction_assignments_project_id ON construction_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_construction_assignments_contact_id ON construction_assignments(contact_id);
CREATE INDEX IF NOT EXISTS idx_construction_assignments_status ON construction_assignments(status);
CREATE INDEX IF NOT EXISTS idx_construction_assignments_role ON construction_assignments(role);

-- Comments
COMMENT ON TABLE construction_assignments IS 'Worker assignments to construction projects - core staffing piece';
COMMENT ON COLUMN construction_assignments.contact_id IS 'FK to contacts - the assigned worker';
COMMENT ON COLUMN construction_assignments.role IS 'Worker role on this project: Laborer, Carpenter, Electrician, etc.';
COMMENT ON COLUMN construction_assignments.pay_rate IS 'What you pay the worker (rate per rate_type unit)';
COMMENT ON COLUMN construction_assignments.bill_rate IS 'What you bill the client (rate per rate_type unit)';

-- RLS Policies
ALTER TABLE construction_assignments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY construction_assignments_service_policy ON construction_assignments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their tenant's assignments
CREATE POLICY construction_assignments_select_policy ON construction_assignments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can insert for their tenant
CREATE POLICY construction_assignments_insert_policy ON construction_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can update their tenant's assignments
CREATE POLICY construction_assignments_update_policy ON construction_assignments
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can delete their tenant's assignments
CREATE POLICY construction_assignments_delete_policy ON construction_assignments
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );


-- ============================================
-- 3. OPTIONAL: Add worker_role to contacts
-- ============================================
-- This helps filter contacts that are "field workers" vs "office staff"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'worker_role'
  ) THEN
    ALTER TABLE contacts ADD COLUMN worker_role TEXT;
    COMMENT ON COLUMN contacts.worker_role IS 'Optional role tag: Worker, ProjectManager, Supervisor, ClientContact';
  END IF;
END $$;

-- Index for filtering by worker role
CREATE INDEX IF NOT EXISTS idx_contacts_worker_role ON contacts(worker_role) WHERE worker_role IS NOT NULL;


-- ============================================
-- 4. Trigger for updated_at
-- ============================================
-- Reuse existing trigger function if available, otherwise create
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to construction_projects
DROP TRIGGER IF EXISTS update_construction_projects_updated_at ON construction_projects;
CREATE TRIGGER update_construction_projects_updated_at
  BEFORE UPDATE ON construction_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to construction_assignments
DROP TRIGGER IF EXISTS update_construction_assignments_updated_at ON construction_assignments;
CREATE TRIGGER update_construction_assignments_updated_at
  BEFORE UPDATE ON construction_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
