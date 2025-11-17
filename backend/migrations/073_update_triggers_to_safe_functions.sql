-- Migration: Update triggers to use safe function variants
-- Rationale: Replace original functions with _safe versions that have fixed search_path
-- This prevents search_path hijacking attacks on trigger functions

-- Drop and recreate triggers to use _safe function variants

-- 1. Update sync_created_date triggers (10 triggers)
DROP TRIGGER IF EXISTS sync_accounts_created_date ON public.accounts;
CREATE TRIGGER sync_accounts_created_date 
  BEFORE INSERT OR UPDATE ON public.accounts 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_activities_created_date ON public.activities;
CREATE TRIGGER sync_activities_created_date 
  BEFORE INSERT OR UPDATE ON public.activities 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_contacts_created_date ON public.contacts;
CREATE TRIGGER sync_contacts_created_date 
  BEFORE INSERT OR UPDATE ON public.contacts 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_employees_created_date ON public.employees;
CREATE TRIGGER sync_employees_created_date 
  BEFORE INSERT OR UPDATE ON public.employees 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_leads_created_date ON public.leads;
CREATE TRIGGER sync_leads_created_date 
  BEFORE INSERT OR UPDATE ON public.leads 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_notifications_created_date ON public.notifications;
CREATE TRIGGER sync_notifications_created_date 
  BEFORE INSERT OR UPDATE ON public.notifications 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_opportunities_created_date ON public.opportunities;
CREATE TRIGGER sync_opportunities_created_date 
  BEFORE INSERT OR UPDATE ON public.opportunities 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_system_logs_created_date ON public.system_logs;
CREATE TRIGGER sync_system_logs_created_date 
  BEFORE INSERT OR UPDATE ON public.system_logs 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

DROP TRIGGER IF EXISTS sync_tenant_integrations_created_date ON public.tenant_integrations;
CREATE TRIGGER sync_tenant_integrations_created_date 
  BEFORE INSERT OR UPDATE ON public.tenant_integrations 
  FOR EACH ROW EXECUTE FUNCTION public.sync_created_date_safe();

-- 2. Update check_email_uniqueness triggers (2 triggers)
DROP TRIGGER IF EXISTS employees_email_uniqueness_check ON public.employees;
CREATE TRIGGER employees_email_uniqueness_check 
  BEFORE INSERT OR UPDATE OF email ON public.employees 
  FOR EACH ROW EXECUTE FUNCTION public.check_email_uniqueness_safe();

DROP TRIGGER IF EXISTS users_email_uniqueness_check ON public.users;
CREATE TRIGGER users_email_uniqueness_check 
  BEFORE INSERT OR UPDATE OF email ON public.users 
  FOR EACH ROW EXECUTE FUNCTION public.check_email_uniqueness_safe();

-- 3. Update ai_campaigns_set_updated_at trigger
DROP TRIGGER IF EXISTS trg_ai_campaigns_updated_at ON public.ai_campaigns;
CREATE TRIGGER trg_ai_campaigns_updated_at 
  BEFORE UPDATE ON public.ai_campaigns 
  FOR EACH ROW EXECUTE FUNCTION public.ai_campaigns_set_updated_at_safe();

-- 4. Update update_employees_updated_at trigger
DROP TRIGGER IF EXISTS employees_updated_at_trigger ON public.employees;
CREATE TRIGGER employees_updated_at_trigger 
  BEFORE UPDATE ON public.employees 
  FOR EACH ROW EXECUTE FUNCTION public.update_employees_updated_at_safe();

-- 5. Update update_system_settings_updated_at trigger
DROP TRIGGER IF EXISTS trigger_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trigger_system_settings_updated_at 
  BEFORE UPDATE ON public.system_settings 
  FOR EACH ROW EXECUTE FUNCTION public.update_system_settings_updated_at_safe();

-- 6. Update sync_leads_created_date trigger (distinct from sync_created_date)
DROP TRIGGER IF EXISTS trigger_sync_leads_created_date ON public.leads;
CREATE TRIGGER trigger_sync_leads_created_date 
  BEFORE INSERT ON public.leads 
  FOR EACH ROW EXECUTE FUNCTION public.sync_leads_created_date_safe();

-- 7. Update sync_tenant_metadata_to_columns trigger
DROP TRIGGER IF EXISTS trigger_sync_tenant_metadata_to_columns ON public.tenant;
CREATE TRIGGER trigger_sync_tenant_metadata_to_columns 
  BEFORE INSERT OR UPDATE ON public.tenant 
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_metadata_to_columns_safe();

-- All triggers now use _safe function variants with fixed search_path
-- Original functions remain for rollback capability
