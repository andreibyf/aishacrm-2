-- Migration 098: Workers Table
-- Separate table for contractors/temp labor (distinct from contacts and employees)
-- Workers are the people you assign to construction projects

-- ============================================
-- 1. WORKERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  
  -- Basic info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Worker type and status
  worker_type TEXT DEFAULT 'Contractor' CHECK (worker_type IN ('Contractor', 'Temp Labor', 'Subcontractor')),
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Blacklisted')),
  
  -- Skills/certifications
  primary_skill TEXT, -- 'Laborer', 'Carpenter', 'Electrician', 'Plumber', etc.
  skills TEXT[], -- Array of skills
  certifications TEXT[], -- Array of certifications (OSHA, forklift, etc.)
  
  -- Pay rate (default/typical)
  default_pay_rate DECIMAL(10, 2),
  default_rate_type TEXT DEFAULT 'hourly' CHECK (default_rate_type IN ('hourly', 'daily', 'weekly', 'fixed')),
  
  -- Availability
  available_from DATE,
  available_until DATE,
  
  -- Emergency contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workers_tenant_id ON workers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_worker_type ON workers(worker_type);
CREATE INDEX IF NOT EXISTS idx_workers_primary_skill ON workers(primary_skill);
CREATE INDEX IF NOT EXISTS idx_workers_email ON workers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_skills ON workers USING GIN(skills);

-- Full text search index for name
CREATE INDEX IF NOT EXISTS idx_workers_name_search ON workers USING GIN(
  to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
);

-- Comments
COMMENT ON TABLE workers IS 'Contractors and temp labor for construction projects (separate from employees and contacts)';
COMMENT ON COLUMN workers.worker_type IS 'Type: Contractor, Temp Labor, or Subcontractor';
COMMENT ON COLUMN workers.primary_skill IS 'Primary trade/skill: Laborer, Carpenter, Electrician, etc.';
COMMENT ON COLUMN workers.skills IS 'Array of all skills this worker has';
COMMENT ON COLUMN workers.certifications IS 'Array of certifications (OSHA 10, OSHA 30, forklift, etc.)';
COMMENT ON COLUMN workers.default_pay_rate IS 'Typical pay rate for this worker';

-- RLS Policies
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY workers_service_policy ON workers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their tenant's workers
CREATE POLICY workers_select_policy ON workers
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));

-- Authenticated users can insert workers for their tenant
CREATE POLICY workers_insert_policy ON workers
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));

-- Authenticated users can update their tenant's workers
CREATE POLICY workers_update_policy ON workers
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));

-- Authenticated users can delete their tenant's workers
CREATE POLICY workers_delete_policy ON workers
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));


-- ============================================
-- 2. UPDATE CONSTRUCTION_ASSIGNMENTS
-- ============================================
-- Change contact_id to worker_id and update FK
ALTER TABLE construction_assignments 
  DROP CONSTRAINT IF EXISTS construction_assignments_contact_id_fkey;

ALTER TABLE construction_assignments 
  RENAME COLUMN contact_id TO worker_id;

ALTER TABLE construction_assignments
  ADD CONSTRAINT construction_assignments_worker_id_fkey 
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE;

-- Update unique constraint
ALTER TABLE construction_assignments 
  DROP CONSTRAINT IF EXISTS construction_assignments_project_id_contact_id_role_key;

ALTER TABLE construction_assignments
  ADD CONSTRAINT construction_assignments_project_id_worker_id_role_key
  UNIQUE (project_id, worker_id, role);

-- Update index
DROP INDEX IF EXISTS idx_construction_assignments_contact_id;
CREATE INDEX IF NOT EXISTS idx_construction_assignments_worker_id ON construction_assignments(worker_id);

-- Update comment
COMMENT ON COLUMN construction_assignments.worker_id IS 'FK to workers table - the assigned contractor/temp laborer';


-- ============================================
-- 3. TRIGGER FOR UPDATED_AT
-- ============================================
DROP TRIGGER IF EXISTS update_workers_updated_at ON workers;
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
