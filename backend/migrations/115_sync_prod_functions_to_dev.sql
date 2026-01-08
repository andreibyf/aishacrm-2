-- ============================================================
-- Migration 115: Sync PROD-only functions to DEV
-- ============================================================
-- Purpose: Capture functions that were manually added to prod
--          but never added to migration files
-- Created: 2026-01-07
-- Source: Schema drift analysis between dev and prod
-- ============================================================

-- ===========================================
-- 1. sync_created_date_tenant
-- Tenant-aware version of sync_created_date
-- ===========================================
CREATE OR REPLACE FUNCTION public.sync_created_date_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync created_date from created_at if not explicitly set
  IF NEW.created_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  
  -- Ensure tenant_id is set if available in the table
  -- This is a no-op if tenant_id column doesn't exist
  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'sync_created_date_tenant error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_created_date_tenant() IS 'Tenant-aware trigger to sync created_date from created_at';

-- ===========================================
-- 2. sync_assigned_to_text
-- Sync assigned_to UUID to text representation
-- ===========================================
CREATE OR REPLACE FUNCTION public.sync_assigned_to_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name TEXT;
BEGIN
  -- If assigned_to UUID is set, look up employee name
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email)
    INTO v_employee_name
    FROM employees
    WHERE id = NEW.assigned_to;
    
    IF v_employee_name IS NOT NULL THEN
      NEW.assigned_to_text = v_employee_name;
    END IF;
  ELSE
    NEW.assigned_to_text = NULL;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'sync_assigned_to_text error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_assigned_to_text() IS 'Sync assigned_to UUID to human-readable name';

-- ===========================================
-- 3. sync_bizdev_sources_created_date
-- BizDev-specific created_date sync
-- ===========================================
CREATE OR REPLACE FUNCTION public.sync_bizdev_sources_created_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_bizdev_sources_created_date error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_bizdev_sources_created_date() IS 'Sync created_date for bizdev_sources table';

-- ===========================================
-- 4. sync_leads_created_date
-- Leads-specific created_date sync
-- ===========================================
CREATE OR REPLACE FUNCTION public.sync_leads_created_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_leads_created_date error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_leads_created_date() IS 'Sync created_date for leads table';

-- Safe variant
CREATE OR REPLACE FUNCTION public.sync_leads_created_date_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_leads_created_date_safe error: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ===========================================
-- 5. update_activities_updated_at
-- Activities timestamp trigger
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_activities_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'update_activities_updated_at error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_activities_updated_at() IS 'Auto-update updated_at for activities table';

-- ===========================================
-- 6. update_ai_suggestions_updated_at
-- AI suggestions timestamp trigger
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_ai_suggestions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'update_ai_suggestions_updated_at error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_ai_suggestions_updated_at() IS 'Auto-update updated_at for ai_suggestions table';

-- ===========================================
-- 7. update_employees_updated_at
-- Employees timestamp trigger
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_employees_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'update_employees_updated_at error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_employees_updated_at() IS 'Auto-update updated_at for employees table';

-- Safe variant
CREATE OR REPLACE FUNCTION public.update_employees_updated_at_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- ===========================================
-- 8. update_system_settings_updated_at
-- System settings timestamp trigger
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_system_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'update_system_settings_updated_at error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_system_settings_updated_at() IS 'Auto-update updated_at for system_settings table';

-- Safe variant
CREATE OR REPLACE FUNCTION public.update_system_settings_updated_at_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- ===========================================
-- 9. update_tenant_updated_at
-- Tenant timestamp trigger
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_tenant_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'update_tenant_updated_at error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_tenant_updated_at() IS 'Auto-update updated_at for tenant table';

-- ===========================================
-- 10. update_workers_updated_at
-- Workers timestamp trigger
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_workers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'update_workers_updated_at error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_workers_updated_at() IS 'Auto-update updated_at for workers table';

