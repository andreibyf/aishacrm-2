-- Migration: Create safe function variants with fixed search_path
-- Rationale: Prevent search_path hijacking attacks by setting explicit search_path
-- and schema-qualifying all object references
-- Keep originals; create _safe suffixed versions for testing/migration

-- 1. sync_created_date_safe
-- Syncs created_date field from created_at timestamp
CREATE OR REPLACE FUNCTION public.sync_created_date_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.created_date = NEW.created_at;
  RETURN NEW;
END;
$$;

-- 2. check_email_uniqueness_safe
-- Ensures email uniqueness across users and employees tables
CREATE OR REPLACE FUNCTION public.check_email_uniqueness_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing_in_users INTEGER;
  existing_in_employees INTEGER;
BEGIN
  -- Skip check if email is NULL or empty (allow multiple NULL emails)
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  -- Check if email exists in users table (excluding current record if updating)
  SELECT COUNT(*) INTO existing_in_users
  FROM public.users 
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email IS NOT NULL 
    AND email <> ''
    AND (TG_TABLE_NAME <> 'users' OR id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid));

  -- Check if email exists in employees table (excluding current record if updating)
  SELECT COUNT(*) INTO existing_in_employees
  FROM public.employees 
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email IS NOT NULL 
    AND email <> ''
    AND (TG_TABLE_NAME <> 'employees' OR id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid));

  IF existing_in_users > 0 OR existing_in_employees > 0 THEN
    RAISE EXCEPTION 'Email % already exists in % table', 
      NEW.email,
      CASE WHEN existing_in_users > 0 THEN 'users' ELSE 'employees' END
    USING ERRCODE = '23505', -- Unique violation error code
          HINT = 'Email addresses must be unique across all users and employees';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. ai_campaigns_set_updated_at_safe
-- Trigger function to set updated_at on ai_campaigns table
CREATE OR REPLACE FUNCTION public.ai_campaigns_set_updated_at_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 4. update_employees_updated_at_safe
-- Trigger function to set updated_at on employees table
CREATE OR REPLACE FUNCTION public.update_employees_updated_at_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 5. update_system_settings_updated_at_safe
-- Trigger function to set updated_at on system_settings table
CREATE OR REPLACE FUNCTION public.update_system_settings_updated_at_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 6. sync_leads_created_date_safe
-- Syncs created_date field from created_at for leads table
CREATE OR REPLACE FUNCTION public.sync_leads_created_date_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Only set created_date if it's not explicitly provided
  IF NEW.created_date IS NULL THEN
    NEW.created_date := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. sync_tenant_metadata_to_columns_safe
-- Syncs tenant metadata JSON fields to dedicated columns
CREATE OR REPLACE FUNCTION public.sync_tenant_metadata_to_columns_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- If metadata changes, update columns
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.metadata IS NOT NULL THEN
    NEW.domain := COALESCE(NEW.domain, NEW.metadata->>'domain');
    NEW.country := COALESCE(NEW.country, NEW.metadata->>'country');
    NEW.industry := COALESCE(NEW.industry, NEW.metadata->>'industry');
    NEW.major_city := COALESCE(NEW.major_city, NEW.metadata->>'major_city');
    NEW.display_order := COALESCE(NEW.display_order, (NEW.metadata->>'display_order')::INTEGER, 0);
    NEW.business_model := COALESCE(NEW.business_model, NEW.metadata->>'business_model');
    NEW.geographic_focus := COALESCE(NEW.geographic_focus, NEW.metadata->>'geographic_focus');
    NEW.elevenlabs_agent_id := COALESCE(NEW.elevenlabs_agent_id, NEW.metadata->>'elevenlabs_agent_id');
  END IF;
  RETURN NEW;
END;
$$;

-- Note: These _safe variants are ready for testing
-- After validation, triggers can be updated to use _safe versions
-- Original functions remain unchanged for rollback capability
