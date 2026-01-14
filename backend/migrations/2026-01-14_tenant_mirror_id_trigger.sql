-- Migration: Create BEFORE INSERT trigger to mirror tenant.id into tenant.tenant_id
-- Date: 2026-01-14
-- Purpose: Ensure tenant_id always matches id (both UUIDs) without application code intervention

-- Function to mirror id into tenant_id on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.mirror_tenant_id_from_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Make tenant_id mirror id
  NEW.tenant_id := NEW.id::uuid;
  RETURN NEW;
END;
$$;

-- Drop existing triggers if present (idempotent)
DROP TRIGGER IF EXISTS tenant_mirror_id_before_insert ON public.tenant;
DROP TRIGGER IF EXISTS tenant_mirror_id_before_update ON public.tenant;

-- Create BEFORE INSERT trigger on public.tenant
CREATE TRIGGER tenant_mirror_id_before_insert
BEFORE INSERT ON public.tenant
FOR EACH ROW
EXECUTE FUNCTION public.mirror_tenant_id_from_id();

-- Create BEFORE UPDATE trigger to keep tenant_id in sync if id changes
CREATE TRIGGER tenant_mirror_id_before_update
BEFORE UPDATE ON public.tenant
FOR EACH ROW
WHEN (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS NULL OR NEW.tenant_id IS DISTINCT FROM NEW.id::uuid)
EXECUTE FUNCTION public.mirror_tenant_id_from_id();
