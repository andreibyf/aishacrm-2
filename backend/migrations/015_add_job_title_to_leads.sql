-- Add job_title column to leads table
-- This field is used by the frontend form and should be stored

ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Create index for searching by job_title
CREATE INDEX IF NOT EXISTS idx_leads_job_title ON leads(tenant_id, job_title);
