-- Migration 099: Rename Construction Tables to Generic Project Tables
-- Renames construction_projects → projects, construction_assignments → project_assignments

-- ============================================
-- 1. RENAME TABLES
-- ============================================
ALTER TABLE IF EXISTS construction_projects RENAME TO projects;
ALTER TABLE IF EXISTS construction_assignments RENAME TO project_assignments;

-- ============================================
-- 2. UPDATE FOREIGN KEY CONSTRAINT ON project_milestones
-- ============================================
-- Drop and recreate the FK to point to renamed table
ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_project_id_fkey;
ALTER TABLE project_milestones 
  ADD CONSTRAINT project_milestones_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Update comment
COMMENT ON COLUMN project_milestones.project_id IS 'FK to projects table';

-- ============================================
-- 3. UPDATE FOREIGN KEY ON project_assignments
-- ============================================
ALTER TABLE project_assignments DROP CONSTRAINT IF EXISTS construction_assignments_project_id_fkey;
ALTER TABLE project_assignments 
  ADD CONSTRAINT project_assignments_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- ============================================
-- 4. RENAME INDEXES (optional but cleaner)
-- ============================================
-- Projects indexes
ALTER INDEX IF EXISTS idx_construction_projects_tenant_id RENAME TO idx_projects_tenant_id;
ALTER INDEX IF EXISTS idx_construction_projects_account_id RENAME TO idx_projects_account_id;
ALTER INDEX IF EXISTS idx_construction_projects_lead_id RENAME TO idx_projects_lead_id;
ALTER INDEX IF EXISTS idx_construction_projects_status RENAME TO idx_projects_status;
ALTER INDEX IF EXISTS idx_construction_projects_start_date RENAME TO idx_projects_start_date;

-- Assignments indexes
ALTER INDEX IF EXISTS idx_construction_assignments_tenant_id RENAME TO idx_project_assignments_tenant_id;
ALTER INDEX IF EXISTS idx_construction_assignments_project_id RENAME TO idx_project_assignments_project_id;
ALTER INDEX IF EXISTS idx_construction_assignments_worker_id RENAME TO idx_project_assignments_worker_id;
ALTER INDEX IF EXISTS idx_construction_assignments_status RENAME TO idx_project_assignments_status;

-- ============================================
-- 5. RENAME RLS POLICIES
-- ============================================
-- Projects policies
ALTER POLICY IF EXISTS construction_projects_service_policy ON projects RENAME TO projects_service_policy;
ALTER POLICY IF EXISTS construction_projects_select_policy ON projects RENAME TO projects_select_policy;
ALTER POLICY IF EXISTS construction_projects_insert_policy ON projects RENAME TO projects_insert_policy;
ALTER POLICY IF EXISTS construction_projects_update_policy ON projects RENAME TO projects_update_policy;
ALTER POLICY IF EXISTS construction_projects_delete_policy ON projects RENAME TO projects_delete_policy;

-- Assignments policies
ALTER POLICY IF EXISTS construction_assignments_service_policy ON project_assignments RENAME TO project_assignments_service_policy;
ALTER POLICY IF EXISTS construction_assignments_select_policy ON project_assignments RENAME TO project_assignments_select_policy;
ALTER POLICY IF EXISTS construction_assignments_insert_policy ON project_assignments RENAME TO project_assignments_insert_policy;
ALTER POLICY IF EXISTS construction_assignments_update_policy ON project_assignments RENAME TO project_assignments_update_policy;
ALTER POLICY IF EXISTS construction_assignments_delete_policy ON project_assignments RENAME TO project_assignments_delete_policy;

-- ============================================
-- 6. RENAME TRIGGERS AND FUNCTIONS
-- ============================================
-- Projects trigger
DROP TRIGGER IF EXISTS trigger_construction_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;

-- Create or replace the updated_at function for projects
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

-- Assignments trigger
DROP TRIGGER IF EXISTS trigger_construction_assignments_updated_at ON project_assignments;
DROP TRIGGER IF EXISTS trigger_project_assignments_updated_at ON project_assignments;

-- Create or replace the updated_at function for assignments
CREATE OR REPLACE FUNCTION update_project_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_project_assignments_updated_at
  BEFORE UPDATE ON project_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_project_assignments_updated_at();

-- Clean up old function names if they exist
DROP FUNCTION IF EXISTS update_construction_projects_updated_at();
DROP FUNCTION IF EXISTS update_construction_assignments_updated_at();

-- ============================================
-- 7. UPDATE TABLE COMMENTS
-- ============================================
COMMENT ON TABLE projects IS 'Projects for project management module - tracks client projects, timelines, and budgets';
COMMENT ON TABLE project_assignments IS 'Worker assignments to projects - tracks who is working on which project';
