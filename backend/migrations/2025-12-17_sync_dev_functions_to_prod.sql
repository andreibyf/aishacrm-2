-- ============================================================
-- DEV → PROD Functions Migration
-- Generated: 2025-12-17
-- Purpose: Sync DEV functions to PROD for v3.0.0 workflow
-- ============================================================

-- 1. employee_full_name - computed full name from employees record
CREATE OR REPLACE FUNCTION "public"."employee_full_name"("emp" "public"."employees") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT trim(both ' ' FROM COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, ''));
$$;

-- 2. set_updated_at - auto-update timestamp trigger function
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 3. uuid_advisory_key - generate advisory lock key from UUID
CREATE OR REPLACE FUNCTION "public"."uuid_advisory_key"(uuid) RETURNS bigint
    LANGUAGE sql IMMUTABLE
    AS $_$
  SELECT ('x' || substring(replace($1::text, '-', ''), 1, 16))::bit(64)::bigint
$_$;

