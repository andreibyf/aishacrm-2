-- 079_employee_email_uniqueness.sql
-- Enforce tenant-scoped, case-insensitive uniqueness for employee emails and
-- align the cross-table trigger with the same rule set.

-- Step 1: Null out duplicate emails that violate the new uniqueness rule so the
-- index can be created without failure. Keep the earliest row per tenant/email.
DO $$
DECLARE
  duplicates_cleared INTEGER := 0;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(email)
        ORDER BY created_at NULLS LAST, id
      ) AS rn
    FROM public.employees
    WHERE email IS NOT NULL
      AND email <> ''
  ), updated AS (
    UPDATE public.employees e
    SET email = NULL,
        updated_at = NOW()
    FROM ranked r
    WHERE e.id = r.id
      AND r.rn > 1
    RETURNING 1
  )
  SELECT COUNT(*) INTO duplicates_cleared FROM updated;

  IF duplicates_cleared > 0 THEN
    RAISE NOTICE 'Nullified % duplicate employee emails before adding unique index.', duplicates_cleared;
  END IF;
END $$;

-- Step 2: Create a partial unique index to enforce tenant + lower(email) uniqueness
-- while still allowing multiple NULL emails.
DROP INDEX IF EXISTS public.idx_employees_tenant_email_lower;
CREATE UNIQUE INDEX idx_employees_tenant_email_lower
  ON public.employees (tenant_id, LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

-- Step 3: Update the check_email_uniqueness_safe trigger to enforce the same
-- tenant-scoped uniqueness rule across both users and employees tables.
CREATE OR REPLACE FUNCTION public.check_email_uniqueness_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing_in_users INTEGER;
  existing_in_employees INTEGER;
  tenant_guard UUID := COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
  current_id UUID := COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  -- Skip check if email is NULL or empty (allow multiple NULL emails)
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO existing_in_users
  FROM public.users
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email IS NOT NULL
    AND email <> ''
    AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = tenant_guard
    AND NOT (TG_TABLE_NAME = 'users' AND id = current_id);

  SELECT COUNT(*) INTO existing_in_employees
  FROM public.employees
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email IS NOT NULL
    AND email <> ''
    AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = tenant_guard
    AND NOT (TG_TABLE_NAME = 'employees' AND id = current_id);

  IF existing_in_users > 0 OR existing_in_employees > 0 THEN
    RAISE EXCEPTION 'Email % already exists for this tenant', NEW.email
      USING ERRCODE = '23505',
            HINT = 'Email addresses must be unique per tenant across users and employees';
  END IF;

  RETURN NEW;
END;
$$;
