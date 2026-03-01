-- Clear test data from core CRM tables in FK-safe order
-- WARNING: This deletes ALL rows from these tables.
-- Intended for test/dev environments only.

BEGIN;

-- Child tables first
DELETE FROM activities;        -- may reference others via related_id (no FK)
DELETE FROM opportunities;     -- references accounts, contacts (FKs)
DELETE FROM leads;             -- independent
DELETE FROM contacts;          -- references accounts
DELETE FROM accounts;          -- parent

COMMIT;
