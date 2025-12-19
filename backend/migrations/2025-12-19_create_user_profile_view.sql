-- Migration: Create user_profile_view
-- Unified view joining users (login accounts) with their employee records (if any)
-- This separates the concern of "who can login" (users) from "who is in the org chart" (employees)

CREATE OR REPLACE VIEW public.user_profile_view AS
SELECT 
  u.id AS user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.role AS auth_role,
  u.tenant_id,
  u.metadata AS user_metadata,
  u.status,
  u.created_at,
  u.updated_at,
  -- Employee linkage (if exists - matched by email and tenant)
  e.id AS employee_id,
  e.role AS employee_role,
  e.status AS employee_status,
  e.metadata AS employee_metadata,
  COALESCE((e.metadata->>'has_crm_access')::boolean, false) AS has_crm_access,
  (e.metadata->>'manager_employee_id')::uuid AS manager_employee_id,
  e.metadata->>'crm_user_employee_role' AS crm_user_employee_role
FROM public.users u
LEFT JOIN public.employees e 
  ON LOWER(u.email) = LOWER(e.email) 
  AND u.tenant_id = e.tenant_id;

-- Grant access to all roles
GRANT SELECT ON public.user_profile_view TO authenticated, service_role, anon;

-- Documentation
COMMENT ON VIEW public.user_profile_view IS 'Unified view joining users (login accounts) with their employee records (if any). Use this for User Management UI.';
