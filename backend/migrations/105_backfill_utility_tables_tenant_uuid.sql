-- Migration: Backfill UUID tenant_id from legacy TEXT column in utility tables
-- Context: Tables have both tenant_id (UUID) and legacy TEXT column
--          Legacy column is either tenant_id_text OR tenant_id_legacy depending on table
--          The tenant_id UUID column may be NULL for existing data
-- 
-- Per migration 099: system_logs uses tenant_id_legacy
-- Per dev indexes: notifications and modulesettings use tenant_id_text
-- BUT production schema may differ - this handles BOTH column names

-- Step 1: Backfill notifications.tenant_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'tenant_id_text'
  ) THEN
    UPDATE public.notifications n
    SET tenant_id = t.id
    FROM public.tenant t
    WHERE n.tenant_id IS NULL
      AND n.tenant_id_text IS NOT NULL
      AND n.tenant_id_text = t.tenant_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' AND column_name = 'tenant_id_legacy'
  ) THEN
    UPDATE public.notifications n
    SET tenant_id = t.id
    FROM public.tenant t
    WHERE n.tenant_id IS NULL
      AND n.tenant_id_legacy IS NOT NULL
      AND n.tenant_id_legacy = t.tenant_id;
  END IF;
END $$;

-- Step 2: Backfill system_logs.tenant_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_logs' AND column_name = 'tenant_id_legacy'
  ) THEN
    UPDATE public.system_logs sl
    SET tenant_id = t.id
    FROM public.tenant t
    WHERE sl.tenant_id IS NULL
      AND sl.tenant_id_legacy IS NOT NULL
      AND sl.tenant_id_legacy = t.tenant_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_logs' AND column_name = 'tenant_id_text'
  ) THEN
    UPDATE public.system_logs sl
    SET tenant_id = t.id
    FROM public.tenant t
    WHERE sl.tenant_id IS NULL
      AND sl.tenant_id_text IS NOT NULL
      AND sl.tenant_id_text = t.tenant_id;
  END IF;
END $$;

-- Step 3: Backfill modulesettings.tenant_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'modulesettings' AND column_name = 'tenant_id_text'
  ) THEN
    UPDATE public.modulesettings ms
    SET tenant_id = t.id
    FROM public.tenant t
    WHERE ms.tenant_id IS NULL
      AND ms.tenant_id_text IS NOT NULL
      AND ms.tenant_id_text = t.tenant_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'modulesettings' AND column_name = 'tenant_id_legacy'
  ) THEN
    UPDATE public.modulesettings ms
    SET tenant_id = t.id
    FROM public.tenant t
    WHERE ms.tenant_id IS NULL
      AND ms.tenant_id_legacy IS NOT NULL
      AND ms.tenant_id_legacy = t.tenant_id;
  END IF;
END $$;

-- Step 4: Report backfill results
DO $$
DECLARE
  notif_null_count INTEGER;
  logs_null_count INTEGER;
  module_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO notif_null_count FROM public.notifications WHERE tenant_id IS NULL;
  SELECT COUNT(*) INTO logs_null_count FROM public.system_logs WHERE tenant_id IS NULL;
  SELECT COUNT(*) INTO module_null_count FROM public.modulesettings WHERE tenant_id IS NULL;
  
  RAISE NOTICE 'Backfill complete:';
  RAISE NOTICE '  - notifications with NULL tenant_id: %', notif_null_count;
  RAISE NOTICE '  - system_logs with NULL tenant_id: %', logs_null_count;
  RAISE NOTICE '  - modulesettings with NULL tenant_id: %', module_null_count;
  
  IF notif_null_count > 0 OR logs_null_count > 0 OR module_null_count > 0 THEN
    RAISE WARNING 'Some rows still have NULL tenant_id - these may be orphaned records';
  END IF;
END $$;
