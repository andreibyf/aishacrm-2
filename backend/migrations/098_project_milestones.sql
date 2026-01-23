-- Migration 098: Project Milestones Table
-- Adds milestones tracking for project management

-- ============================================
-- 1. PROJECT MILESTONES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  
  -- Milestone info
  title TEXT NOT NULL,
  description TEXT,
  
  -- Scheduling
  due_date DATE,
  completed_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_milestones_tenant_id ON project_milestones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_status ON project_milestones(status);
CREATE INDEX IF NOT EXISTS idx_project_milestones_due_date ON project_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_project_milestones_sort_order ON project_milestones(project_id, sort_order);

-- Comments
COMMENT ON TABLE project_milestones IS 'Milestones for project management - tracks key deliverables and deadlines';
COMMENT ON COLUMN project_milestones.project_id IS 'FK to construction_projects (general projects table)';
COMMENT ON COLUMN project_milestones.sort_order IS 'Display order within a project';
COMMENT ON COLUMN project_milestones.completed_at IS 'Timestamp when milestone was marked complete';

-- RLS Policies
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend operations)
CREATE POLICY project_milestones_service_policy ON project_milestones
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their tenant's milestones
CREATE POLICY project_milestones_select_policy ON project_milestones
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can insert for their tenant
CREATE POLICY project_milestones_insert_policy ON project_milestones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Authenticated users can update their tenant's milestones
CREATE POLICY project_milestones_update_policy ON project_milestones
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

-- Authenticated users can delete their tenant's milestones
CREATE POLICY project_milestones_delete_policy ON project_milestones
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_project_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_milestones_updated_at ON project_milestones;
CREATE TRIGGER trigger_project_milestones_updated_at
  BEFORE UPDATE ON project_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_project_milestones_updated_at();