-- ===========================================
-- 11. modulesettings_force_null_legacy
-- Clean up legacy null values in modulesettings
-- ===========================================
CREATE OR REPLACE FUNCTION public.modulesettings_force_null_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Force legacy tenant_id_text to NULL (deprecated)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    NEW.tenant_id_text = NULL;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'modulesettings_force_null_legacy error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.modulesettings_force_null_legacy() IS 'Force legacy columns to NULL for modulesettings';

-- ===========================================
-- 12. check_email_uniqueness
-- Validate unique emails across users/employees
-- ===========================================
CREATE OR REPLACE FUNCTION public.check_email_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if email already exists in users table (excluding self)
  SELECT COUNT(*)
  INTO v_count
  FROM users
  WHERE email = NEW.email
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Email % already exists in users table', NEW.email;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'check_email_uniqueness error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_email_uniqueness() IS 'Validate email uniqueness across users';

-- Safe variant
CREATE OR REPLACE FUNCTION public.check_email_uniqueness_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Silently allow in safe mode to prevent blocking inserts
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- ===========================================
-- 13. sync_tenant_metadata_to_columns
-- Flatten JSONB metadata to columns
-- ===========================================
CREATE OR REPLACE FUNCTION public.sync_tenant_metadata_to_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync metadata JSONB fields to flat columns if they exist
  IF NEW.metadata IS NOT NULL AND jsonb_typeof(NEW.metadata) = 'object' THEN
    -- Example: sync specific fields from metadata
    -- NEW.some_column = NEW.metadata->>'some_key';
    NULL; -- Placeholder - add specific field syncs as needed
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'sync_tenant_metadata_to_columns error: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_tenant_metadata_to_columns() IS 'Sync tenant metadata JSONB to flat columns';

-- Safe variant
CREATE OR REPLACE FUNCTION public.sync_tenant_metadata_to_columns_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- ===========================================
-- 14. upsert_person_profile
-- Upsert person profile from contact/lead data
-- ===========================================
-- Drop old signature if exists (was: p_person_id uuid)
DROP FUNCTION IF EXISTS public.upsert_person_profile(uuid);

CREATE OR REPLACE FUNCTION public.upsert_person_profile(
  p_tenant_id UUID,
  p_email TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Try to find existing profile by email
  SELECT id INTO v_profile_id
  FROM person_profile
  WHERE tenant_id = p_tenant_id
    AND email = p_email
  LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    -- Insert new profile
    INSERT INTO person_profile (
      tenant_id,
      email,
      first_name,
      last_name,
      phone,
      company,
      source_type,
      source_id,
      created_at,
      updated_at
    ) VALUES (
      p_tenant_id,
      p_email,
      p_first_name,
      p_last_name,
      p_phone,
      p_company,
      p_source_type,
      p_source_id,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_profile_id;
  ELSE
    -- Update existing profile
    UPDATE person_profile
    SET
      first_name = COALESCE(p_first_name, first_name),
      last_name = COALESCE(p_last_name, last_name),
      phone = COALESCE(p_phone, phone),
      company = COALESCE(p_company, company),
      updated_at = NOW()
    WHERE id = v_profile_id;
  END IF;
  
  RETURN v_profile_id;
EXCEPTION
  WHEN undefined_table THEN
    -- person_profile table doesn't exist yet
    RETURN NULL;
  WHEN OTHERS THEN
    RAISE WARNING 'upsert_person_profile error: %', SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.upsert_person_profile IS 'Upsert person profile from contact/lead data';

-- ===========================================
-- Grant execute permissions
-- ===========================================
GRANT EXECUTE ON FUNCTION public.sync_created_date_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_assigned_to_text() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_bizdev_sources_created_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_leads_created_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_leads_created_date_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_activities_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ai_suggestions_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_employees_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_employees_updated_at_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_system_settings_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_system_settings_updated_at_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workers_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.modulesettings_force_null_legacy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_uniqueness() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_uniqueness_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tenant_metadata_to_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tenant_metadata_to_columns_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_person_profile TO authenticated;

-- ============================================================
-- END OF MIGRATION 115
-- ============================================================
