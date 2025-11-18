-- Flatten contacts table: move commonly used fields from metadata to direct columns

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_contacts_title ON contacts(title) WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_department ON contacts(department) WHERE department IS NOT NULL;
