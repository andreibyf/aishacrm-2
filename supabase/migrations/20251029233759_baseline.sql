create extension if not exists "pg_net" with schema "extensions";

drop extension if exists "hypopg";

drop extension if exists "index_advisor";

drop trigger if exists "trigger_sync_bizdev_sources_created_date" on "public"."bizdev_sources";

drop trigger if exists "employees_updated_at_trigger" on "public"."employees";

drop trigger if exists "tenant_updated_at_trigger" on "public"."tenant";

drop policy "Backend service has full access to accounts" on "public"."accounts";

drop policy "Service role full access to accounts" on "public"."accounts";

drop policy "tenant_isolation_accounts" on "public"."accounts";

drop policy "Backend service has full access to activities" on "public"."activities";

drop policy "Service role full access to activities" on "public"."activities";

drop policy "tenant_isolation_activities" on "public"."activities";

drop policy "Service role full access to ai_campaign" on "public"."ai_campaign";

drop policy "Service role full access to announcement" on "public"."announcement";

drop policy "Service role full access to api_key" on "public"."api_key";

drop policy "Backend service has full access to apikey" on "public"."apikey";

drop policy "Service role full access to apikey" on "public"."apikey";

drop policy "Service role full access to archive_index" on "public"."archive_index";

drop policy "Service role full access to audit_log" on "public"."audit_log";

drop policy "Service role full access to bizdev_source" on "public"."bizdev_source";

drop policy "tenant_isolation_bizdev_source" on "public"."bizdev_source";

drop policy "Service role full access to bizdev_sources" on "public"."bizdev_sources";

drop policy "Service role full access to cache" on "public"."cache";

drop policy "Service role full access to cash_flow" on "public"."cash_flow";

drop policy "tenant_isolation_cash_flow" on "public"."cash_flow";

drop policy "Service role full access to checkpoint" on "public"."checkpoint";

drop policy "Service role full access to client_requirement" on "public"."client_requirement";

drop policy "tenant_isolation_client_requirement" on "public"."client_requirement";

drop policy "Service role full access to contact_history" on "public"."contact_history";

drop policy "Backend service has full access to contacts" on "public"."contacts";

drop policy "Service role full access to contacts" on "public"."contacts";

drop policy "tenant_isolation_contacts" on "public"."contacts";

drop policy "messages_tenant_isolation" on "public"."conversation_messages";

drop policy "conversations_tenant_isolation" on "public"."conversations";

drop policy "Service role full access to cron_job" on "public"."cron_job";

drop policy "Service role full access to daily_sales_metrics" on "public"."daily_sales_metrics";

drop policy "Service role full access to documentation" on "public"."documentation";

drop policy "Service role full access to email_template" on "public"."email_template";

drop policy "Backend service has full access to employees" on "public"."employees";

drop policy "Service role full access to employees" on "public"."employees";

drop policy "Service role full access to field_customization" on "public"."field_customization";

drop policy "Service role full access to file" on "public"."file";

drop policy "Service role full access to guide_content" on "public"."guide_content";

drop policy "Service role full access to import_log" on "public"."import_log";

drop policy "Service role full access to lead_history" on "public"."lead_history";

drop policy "Backend service has full access to leads" on "public"."leads";

drop policy "Service role full access to leads" on "public"."leads";

drop policy "tenant_isolation_leads" on "public"."leads";

drop policy "Backend service has full access to modulesettings" on "public"."modulesettings";

drop policy "Service role full access to modulesettings" on "public"."modulesettings";

drop policy "service_role_only_modulesettings" on "public"."modulesettings";

drop policy "Service role full access to note" on "public"."note";

drop policy "tenant_isolation_note" on "public"."note";

drop policy "Backend service has full access to notifications" on "public"."notifications";

drop policy "Service role full access to notifications" on "public"."notifications";

drop policy "tenant_isolation_notifications" on "public"."notifications";

drop policy "Backend service has full access to opportunities" on "public"."opportunities";

drop policy "Service role full access to opportunities" on "public"."opportunities";

drop policy "tenant_isolation_opportunities" on "public"."opportunities";

drop policy "Service role full access to performance_log" on "public"."performance_log";

drop policy "authenticated_insert_only" on "public"."performance_logs";

drop policy "Service role full access to subscription" on "public"."subscription";

drop policy "Service role full access to subscription_plan" on "public"."subscription_plan";

drop policy "Backend service has full access to system_logs" on "public"."system_logs";

drop policy "Service role full access to system_logs" on "public"."system_logs";

drop policy "Service role full access to tenant" on "public"."tenant";

drop policy "service_role_only_tenants" on "public"."tenant";

drop policy "Service role full access to tenant_integration" on "public"."tenant_integration";

drop policy "Service role full access to tenant_integrations" on "public"."tenant_integrations";

drop policy "Service role full access to test_report" on "public"."test_report";

drop policy "Service role full access to user_invitation" on "public"."user_invitation";

drop policy "Backend service has full access to users" on "public"."users";

drop policy "Service role full access to users" on "public"."users";

drop policy "Service role full access to webhook" on "public"."webhook";

drop policy "Service role full access to workflow" on "public"."workflow";

drop policy "tenant_isolation_workflow" on "public"."workflow";

drop policy "Service role full access to workflow_execution" on "public"."workflow_execution";

drop policy "tenant_isolation_workflow_execution" on "public"."workflow_execution";

revoke delete on table "public"."accounts" from "anon";

revoke insert on table "public"."accounts" from "anon";

revoke references on table "public"."accounts" from "anon";

revoke select on table "public"."accounts" from "anon";

revoke trigger on table "public"."accounts" from "anon";

revoke truncate on table "public"."accounts" from "anon";

revoke update on table "public"."accounts" from "anon";

revoke delete on table "public"."accounts" from "authenticated";

revoke insert on table "public"."accounts" from "authenticated";

revoke references on table "public"."accounts" from "authenticated";

revoke select on table "public"."accounts" from "authenticated";

revoke trigger on table "public"."accounts" from "authenticated";

revoke truncate on table "public"."accounts" from "authenticated";

revoke update on table "public"."accounts" from "authenticated";

revoke delete on table "public"."accounts" from "service_role";

revoke insert on table "public"."accounts" from "service_role";

revoke references on table "public"."accounts" from "service_role";

revoke select on table "public"."accounts" from "service_role";

revoke trigger on table "public"."accounts" from "service_role";

revoke truncate on table "public"."accounts" from "service_role";

revoke update on table "public"."accounts" from "service_role";

revoke delete on table "public"."activities" from "anon";

revoke insert on table "public"."activities" from "anon";

revoke references on table "public"."activities" from "anon";

revoke select on table "public"."activities" from "anon";

revoke trigger on table "public"."activities" from "anon";

revoke truncate on table "public"."activities" from "anon";

revoke update on table "public"."activities" from "anon";

revoke delete on table "public"."activities" from "authenticated";

revoke insert on table "public"."activities" from "authenticated";

revoke references on table "public"."activities" from "authenticated";

revoke select on table "public"."activities" from "authenticated";

revoke trigger on table "public"."activities" from "authenticated";

revoke truncate on table "public"."activities" from "authenticated";

revoke update on table "public"."activities" from "authenticated";

revoke delete on table "public"."activities" from "service_role";

revoke insert on table "public"."activities" from "service_role";

revoke references on table "public"."activities" from "service_role";

revoke select on table "public"."activities" from "service_role";

revoke trigger on table "public"."activities" from "service_role";

revoke truncate on table "public"."activities" from "service_role";

revoke update on table "public"."activities" from "service_role";

revoke delete on table "public"."ai_campaign" from "anon";

revoke insert on table "public"."ai_campaign" from "anon";

revoke references on table "public"."ai_campaign" from "anon";

revoke select on table "public"."ai_campaign" from "anon";

revoke trigger on table "public"."ai_campaign" from "anon";

revoke truncate on table "public"."ai_campaign" from "anon";

revoke update on table "public"."ai_campaign" from "anon";

revoke delete on table "public"."ai_campaign" from "authenticated";

revoke insert on table "public"."ai_campaign" from "authenticated";

revoke references on table "public"."ai_campaign" from "authenticated";

revoke select on table "public"."ai_campaign" from "authenticated";

revoke trigger on table "public"."ai_campaign" from "authenticated";

revoke truncate on table "public"."ai_campaign" from "authenticated";

revoke update on table "public"."ai_campaign" from "authenticated";

revoke delete on table "public"."ai_campaign" from "service_role";

revoke insert on table "public"."ai_campaign" from "service_role";

revoke references on table "public"."ai_campaign" from "service_role";

revoke select on table "public"."ai_campaign" from "service_role";

revoke trigger on table "public"."ai_campaign" from "service_role";

revoke truncate on table "public"."ai_campaign" from "service_role";

revoke update on table "public"."ai_campaign" from "service_role";

revoke delete on table "public"."announcement" from "anon";

revoke insert on table "public"."announcement" from "anon";

revoke references on table "public"."announcement" from "anon";

revoke select on table "public"."announcement" from "anon";

revoke trigger on table "public"."announcement" from "anon";

revoke truncate on table "public"."announcement" from "anon";

revoke update on table "public"."announcement" from "anon";

revoke delete on table "public"."announcement" from "authenticated";

revoke insert on table "public"."announcement" from "authenticated";

revoke references on table "public"."announcement" from "authenticated";

revoke select on table "public"."announcement" from "authenticated";

revoke trigger on table "public"."announcement" from "authenticated";

revoke truncate on table "public"."announcement" from "authenticated";

revoke update on table "public"."announcement" from "authenticated";

revoke delete on table "public"."announcement" from "service_role";

revoke insert on table "public"."announcement" from "service_role";

revoke references on table "public"."announcement" from "service_role";

revoke select on table "public"."announcement" from "service_role";

revoke trigger on table "public"."announcement" from "service_role";

revoke truncate on table "public"."announcement" from "service_role";

revoke update on table "public"."announcement" from "service_role";

revoke delete on table "public"."api_key" from "service_role";

revoke insert on table "public"."api_key" from "service_role";

revoke references on table "public"."api_key" from "service_role";

revoke select on table "public"."api_key" from "service_role";

revoke trigger on table "public"."api_key" from "service_role";

revoke truncate on table "public"."api_key" from "service_role";

revoke update on table "public"."api_key" from "service_role";

revoke delete on table "public"."apikey" from "service_role";

revoke insert on table "public"."apikey" from "service_role";

revoke references on table "public"."apikey" from "service_role";

revoke select on table "public"."apikey" from "service_role";

revoke trigger on table "public"."apikey" from "service_role";

revoke truncate on table "public"."apikey" from "service_role";

revoke update on table "public"."apikey" from "service_role";

revoke delete on table "public"."archive_index" from "anon";

revoke insert on table "public"."archive_index" from "anon";

revoke references on table "public"."archive_index" from "anon";

revoke select on table "public"."archive_index" from "anon";

revoke trigger on table "public"."archive_index" from "anon";

revoke truncate on table "public"."archive_index" from "anon";

revoke update on table "public"."archive_index" from "anon";

revoke delete on table "public"."archive_index" from "authenticated";

revoke insert on table "public"."archive_index" from "authenticated";

revoke references on table "public"."archive_index" from "authenticated";

revoke select on table "public"."archive_index" from "authenticated";

revoke trigger on table "public"."archive_index" from "authenticated";

revoke truncate on table "public"."archive_index" from "authenticated";

revoke update on table "public"."archive_index" from "authenticated";

revoke delete on table "public"."archive_index" from "service_role";

revoke insert on table "public"."archive_index" from "service_role";

revoke references on table "public"."archive_index" from "service_role";

revoke select on table "public"."archive_index" from "service_role";

revoke trigger on table "public"."archive_index" from "service_role";

revoke truncate on table "public"."archive_index" from "service_role";

revoke update on table "public"."archive_index" from "service_role";

revoke delete on table "public"."audit_log" from "service_role";

revoke insert on table "public"."audit_log" from "service_role";

revoke references on table "public"."audit_log" from "service_role";

revoke select on table "public"."audit_log" from "service_role";

revoke trigger on table "public"."audit_log" from "service_role";

revoke truncate on table "public"."audit_log" from "service_role";

revoke update on table "public"."audit_log" from "service_role";

revoke delete on table "public"."bizdev_source" from "anon";

revoke insert on table "public"."bizdev_source" from "anon";

revoke references on table "public"."bizdev_source" from "anon";

revoke select on table "public"."bizdev_source" from "anon";

revoke trigger on table "public"."bizdev_source" from "anon";

revoke truncate on table "public"."bizdev_source" from "anon";

revoke update on table "public"."bizdev_source" from "anon";

revoke delete on table "public"."bizdev_source" from "authenticated";

revoke insert on table "public"."bizdev_source" from "authenticated";

revoke references on table "public"."bizdev_source" from "authenticated";

revoke select on table "public"."bizdev_source" from "authenticated";

revoke trigger on table "public"."bizdev_source" from "authenticated";

revoke truncate on table "public"."bizdev_source" from "authenticated";

revoke update on table "public"."bizdev_source" from "authenticated";

revoke delete on table "public"."bizdev_source" from "service_role";

revoke insert on table "public"."bizdev_source" from "service_role";

revoke references on table "public"."bizdev_source" from "service_role";

revoke select on table "public"."bizdev_source" from "service_role";

revoke trigger on table "public"."bizdev_source" from "service_role";

revoke truncate on table "public"."bizdev_source" from "service_role";

revoke update on table "public"."bizdev_source" from "service_role";

revoke delete on table "public"."bizdev_sources" from "anon";

revoke insert on table "public"."bizdev_sources" from "anon";

revoke references on table "public"."bizdev_sources" from "anon";

revoke select on table "public"."bizdev_sources" from "anon";

revoke trigger on table "public"."bizdev_sources" from "anon";

revoke truncate on table "public"."bizdev_sources" from "anon";

revoke update on table "public"."bizdev_sources" from "anon";

revoke delete on table "public"."bizdev_sources" from "authenticated";

revoke insert on table "public"."bizdev_sources" from "authenticated";

revoke references on table "public"."bizdev_sources" from "authenticated";

revoke select on table "public"."bizdev_sources" from "authenticated";

revoke trigger on table "public"."bizdev_sources" from "authenticated";

revoke truncate on table "public"."bizdev_sources" from "authenticated";

revoke update on table "public"."bizdev_sources" from "authenticated";

revoke delete on table "public"."bizdev_sources" from "service_role";

revoke insert on table "public"."bizdev_sources" from "service_role";

revoke references on table "public"."bizdev_sources" from "service_role";

revoke select on table "public"."bizdev_sources" from "service_role";

revoke trigger on table "public"."bizdev_sources" from "service_role";

revoke truncate on table "public"."bizdev_sources" from "service_role";

revoke update on table "public"."bizdev_sources" from "service_role";

revoke delete on table "public"."cache" from "service_role";

revoke insert on table "public"."cache" from "service_role";

revoke references on table "public"."cache" from "service_role";

revoke select on table "public"."cache" from "service_role";

revoke trigger on table "public"."cache" from "service_role";

revoke truncate on table "public"."cache" from "service_role";

revoke update on table "public"."cache" from "service_role";

revoke delete on table "public"."cash_flow" from "anon";

revoke insert on table "public"."cash_flow" from "anon";

revoke references on table "public"."cash_flow" from "anon";

revoke select on table "public"."cash_flow" from "anon";

revoke trigger on table "public"."cash_flow" from "anon";

revoke truncate on table "public"."cash_flow" from "anon";

revoke update on table "public"."cash_flow" from "anon";

revoke delete on table "public"."cash_flow" from "authenticated";

revoke insert on table "public"."cash_flow" from "authenticated";

revoke references on table "public"."cash_flow" from "authenticated";

revoke select on table "public"."cash_flow" from "authenticated";

revoke trigger on table "public"."cash_flow" from "authenticated";

revoke truncate on table "public"."cash_flow" from "authenticated";

revoke update on table "public"."cash_flow" from "authenticated";

revoke delete on table "public"."cash_flow" from "service_role";

revoke insert on table "public"."cash_flow" from "service_role";

revoke references on table "public"."cash_flow" from "service_role";

revoke select on table "public"."cash_flow" from "service_role";

revoke trigger on table "public"."cash_flow" from "service_role";

revoke truncate on table "public"."cash_flow" from "service_role";

revoke update on table "public"."cash_flow" from "service_role";

revoke delete on table "public"."checkpoint" from "anon";

revoke insert on table "public"."checkpoint" from "anon";

revoke references on table "public"."checkpoint" from "anon";

revoke select on table "public"."checkpoint" from "anon";

revoke trigger on table "public"."checkpoint" from "anon";

revoke truncate on table "public"."checkpoint" from "anon";

revoke update on table "public"."checkpoint" from "anon";

revoke delete on table "public"."checkpoint" from "authenticated";

revoke insert on table "public"."checkpoint" from "authenticated";

revoke references on table "public"."checkpoint" from "authenticated";

revoke select on table "public"."checkpoint" from "authenticated";

revoke trigger on table "public"."checkpoint" from "authenticated";

revoke truncate on table "public"."checkpoint" from "authenticated";

revoke update on table "public"."checkpoint" from "authenticated";

revoke delete on table "public"."checkpoint" from "service_role";

revoke insert on table "public"."checkpoint" from "service_role";

revoke references on table "public"."checkpoint" from "service_role";

revoke select on table "public"."checkpoint" from "service_role";

revoke trigger on table "public"."checkpoint" from "service_role";

revoke truncate on table "public"."checkpoint" from "service_role";

revoke update on table "public"."checkpoint" from "service_role";

revoke delete on table "public"."client_requirement" from "anon";

revoke insert on table "public"."client_requirement" from "anon";

revoke references on table "public"."client_requirement" from "anon";

revoke select on table "public"."client_requirement" from "anon";

revoke trigger on table "public"."client_requirement" from "anon";

revoke truncate on table "public"."client_requirement" from "anon";

revoke update on table "public"."client_requirement" from "anon";

revoke delete on table "public"."client_requirement" from "authenticated";

revoke insert on table "public"."client_requirement" from "authenticated";

revoke references on table "public"."client_requirement" from "authenticated";

revoke select on table "public"."client_requirement" from "authenticated";

revoke trigger on table "public"."client_requirement" from "authenticated";

revoke truncate on table "public"."client_requirement" from "authenticated";

revoke update on table "public"."client_requirement" from "authenticated";

revoke delete on table "public"."client_requirement" from "service_role";

revoke insert on table "public"."client_requirement" from "service_role";

revoke references on table "public"."client_requirement" from "service_role";

revoke select on table "public"."client_requirement" from "service_role";

revoke trigger on table "public"."client_requirement" from "service_role";

revoke truncate on table "public"."client_requirement" from "service_role";

revoke update on table "public"."client_requirement" from "service_role";

revoke delete on table "public"."contact_history" from "anon";

revoke insert on table "public"."contact_history" from "anon";

revoke references on table "public"."contact_history" from "anon";

revoke select on table "public"."contact_history" from "anon";

revoke trigger on table "public"."contact_history" from "anon";

revoke truncate on table "public"."contact_history" from "anon";

revoke update on table "public"."contact_history" from "anon";

revoke delete on table "public"."contact_history" from "authenticated";

revoke insert on table "public"."contact_history" from "authenticated";

revoke references on table "public"."contact_history" from "authenticated";

revoke select on table "public"."contact_history" from "authenticated";

revoke trigger on table "public"."contact_history" from "authenticated";

revoke truncate on table "public"."contact_history" from "authenticated";

revoke update on table "public"."contact_history" from "authenticated";

revoke delete on table "public"."contact_history" from "service_role";

revoke insert on table "public"."contact_history" from "service_role";

revoke references on table "public"."contact_history" from "service_role";

revoke select on table "public"."contact_history" from "service_role";

revoke trigger on table "public"."contact_history" from "service_role";

revoke truncate on table "public"."contact_history" from "service_role";

revoke update on table "public"."contact_history" from "service_role";

revoke delete on table "public"."contacts" from "anon";

revoke insert on table "public"."contacts" from "anon";

revoke references on table "public"."contacts" from "anon";

revoke select on table "public"."contacts" from "anon";

revoke trigger on table "public"."contacts" from "anon";

revoke truncate on table "public"."contacts" from "anon";

revoke update on table "public"."contacts" from "anon";

revoke delete on table "public"."contacts" from "authenticated";

revoke insert on table "public"."contacts" from "authenticated";

revoke references on table "public"."contacts" from "authenticated";

revoke select on table "public"."contacts" from "authenticated";

revoke trigger on table "public"."contacts" from "authenticated";

revoke truncate on table "public"."contacts" from "authenticated";

revoke update on table "public"."contacts" from "authenticated";

revoke delete on table "public"."contacts" from "service_role";

revoke insert on table "public"."contacts" from "service_role";

revoke references on table "public"."contacts" from "service_role";

revoke select on table "public"."contacts" from "service_role";

revoke trigger on table "public"."contacts" from "service_role";

revoke truncate on table "public"."contacts" from "service_role";

revoke update on table "public"."contacts" from "service_role";

revoke delete on table "public"."conversation_messages" from "anon";

revoke insert on table "public"."conversation_messages" from "anon";

revoke references on table "public"."conversation_messages" from "anon";

revoke select on table "public"."conversation_messages" from "anon";

revoke trigger on table "public"."conversation_messages" from "anon";

revoke truncate on table "public"."conversation_messages" from "anon";

revoke update on table "public"."conversation_messages" from "anon";

revoke delete on table "public"."conversation_messages" from "authenticated";

revoke insert on table "public"."conversation_messages" from "authenticated";

revoke references on table "public"."conversation_messages" from "authenticated";

revoke select on table "public"."conversation_messages" from "authenticated";

revoke trigger on table "public"."conversation_messages" from "authenticated";

revoke truncate on table "public"."conversation_messages" from "authenticated";

revoke update on table "public"."conversation_messages" from "authenticated";

revoke delete on table "public"."conversation_messages" from "service_role";

revoke insert on table "public"."conversation_messages" from "service_role";

revoke references on table "public"."conversation_messages" from "service_role";

revoke select on table "public"."conversation_messages" from "service_role";

revoke trigger on table "public"."conversation_messages" from "service_role";

revoke truncate on table "public"."conversation_messages" from "service_role";

revoke update on table "public"."conversation_messages" from "service_role";

revoke delete on table "public"."conversations" from "anon";

revoke insert on table "public"."conversations" from "anon";

revoke references on table "public"."conversations" from "anon";

revoke select on table "public"."conversations" from "anon";

revoke trigger on table "public"."conversations" from "anon";

revoke truncate on table "public"."conversations" from "anon";

revoke update on table "public"."conversations" from "anon";

revoke delete on table "public"."conversations" from "authenticated";

revoke insert on table "public"."conversations" from "authenticated";

revoke references on table "public"."conversations" from "authenticated";

revoke select on table "public"."conversations" from "authenticated";

revoke trigger on table "public"."conversations" from "authenticated";

revoke truncate on table "public"."conversations" from "authenticated";

revoke update on table "public"."conversations" from "authenticated";

revoke delete on table "public"."conversations" from "service_role";

revoke insert on table "public"."conversations" from "service_role";

revoke references on table "public"."conversations" from "service_role";

revoke select on table "public"."conversations" from "service_role";

revoke trigger on table "public"."conversations" from "service_role";

revoke truncate on table "public"."conversations" from "service_role";

revoke update on table "public"."conversations" from "service_role";

revoke delete on table "public"."cron_job" from "service_role";

revoke insert on table "public"."cron_job" from "service_role";

revoke references on table "public"."cron_job" from "service_role";

revoke select on table "public"."cron_job" from "service_role";

revoke trigger on table "public"."cron_job" from "service_role";

revoke truncate on table "public"."cron_job" from "service_role";

revoke update on table "public"."cron_job" from "service_role";

revoke delete on table "public"."daily_sales_metrics" from "anon";

revoke insert on table "public"."daily_sales_metrics" from "anon";

revoke references on table "public"."daily_sales_metrics" from "anon";

revoke select on table "public"."daily_sales_metrics" from "anon";

revoke trigger on table "public"."daily_sales_metrics" from "anon";

revoke truncate on table "public"."daily_sales_metrics" from "anon";

revoke update on table "public"."daily_sales_metrics" from "anon";

revoke delete on table "public"."daily_sales_metrics" from "authenticated";

revoke insert on table "public"."daily_sales_metrics" from "authenticated";

revoke references on table "public"."daily_sales_metrics" from "authenticated";

revoke select on table "public"."daily_sales_metrics" from "authenticated";

revoke trigger on table "public"."daily_sales_metrics" from "authenticated";

revoke truncate on table "public"."daily_sales_metrics" from "authenticated";

revoke update on table "public"."daily_sales_metrics" from "authenticated";

revoke delete on table "public"."daily_sales_metrics" from "service_role";

revoke insert on table "public"."daily_sales_metrics" from "service_role";

revoke references on table "public"."daily_sales_metrics" from "service_role";

revoke select on table "public"."daily_sales_metrics" from "service_role";

revoke trigger on table "public"."daily_sales_metrics" from "service_role";

revoke truncate on table "public"."daily_sales_metrics" from "service_role";

revoke update on table "public"."daily_sales_metrics" from "service_role";

revoke delete on table "public"."documentation" from "anon";

revoke insert on table "public"."documentation" from "anon";

revoke references on table "public"."documentation" from "anon";

revoke select on table "public"."documentation" from "anon";

revoke trigger on table "public"."documentation" from "anon";

revoke truncate on table "public"."documentation" from "anon";

revoke update on table "public"."documentation" from "anon";

revoke delete on table "public"."documentation" from "authenticated";

revoke insert on table "public"."documentation" from "authenticated";

revoke references on table "public"."documentation" from "authenticated";

revoke select on table "public"."documentation" from "authenticated";

revoke trigger on table "public"."documentation" from "authenticated";

revoke truncate on table "public"."documentation" from "authenticated";

revoke update on table "public"."documentation" from "authenticated";

revoke delete on table "public"."documentation" from "service_role";

revoke insert on table "public"."documentation" from "service_role";

revoke references on table "public"."documentation" from "service_role";

revoke select on table "public"."documentation" from "service_role";

revoke trigger on table "public"."documentation" from "service_role";

revoke truncate on table "public"."documentation" from "service_role";

revoke update on table "public"."documentation" from "service_role";

revoke delete on table "public"."email_template" from "anon";

revoke insert on table "public"."email_template" from "anon";

revoke references on table "public"."email_template" from "anon";

revoke select on table "public"."email_template" from "anon";

revoke trigger on table "public"."email_template" from "anon";

revoke truncate on table "public"."email_template" from "anon";

revoke update on table "public"."email_template" from "anon";

revoke delete on table "public"."email_template" from "authenticated";

revoke insert on table "public"."email_template" from "authenticated";

revoke references on table "public"."email_template" from "authenticated";

revoke select on table "public"."email_template" from "authenticated";

revoke trigger on table "public"."email_template" from "authenticated";

revoke truncate on table "public"."email_template" from "authenticated";

revoke update on table "public"."email_template" from "authenticated";

revoke delete on table "public"."email_template" from "service_role";

revoke insert on table "public"."email_template" from "service_role";

revoke references on table "public"."email_template" from "service_role";

revoke select on table "public"."email_template" from "service_role";

revoke trigger on table "public"."email_template" from "service_role";

revoke truncate on table "public"."email_template" from "service_role";

revoke update on table "public"."email_template" from "service_role";

revoke delete on table "public"."employees" from "anon";

revoke insert on table "public"."employees" from "anon";

revoke references on table "public"."employees" from "anon";

revoke select on table "public"."employees" from "anon";

revoke trigger on table "public"."employees" from "anon";

revoke truncate on table "public"."employees" from "anon";

revoke update on table "public"."employees" from "anon";

revoke delete on table "public"."employees" from "authenticated";

revoke insert on table "public"."employees" from "authenticated";

revoke references on table "public"."employees" from "authenticated";

revoke select on table "public"."employees" from "authenticated";

revoke trigger on table "public"."employees" from "authenticated";

revoke truncate on table "public"."employees" from "authenticated";

revoke update on table "public"."employees" from "authenticated";

revoke delete on table "public"."employees" from "service_role";

revoke insert on table "public"."employees" from "service_role";

revoke references on table "public"."employees" from "service_role";

revoke select on table "public"."employees" from "service_role";

revoke trigger on table "public"."employees" from "service_role";

revoke truncate on table "public"."employees" from "service_role";

revoke update on table "public"."employees" from "service_role";

revoke delete on table "public"."field_customization" from "anon";

revoke insert on table "public"."field_customization" from "anon";

revoke references on table "public"."field_customization" from "anon";

revoke select on table "public"."field_customization" from "anon";

revoke trigger on table "public"."field_customization" from "anon";

revoke truncate on table "public"."field_customization" from "anon";

revoke update on table "public"."field_customization" from "anon";

revoke delete on table "public"."field_customization" from "authenticated";

revoke insert on table "public"."field_customization" from "authenticated";

revoke references on table "public"."field_customization" from "authenticated";

revoke select on table "public"."field_customization" from "authenticated";

revoke trigger on table "public"."field_customization" from "authenticated";

revoke truncate on table "public"."field_customization" from "authenticated";

revoke update on table "public"."field_customization" from "authenticated";

revoke delete on table "public"."field_customization" from "service_role";

revoke insert on table "public"."field_customization" from "service_role";

revoke references on table "public"."field_customization" from "service_role";

revoke select on table "public"."field_customization" from "service_role";

revoke trigger on table "public"."field_customization" from "service_role";

revoke truncate on table "public"."field_customization" from "service_role";

revoke update on table "public"."field_customization" from "service_role";

revoke delete on table "public"."file" from "anon";

revoke insert on table "public"."file" from "anon";

revoke references on table "public"."file" from "anon";

revoke select on table "public"."file" from "anon";

revoke trigger on table "public"."file" from "anon";

revoke truncate on table "public"."file" from "anon";

revoke update on table "public"."file" from "anon";

revoke delete on table "public"."file" from "authenticated";

revoke insert on table "public"."file" from "authenticated";

revoke references on table "public"."file" from "authenticated";

revoke select on table "public"."file" from "authenticated";

revoke trigger on table "public"."file" from "authenticated";

revoke truncate on table "public"."file" from "authenticated";

revoke update on table "public"."file" from "authenticated";

revoke delete on table "public"."file" from "service_role";

revoke insert on table "public"."file" from "service_role";

revoke references on table "public"."file" from "service_role";

revoke select on table "public"."file" from "service_role";

revoke trigger on table "public"."file" from "service_role";

revoke truncate on table "public"."file" from "service_role";

revoke update on table "public"."file" from "service_role";

revoke delete on table "public"."guide_content" from "anon";

revoke insert on table "public"."guide_content" from "anon";

revoke references on table "public"."guide_content" from "anon";

revoke select on table "public"."guide_content" from "anon";

revoke trigger on table "public"."guide_content" from "anon";

revoke truncate on table "public"."guide_content" from "anon";

revoke update on table "public"."guide_content" from "anon";

revoke delete on table "public"."guide_content" from "authenticated";

revoke insert on table "public"."guide_content" from "authenticated";

revoke references on table "public"."guide_content" from "authenticated";

revoke select on table "public"."guide_content" from "authenticated";

revoke trigger on table "public"."guide_content" from "authenticated";

revoke truncate on table "public"."guide_content" from "authenticated";

revoke update on table "public"."guide_content" from "authenticated";

revoke delete on table "public"."guide_content" from "service_role";

revoke insert on table "public"."guide_content" from "service_role";

revoke references on table "public"."guide_content" from "service_role";

revoke select on table "public"."guide_content" from "service_role";

revoke trigger on table "public"."guide_content" from "service_role";

revoke truncate on table "public"."guide_content" from "service_role";

revoke update on table "public"."guide_content" from "service_role";

revoke delete on table "public"."import_log" from "anon";

revoke insert on table "public"."import_log" from "anon";

revoke references on table "public"."import_log" from "anon";

revoke select on table "public"."import_log" from "anon";

revoke trigger on table "public"."import_log" from "anon";

revoke truncate on table "public"."import_log" from "anon";

revoke update on table "public"."import_log" from "anon";

revoke delete on table "public"."import_log" from "authenticated";

revoke insert on table "public"."import_log" from "authenticated";

revoke references on table "public"."import_log" from "authenticated";

revoke select on table "public"."import_log" from "authenticated";

revoke trigger on table "public"."import_log" from "authenticated";

revoke truncate on table "public"."import_log" from "authenticated";

revoke update on table "public"."import_log" from "authenticated";

revoke delete on table "public"."import_log" from "service_role";

revoke insert on table "public"."import_log" from "service_role";

revoke references on table "public"."import_log" from "service_role";

revoke select on table "public"."import_log" from "service_role";

revoke trigger on table "public"."import_log" from "service_role";

revoke truncate on table "public"."import_log" from "service_role";

revoke update on table "public"."import_log" from "service_role";

revoke delete on table "public"."lead_history" from "anon";

revoke insert on table "public"."lead_history" from "anon";

revoke references on table "public"."lead_history" from "anon";

revoke select on table "public"."lead_history" from "anon";

revoke trigger on table "public"."lead_history" from "anon";

revoke truncate on table "public"."lead_history" from "anon";

revoke update on table "public"."lead_history" from "anon";

revoke delete on table "public"."lead_history" from "authenticated";

revoke insert on table "public"."lead_history" from "authenticated";

revoke references on table "public"."lead_history" from "authenticated";

revoke select on table "public"."lead_history" from "authenticated";

revoke trigger on table "public"."lead_history" from "authenticated";

revoke truncate on table "public"."lead_history" from "authenticated";

revoke update on table "public"."lead_history" from "authenticated";

revoke delete on table "public"."lead_history" from "service_role";

revoke insert on table "public"."lead_history" from "service_role";

revoke references on table "public"."lead_history" from "service_role";

revoke select on table "public"."lead_history" from "service_role";

revoke trigger on table "public"."lead_history" from "service_role";

revoke truncate on table "public"."lead_history" from "service_role";

revoke update on table "public"."lead_history" from "service_role";

revoke delete on table "public"."leads" from "anon";

revoke insert on table "public"."leads" from "anon";

revoke references on table "public"."leads" from "anon";

revoke select on table "public"."leads" from "anon";

revoke trigger on table "public"."leads" from "anon";

revoke truncate on table "public"."leads" from "anon";

revoke update on table "public"."leads" from "anon";

revoke delete on table "public"."leads" from "authenticated";

revoke insert on table "public"."leads" from "authenticated";

revoke references on table "public"."leads" from "authenticated";

revoke select on table "public"."leads" from "authenticated";

revoke trigger on table "public"."leads" from "authenticated";

revoke truncate on table "public"."leads" from "authenticated";

revoke update on table "public"."leads" from "authenticated";

revoke delete on table "public"."leads" from "service_role";

revoke insert on table "public"."leads" from "service_role";

revoke references on table "public"."leads" from "service_role";

revoke select on table "public"."leads" from "service_role";

revoke trigger on table "public"."leads" from "service_role";

revoke truncate on table "public"."leads" from "service_role";

revoke update on table "public"."leads" from "service_role";

revoke delete on table "public"."modulesettings" from "anon";

revoke insert on table "public"."modulesettings" from "anon";

revoke references on table "public"."modulesettings" from "anon";

revoke select on table "public"."modulesettings" from "anon";

revoke trigger on table "public"."modulesettings" from "anon";

revoke truncate on table "public"."modulesettings" from "anon";

revoke update on table "public"."modulesettings" from "anon";

revoke delete on table "public"."modulesettings" from "authenticated";

revoke insert on table "public"."modulesettings" from "authenticated";

revoke references on table "public"."modulesettings" from "authenticated";

revoke select on table "public"."modulesettings" from "authenticated";

revoke trigger on table "public"."modulesettings" from "authenticated";

revoke truncate on table "public"."modulesettings" from "authenticated";

revoke update on table "public"."modulesettings" from "authenticated";

revoke delete on table "public"."modulesettings" from "service_role";

revoke insert on table "public"."modulesettings" from "service_role";

revoke references on table "public"."modulesettings" from "service_role";

revoke select on table "public"."modulesettings" from "service_role";

revoke trigger on table "public"."modulesettings" from "service_role";

revoke truncate on table "public"."modulesettings" from "service_role";

revoke update on table "public"."modulesettings" from "service_role";

revoke delete on table "public"."note" from "anon";

revoke insert on table "public"."note" from "anon";

revoke references on table "public"."note" from "anon";

revoke select on table "public"."note" from "anon";

revoke trigger on table "public"."note" from "anon";

revoke truncate on table "public"."note" from "anon";

revoke update on table "public"."note" from "anon";

revoke delete on table "public"."note" from "authenticated";

revoke insert on table "public"."note" from "authenticated";

revoke references on table "public"."note" from "authenticated";

revoke select on table "public"."note" from "authenticated";

revoke trigger on table "public"."note" from "authenticated";

revoke truncate on table "public"."note" from "authenticated";

revoke update on table "public"."note" from "authenticated";

revoke delete on table "public"."note" from "service_role";

revoke insert on table "public"."note" from "service_role";

revoke references on table "public"."note" from "service_role";

revoke select on table "public"."note" from "service_role";

revoke trigger on table "public"."note" from "service_role";

revoke truncate on table "public"."note" from "service_role";

revoke update on table "public"."note" from "service_role";

revoke delete on table "public"."notifications" from "anon";

revoke insert on table "public"."notifications" from "anon";

revoke references on table "public"."notifications" from "anon";

revoke select on table "public"."notifications" from "anon";

revoke trigger on table "public"."notifications" from "anon";

revoke truncate on table "public"."notifications" from "anon";

revoke update on table "public"."notifications" from "anon";

revoke delete on table "public"."notifications" from "authenticated";

revoke insert on table "public"."notifications" from "authenticated";

revoke references on table "public"."notifications" from "authenticated";

revoke select on table "public"."notifications" from "authenticated";

revoke trigger on table "public"."notifications" from "authenticated";

revoke truncate on table "public"."notifications" from "authenticated";

revoke update on table "public"."notifications" from "authenticated";

revoke delete on table "public"."notifications" from "service_role";

revoke insert on table "public"."notifications" from "service_role";

revoke references on table "public"."notifications" from "service_role";

revoke select on table "public"."notifications" from "service_role";

revoke trigger on table "public"."notifications" from "service_role";

revoke truncate on table "public"."notifications" from "service_role";

revoke update on table "public"."notifications" from "service_role";

revoke delete on table "public"."opportunities" from "anon";

revoke insert on table "public"."opportunities" from "anon";

revoke references on table "public"."opportunities" from "anon";

revoke select on table "public"."opportunities" from "anon";

revoke trigger on table "public"."opportunities" from "anon";

revoke truncate on table "public"."opportunities" from "anon";

revoke update on table "public"."opportunities" from "anon";

revoke delete on table "public"."opportunities" from "authenticated";

revoke insert on table "public"."opportunities" from "authenticated";

revoke references on table "public"."opportunities" from "authenticated";

revoke select on table "public"."opportunities" from "authenticated";

revoke trigger on table "public"."opportunities" from "authenticated";

revoke truncate on table "public"."opportunities" from "authenticated";

revoke update on table "public"."opportunities" from "authenticated";

revoke delete on table "public"."opportunities" from "service_role";

revoke insert on table "public"."opportunities" from "service_role";

revoke references on table "public"."opportunities" from "service_role";

revoke select on table "public"."opportunities" from "service_role";

revoke trigger on table "public"."opportunities" from "service_role";

revoke truncate on table "public"."opportunities" from "service_role";

revoke update on table "public"."opportunities" from "service_role";

revoke delete on table "public"."performance_log" from "service_role";

revoke insert on table "public"."performance_log" from "service_role";

revoke references on table "public"."performance_log" from "service_role";

revoke select on table "public"."performance_log" from "service_role";

revoke trigger on table "public"."performance_log" from "service_role";

revoke truncate on table "public"."performance_log" from "service_role";

revoke update on table "public"."performance_log" from "service_role";

revoke insert on table "public"."performance_logs" from "authenticated";

revoke delete on table "public"."performance_logs" from "service_role";

revoke insert on table "public"."performance_logs" from "service_role";

revoke references on table "public"."performance_logs" from "service_role";

revoke select on table "public"."performance_logs" from "service_role";

revoke trigger on table "public"."performance_logs" from "service_role";

revoke truncate on table "public"."performance_logs" from "service_role";

revoke update on table "public"."performance_logs" from "service_role";

revoke delete on table "public"."subscription" from "anon";

revoke insert on table "public"."subscription" from "anon";

revoke references on table "public"."subscription" from "anon";

revoke select on table "public"."subscription" from "anon";

revoke trigger on table "public"."subscription" from "anon";

revoke truncate on table "public"."subscription" from "anon";

revoke update on table "public"."subscription" from "anon";

revoke delete on table "public"."subscription" from "authenticated";

revoke insert on table "public"."subscription" from "authenticated";

revoke references on table "public"."subscription" from "authenticated";

revoke select on table "public"."subscription" from "authenticated";

revoke trigger on table "public"."subscription" from "authenticated";

revoke truncate on table "public"."subscription" from "authenticated";

revoke update on table "public"."subscription" from "authenticated";

revoke delete on table "public"."subscription" from "service_role";

revoke insert on table "public"."subscription" from "service_role";

revoke references on table "public"."subscription" from "service_role";

revoke select on table "public"."subscription" from "service_role";

revoke trigger on table "public"."subscription" from "service_role";

revoke truncate on table "public"."subscription" from "service_role";

revoke update on table "public"."subscription" from "service_role";

revoke delete on table "public"."subscription_plan" from "anon";

revoke insert on table "public"."subscription_plan" from "anon";

revoke references on table "public"."subscription_plan" from "anon";

revoke select on table "public"."subscription_plan" from "anon";

revoke trigger on table "public"."subscription_plan" from "anon";

revoke truncate on table "public"."subscription_plan" from "anon";

revoke update on table "public"."subscription_plan" from "anon";

revoke delete on table "public"."subscription_plan" from "authenticated";

revoke insert on table "public"."subscription_plan" from "authenticated";

revoke references on table "public"."subscription_plan" from "authenticated";

revoke select on table "public"."subscription_plan" from "authenticated";

revoke trigger on table "public"."subscription_plan" from "authenticated";

revoke truncate on table "public"."subscription_plan" from "authenticated";

revoke update on table "public"."subscription_plan" from "authenticated";

revoke delete on table "public"."subscription_plan" from "service_role";

revoke insert on table "public"."subscription_plan" from "service_role";

revoke references on table "public"."subscription_plan" from "service_role";

revoke select on table "public"."subscription_plan" from "service_role";

revoke trigger on table "public"."subscription_plan" from "service_role";

revoke truncate on table "public"."subscription_plan" from "service_role";

revoke update on table "public"."subscription_plan" from "service_role";

revoke insert on table "public"."system_logs" from "authenticated";

revoke delete on table "public"."system_logs" from "service_role";

revoke insert on table "public"."system_logs" from "service_role";

revoke references on table "public"."system_logs" from "service_role";

revoke select on table "public"."system_logs" from "service_role";

revoke trigger on table "public"."system_logs" from "service_role";

revoke truncate on table "public"."system_logs" from "service_role";

revoke update on table "public"."system_logs" from "service_role";

revoke delete on table "public"."systembranding" from "anon";

revoke insert on table "public"."systembranding" from "anon";

revoke references on table "public"."systembranding" from "anon";

revoke select on table "public"."systembranding" from "anon";

revoke trigger on table "public"."systembranding" from "anon";

revoke truncate on table "public"."systembranding" from "anon";

revoke update on table "public"."systembranding" from "anon";

revoke delete on table "public"."systembranding" from "authenticated";

revoke insert on table "public"."systembranding" from "authenticated";

revoke references on table "public"."systembranding" from "authenticated";

revoke select on table "public"."systembranding" from "authenticated";

revoke trigger on table "public"."systembranding" from "authenticated";

revoke truncate on table "public"."systembranding" from "authenticated";

revoke update on table "public"."systembranding" from "authenticated";

revoke delete on table "public"."systembranding" from "service_role";

revoke insert on table "public"."systembranding" from "service_role";

revoke references on table "public"."systembranding" from "service_role";

revoke select on table "public"."systembranding" from "service_role";

revoke trigger on table "public"."systembranding" from "service_role";

revoke truncate on table "public"."systembranding" from "service_role";

revoke update on table "public"."systembranding" from "service_role";

revoke delete on table "public"."tenant" from "anon";

revoke insert on table "public"."tenant" from "anon";

revoke references on table "public"."tenant" from "anon";

revoke select on table "public"."tenant" from "anon";

revoke trigger on table "public"."tenant" from "anon";

revoke truncate on table "public"."tenant" from "anon";

revoke update on table "public"."tenant" from "anon";

revoke delete on table "public"."tenant" from "authenticated";

revoke insert on table "public"."tenant" from "authenticated";

revoke references on table "public"."tenant" from "authenticated";

revoke select on table "public"."tenant" from "authenticated";

revoke trigger on table "public"."tenant" from "authenticated";

revoke truncate on table "public"."tenant" from "authenticated";

revoke update on table "public"."tenant" from "authenticated";

revoke delete on table "public"."tenant" from "service_role";

revoke insert on table "public"."tenant" from "service_role";

revoke references on table "public"."tenant" from "service_role";

revoke select on table "public"."tenant" from "service_role";

revoke trigger on table "public"."tenant" from "service_role";

revoke truncate on table "public"."tenant" from "service_role";

revoke update on table "public"."tenant" from "service_role";

revoke delete on table "public"."tenant_integration" from "anon";

revoke insert on table "public"."tenant_integration" from "anon";

revoke references on table "public"."tenant_integration" from "anon";

revoke select on table "public"."tenant_integration" from "anon";

revoke trigger on table "public"."tenant_integration" from "anon";

revoke truncate on table "public"."tenant_integration" from "anon";

revoke update on table "public"."tenant_integration" from "anon";

revoke delete on table "public"."tenant_integration" from "authenticated";

revoke insert on table "public"."tenant_integration" from "authenticated";

revoke references on table "public"."tenant_integration" from "authenticated";

revoke select on table "public"."tenant_integration" from "authenticated";

revoke trigger on table "public"."tenant_integration" from "authenticated";

revoke truncate on table "public"."tenant_integration" from "authenticated";

revoke update on table "public"."tenant_integration" from "authenticated";

revoke delete on table "public"."tenant_integration" from "service_role";

revoke insert on table "public"."tenant_integration" from "service_role";

revoke references on table "public"."tenant_integration" from "service_role";

revoke select on table "public"."tenant_integration" from "service_role";

revoke trigger on table "public"."tenant_integration" from "service_role";

revoke truncate on table "public"."tenant_integration" from "service_role";

revoke update on table "public"."tenant_integration" from "service_role";

revoke delete on table "public"."tenant_integrations" from "anon";

revoke insert on table "public"."tenant_integrations" from "anon";

revoke references on table "public"."tenant_integrations" from "anon";

revoke select on table "public"."tenant_integrations" from "anon";

revoke trigger on table "public"."tenant_integrations" from "anon";

revoke truncate on table "public"."tenant_integrations" from "anon";

revoke update on table "public"."tenant_integrations" from "anon";

revoke delete on table "public"."tenant_integrations" from "authenticated";

revoke insert on table "public"."tenant_integrations" from "authenticated";

revoke references on table "public"."tenant_integrations" from "authenticated";

revoke select on table "public"."tenant_integrations" from "authenticated";

revoke trigger on table "public"."tenant_integrations" from "authenticated";

revoke truncate on table "public"."tenant_integrations" from "authenticated";

revoke update on table "public"."tenant_integrations" from "authenticated";

revoke delete on table "public"."tenant_integrations" from "service_role";

revoke insert on table "public"."tenant_integrations" from "service_role";

revoke references on table "public"."tenant_integrations" from "service_role";

revoke select on table "public"."tenant_integrations" from "service_role";

revoke trigger on table "public"."tenant_integrations" from "service_role";

revoke truncate on table "public"."tenant_integrations" from "service_role";

revoke update on table "public"."tenant_integrations" from "service_role";

revoke delete on table "public"."test_report" from "anon";

revoke insert on table "public"."test_report" from "anon";

revoke references on table "public"."test_report" from "anon";

revoke select on table "public"."test_report" from "anon";

revoke trigger on table "public"."test_report" from "anon";

revoke truncate on table "public"."test_report" from "anon";

revoke update on table "public"."test_report" from "anon";

revoke delete on table "public"."test_report" from "authenticated";

revoke insert on table "public"."test_report" from "authenticated";

revoke references on table "public"."test_report" from "authenticated";

revoke select on table "public"."test_report" from "authenticated";

revoke trigger on table "public"."test_report" from "authenticated";

revoke truncate on table "public"."test_report" from "authenticated";

revoke update on table "public"."test_report" from "authenticated";

revoke delete on table "public"."test_report" from "service_role";

revoke insert on table "public"."test_report" from "service_role";

revoke references on table "public"."test_report" from "service_role";

revoke select on table "public"."test_report" from "service_role";

revoke trigger on table "public"."test_report" from "service_role";

revoke truncate on table "public"."test_report" from "service_role";

revoke update on table "public"."test_report" from "service_role";

revoke delete on table "public"."user_invitation" from "anon";

revoke insert on table "public"."user_invitation" from "anon";

revoke references on table "public"."user_invitation" from "anon";

revoke select on table "public"."user_invitation" from "anon";

revoke trigger on table "public"."user_invitation" from "anon";

revoke truncate on table "public"."user_invitation" from "anon";

revoke update on table "public"."user_invitation" from "anon";

revoke delete on table "public"."user_invitation" from "authenticated";

revoke insert on table "public"."user_invitation" from "authenticated";

revoke references on table "public"."user_invitation" from "authenticated";

revoke select on table "public"."user_invitation" from "authenticated";

revoke trigger on table "public"."user_invitation" from "authenticated";

revoke truncate on table "public"."user_invitation" from "authenticated";

revoke update on table "public"."user_invitation" from "authenticated";

revoke delete on table "public"."user_invitation" from "service_role";

revoke insert on table "public"."user_invitation" from "service_role";

revoke references on table "public"."user_invitation" from "service_role";

revoke select on table "public"."user_invitation" from "service_role";

revoke trigger on table "public"."user_invitation" from "service_role";

revoke truncate on table "public"."user_invitation" from "service_role";

revoke update on table "public"."user_invitation" from "service_role";

revoke delete on table "public"."users" from "anon";

revoke insert on table "public"."users" from "anon";

revoke references on table "public"."users" from "anon";

revoke select on table "public"."users" from "anon";

revoke trigger on table "public"."users" from "anon";

revoke truncate on table "public"."users" from "anon";

revoke update on table "public"."users" from "anon";

revoke delete on table "public"."users" from "authenticated";

revoke insert on table "public"."users" from "authenticated";

revoke references on table "public"."users" from "authenticated";

revoke select on table "public"."users" from "authenticated";

revoke trigger on table "public"."users" from "authenticated";

revoke truncate on table "public"."users" from "authenticated";

revoke update on table "public"."users" from "authenticated";

revoke delete on table "public"."users" from "service_role";

revoke insert on table "public"."users" from "service_role";

revoke references on table "public"."users" from "service_role";

revoke select on table "public"."users" from "service_role";

revoke trigger on table "public"."users" from "service_role";

revoke truncate on table "public"."users" from "service_role";

revoke update on table "public"."users" from "service_role";

revoke delete on table "public"."webhook" from "anon";

revoke insert on table "public"."webhook" from "anon";

revoke references on table "public"."webhook" from "anon";

revoke select on table "public"."webhook" from "anon";

revoke trigger on table "public"."webhook" from "anon";

revoke truncate on table "public"."webhook" from "anon";

revoke update on table "public"."webhook" from "anon";

revoke delete on table "public"."webhook" from "authenticated";

revoke insert on table "public"."webhook" from "authenticated";

revoke references on table "public"."webhook" from "authenticated";

revoke select on table "public"."webhook" from "authenticated";

revoke trigger on table "public"."webhook" from "authenticated";

revoke truncate on table "public"."webhook" from "authenticated";

revoke update on table "public"."webhook" from "authenticated";

revoke delete on table "public"."webhook" from "service_role";

revoke insert on table "public"."webhook" from "service_role";

revoke references on table "public"."webhook" from "service_role";

revoke select on table "public"."webhook" from "service_role";

revoke trigger on table "public"."webhook" from "service_role";

revoke truncate on table "public"."webhook" from "service_role";

revoke update on table "public"."webhook" from "service_role";

revoke delete on table "public"."workflow" from "anon";

revoke insert on table "public"."workflow" from "anon";

revoke references on table "public"."workflow" from "anon";

revoke select on table "public"."workflow" from "anon";

revoke trigger on table "public"."workflow" from "anon";

revoke truncate on table "public"."workflow" from "anon";

revoke update on table "public"."workflow" from "anon";

revoke delete on table "public"."workflow" from "authenticated";

revoke insert on table "public"."workflow" from "authenticated";

revoke references on table "public"."workflow" from "authenticated";

revoke select on table "public"."workflow" from "authenticated";

revoke trigger on table "public"."workflow" from "authenticated";

revoke truncate on table "public"."workflow" from "authenticated";

revoke update on table "public"."workflow" from "authenticated";

revoke delete on table "public"."workflow" from "service_role";

revoke insert on table "public"."workflow" from "service_role";

revoke references on table "public"."workflow" from "service_role";

revoke select on table "public"."workflow" from "service_role";

revoke trigger on table "public"."workflow" from "service_role";

revoke truncate on table "public"."workflow" from "service_role";

revoke update on table "public"."workflow" from "service_role";

revoke delete on table "public"."workflow_execution" from "anon";

revoke insert on table "public"."workflow_execution" from "anon";

revoke references on table "public"."workflow_execution" from "anon";

revoke select on table "public"."workflow_execution" from "anon";

revoke trigger on table "public"."workflow_execution" from "anon";

revoke truncate on table "public"."workflow_execution" from "anon";

revoke update on table "public"."workflow_execution" from "anon";

revoke delete on table "public"."workflow_execution" from "authenticated";

revoke insert on table "public"."workflow_execution" from "authenticated";

revoke references on table "public"."workflow_execution" from "authenticated";

revoke select on table "public"."workflow_execution" from "authenticated";

revoke trigger on table "public"."workflow_execution" from "authenticated";

revoke truncate on table "public"."workflow_execution" from "authenticated";

revoke update on table "public"."workflow_execution" from "authenticated";

revoke delete on table "public"."workflow_execution" from "service_role";

revoke insert on table "public"."workflow_execution" from "service_role";

revoke references on table "public"."workflow_execution" from "service_role";

revoke select on table "public"."workflow_execution" from "service_role";

revoke trigger on table "public"."workflow_execution" from "service_role";

revoke truncate on table "public"."workflow_execution" from "service_role";

revoke update on table "public"."workflow_execution" from "service_role";

alter table "public"."cache" drop constraint "cache_cache_key_key";

alter table "public"."cash_flow" drop constraint "cash_flow_account_id_fkey";

alter table "public"."contact_history" drop constraint "contact_history_contact_id_fkey";

alter table "public"."contacts" drop constraint "contacts_account_id_fkey";

alter table "public"."conversation_messages" drop constraint "fk_messages_conversation";

alter table "public"."conversations" drop constraint "fk_conversations_tenant";

alter table "public"."daily_sales_metrics" drop constraint "daily_sales_metrics_tenant_id_metric_date_key";

alter table "public"."field_customization" drop constraint "field_customization_tenant_id_entity_type_field_name_key";

alter table "public"."lead_history" drop constraint "lead_history_lead_id_fkey";

alter table "public"."modulesettings" drop constraint "modulesettings_tenant_id_module_name_key";

alter table "public"."opportunities" drop constraint "opportunities_account_id_fkey";

alter table "public"."opportunities" drop constraint "opportunities_contact_id_fkey";

alter table "public"."subscription" drop constraint "subscription_plan_id_fkey";

alter table "public"."tenant" drop constraint "tenant_tenant_id_key";

alter table "public"."tenant_integration" drop constraint "tenant_integration_tenant_id_integration_type_key";

alter table "public"."user_invitation" drop constraint "user_invitation_token_key";

alter table "public"."users" drop constraint "users_email_key";

alter table "public"."workflow_execution" drop constraint "workflow_execution_workflow_id_fkey";

drop function if exists "public"."current_tenant_id"();

drop function if exists "public"."sync_bizdev_sources_created_date"();

drop function if exists "public"."sync_created_date"();

drop function if exists "public"."update_employees_updated_at"();

drop function if exists "public"."update_tenant_updated_at"();

alter table "public"."accounts" drop constraint "accounts_pkey";

alter table "public"."activities" drop constraint "activities_pkey";

alter table "public"."ai_campaign" drop constraint "ai_campaign_pkey";

alter table "public"."announcement" drop constraint "announcement_pkey";

alter table "public"."api_key" drop constraint "api_key_pkey";

alter table "public"."apikey" drop constraint "apikey_pkey";

alter table "public"."archive_index" drop constraint "archive_index_pkey";

alter table "public"."audit_log" drop constraint "audit_log_pkey";

alter table "public"."bizdev_source" drop constraint "bizdev_source_pkey";

alter table "public"."bizdev_sources" drop constraint "bizdev_sources_pkey";

alter table "public"."cache" drop constraint "cache_pkey";

alter table "public"."cash_flow" drop constraint "cash_flow_pkey";

alter table "public"."checkpoint" drop constraint "checkpoint_pkey";

alter table "public"."client_requirement" drop constraint "client_requirement_pkey";

alter table "public"."contact_history" drop constraint "contact_history_pkey";

alter table "public"."contacts" drop constraint "contacts_pkey";

alter table "public"."conversation_messages" drop constraint "conversation_messages_pkey";

alter table "public"."conversations" drop constraint "conversations_pkey";

alter table "public"."cron_job" drop constraint "cron_job_pkey";

alter table "public"."daily_sales_metrics" drop constraint "daily_sales_metrics_pkey";

alter table "public"."documentation" drop constraint "documentation_pkey";

alter table "public"."email_template" drop constraint "email_template_pkey";

alter table "public"."employees" drop constraint "employees_pkey";

alter table "public"."field_customization" drop constraint "field_customization_pkey";

alter table "public"."file" drop constraint "file_pkey";

alter table "public"."guide_content" drop constraint "guide_content_pkey";

alter table "public"."import_log" drop constraint "import_log_pkey";

alter table "public"."lead_history" drop constraint "lead_history_pkey";

alter table "public"."leads" drop constraint "leads_pkey";

alter table "public"."modulesettings" drop constraint "modulesettings_pkey";

alter table "public"."note" drop constraint "note_pkey";

alter table "public"."notifications" drop constraint "notifications_pkey";

alter table "public"."opportunities" drop constraint "opportunities_pkey";

alter table "public"."performance_log" drop constraint "performance_log_pkey";

alter table "public"."performance_logs" drop constraint "performance_logs_pkey";

alter table "public"."subscription" drop constraint "subscription_pkey";

alter table "public"."subscription_plan" drop constraint "subscription_plan_pkey";

alter table "public"."system_logs" drop constraint "system_logs_pkey";

alter table "public"."systembranding" drop constraint "systembranding_pkey";

alter table "public"."tenant" drop constraint "tenant_pkey";

alter table "public"."tenant_integration" drop constraint "tenant_integration_pkey";

alter table "public"."tenant_integrations" drop constraint "tenant_integrations_pkey";

alter table "public"."test_report" drop constraint "test_report_pkey";

alter table "public"."user_invitation" drop constraint "user_invitation_pkey";

alter table "public"."users" drop constraint "users_pkey";

alter table "public"."webhook" drop constraint "webhook_pkey";

alter table "public"."workflow" drop constraint "workflow_pkey";

alter table "public"."workflow_execution" drop constraint "workflow_execution_pkey";

drop index if exists "public"."accounts_pkey";

drop index if exists "public"."activities_created_at_idx";

drop index if exists "public"."activities_pkey";

drop index if exists "public"."ai_campaign_pkey";

drop index if exists "public"."announcement_pkey";

drop index if exists "public"."api_key_pkey";

drop index if exists "public"."apikey_pkey";

drop index if exists "public"."archive_index_pkey";

drop index if exists "public"."audit_log_pkey";

drop index if exists "public"."bizdev_source_pkey";

drop index if exists "public"."bizdev_sources_pkey";

drop index if exists "public"."cache_cache_key_key";

drop index if exists "public"."cache_pkey";

drop index if exists "public"."cash_flow_pkey";

drop index if exists "public"."checkpoint_pkey";

drop index if exists "public"."client_requirement_pkey";

drop index if exists "public"."contact_history_pkey";

drop index if exists "public"."contacts_created_at_idx";

drop index if exists "public"."contacts_pkey";

drop index if exists "public"."conversation_messages_pkey";

drop index if exists "public"."conversations_pkey";

drop index if exists "public"."cron_job_pkey";

drop index if exists "public"."daily_sales_metrics_pkey";

drop index if exists "public"."daily_sales_metrics_tenant_id_metric_date_key";

drop index if exists "public"."documentation_pkey";

drop index if exists "public"."email_template_pkey";

drop index if exists "public"."employees_email_idx";

drop index if exists "public"."employees_pkey";

drop index if exists "public"."field_customization_pkey";

drop index if exists "public"."field_customization_tenant_id_entity_type_field_name_key";

drop index if exists "public"."file_pkey";

drop index if exists "public"."guide_content_pkey";

drop index if exists "public"."idx_accounts_revenue";

drop index if exists "public"."idx_accounts_tenant";

drop index if exists "public"."idx_accounts_type";

drop index if exists "public"."idx_activities_assigned_to";

drop index if exists "public"."idx_activities_created_by";

drop index if exists "public"."idx_activities_created_date";

drop index if exists "public"."idx_activities_due_date";

drop index if exists "public"."idx_activities_priority";

drop index if exists "public"."idx_activities_tenant";

drop index if exists "public"."idx_activities_updated_date";

drop index if exists "public"."idx_ai_campaign_tenant";

drop index if exists "public"."idx_announcement_active";

drop index if exists "public"."idx_api_key_tenant";

drop index if exists "public"."idx_apikey_tenant";

drop index if exists "public"."idx_archive_index_tenant";

drop index if exists "public"."idx_audit_log_tenant";

drop index if exists "public"."idx_audit_log_user";

drop index if exists "public"."idx_bizdev_source_tenant";

drop index if exists "public"."idx_bizdev_sources_priority";

drop index if exists "public"."idx_bizdev_sources_status";

drop index if exists "public"."idx_bizdev_sources_tenant";

drop index if exists "public"."idx_bizdev_sources_type";

drop index if exists "public"."idx_cache_expires";

drop index if exists "public"."idx_cash_flow_account_id";

drop index if exists "public"."idx_cash_flow_date";

drop index if exists "public"."idx_cash_flow_tenant";

drop index if exists "public"."idx_checkpoint_tenant";

drop index if exists "public"."idx_client_requirement_tenant";

drop index if exists "public"."idx_contact_history_contact";

drop index if exists "public"."idx_contacts_account_id";

drop index if exists "public"."idx_contacts_status";

drop index if exists "public"."idx_contacts_tenant";

drop index if exists "public"."idx_conversations_agent_name";

drop index if exists "public"."idx_conversations_created_date";

drop index if exists "public"."idx_conversations_status";

drop index if exists "public"."idx_conversations_tenant_id";

drop index if exists "public"."idx_cron_job_active";

drop index if exists "public"."idx_daily_sales_metrics_tenant";

drop index if exists "public"."idx_email_template_tenant";

drop index if exists "public"."idx_employees_tenant";

drop index if exists "public"."idx_field_customization_tenant";

drop index if exists "public"."idx_file_related";

drop index if exists "public"."idx_file_tenant";

drop index if exists "public"."idx_import_log_tenant";

drop index if exists "public"."idx_lead_history_lead";

drop index if exists "public"."idx_leads_job_title";

drop index if exists "public"."idx_leads_status";

drop index if exists "public"."idx_leads_tenant";

drop index if exists "public"."idx_messages_conversation_id";

drop index if exists "public"."idx_messages_created_date";

drop index if exists "public"."idx_modulesettings_tenant";

drop index if exists "public"."idx_note_related";

drop index if exists "public"."idx_note_tenant";

drop index if exists "public"."idx_notifications_tenant";

drop index if exists "public"."idx_notifications_user";

drop index if exists "public"."idx_opportunities_account_id";

drop index if exists "public"."idx_opportunities_contact_id";

drop index if exists "public"."idx_opportunities_tenant";

drop index if exists "public"."idx_perflogs_tenant_id";

drop index if exists "public"."idx_performance_log_tenant";

drop index if exists "public"."idx_performance_logs_created_at";

drop index if exists "public"."idx_performance_logs_duration";

drop index if exists "public"."idx_performance_logs_endpoint";

drop index if exists "public"."idx_performance_logs_status";

drop index if exists "public"."idx_performance_logs_tenant";

drop index if exists "public"."idx_performance_logs_tenant_created";

drop index if exists "public"."idx_subscription_plan_id";

drop index if exists "public"."idx_system_logs_level";

drop index if exists "public"."idx_system_logs_tenant";

drop index if exists "public"."idx_system_logs_user";

drop index if exists "public"."idx_systembranding_tenant";

drop index if exists "public"."idx_tenant_integration_tenant";

drop index if exists "public"."idx_tenant_integrations_active";

drop index if exists "public"."idx_tenant_integrations_tenant";

drop index if exists "public"."idx_tenant_integrations_type";

drop index if exists "public"."idx_tenant_status";

drop index if exists "public"."idx_tenant_tenant_id";

drop index if exists "public"."idx_test_report_tenant";

drop index if exists "public"."idx_user_invitation_tenant";

drop index if exists "public"."idx_user_invitation_token";

drop index if exists "public"."idx_users_role";

drop index if exists "public"."idx_users_tenant_id";

drop index if exists "public"."idx_webhook_tenant";

drop index if exists "public"."idx_workflow_execution_tenant";

drop index if exists "public"."idx_workflow_execution_workflow";

drop index if exists "public"."idx_workflow_tenant";

drop index if exists "public"."import_log_pkey";

drop index if exists "public"."lead_history_pkey";

drop index if exists "public"."leads_created_at_idx";

drop index if exists "public"."leads_created_at_idx1";

drop index if exists "public"."leads_pkey";

drop index if exists "public"."modulesettings_pkey";

drop index if exists "public"."modulesettings_tenant_id_module_name_key";

drop index if exists "public"."note_pkey";

drop index if exists "public"."notifications_pkey";

drop index if exists "public"."opportunities_created_date_idx";

drop index if exists "public"."opportunities_pkey";

drop index if exists "public"."performance_log_pkey";

drop index if exists "public"."performance_logs_pkey";

drop index if exists "public"."subscription_pkey";

drop index if exists "public"."subscription_plan_pkey";

drop index if exists "public"."system_logs_pkey";

drop index if exists "public"."systembranding_pkey";

drop index if exists "public"."tenant_integration_pkey";

drop index if exists "public"."tenant_integration_tenant_id_integration_type_key";

drop index if exists "public"."tenant_integrations_pkey";

drop index if exists "public"."tenant_pkey";

drop index if exists "public"."tenant_tenant_id_key";

drop index if exists "public"."test_report_pkey";

drop index if exists "public"."user_invitation_pkey";

drop index if exists "public"."user_invitation_token_key";

drop index if exists "public"."users_email_key";

drop index if exists "public"."users_pkey";

drop index if exists "public"."webhook_pkey";

drop index if exists "public"."workflow_execution_pkey";

drop index if exists "public"."workflow_pkey";

drop table "public"."accounts";

drop table "public"."activities";

-- DEPRECATED: ai_campaign is legacy and consolidated into ai_campaigns by migration 035
-- drop table "public"."ai_campaign";

drop table "public"."announcement";

drop table "public"."api_key";

drop table "public"."apikey";

drop table "public"."archive_index";

drop table "public"."audit_log";

drop table "public"."bizdev_source";

drop table "public"."bizdev_sources";

drop table "public"."cache";

drop table "public"."cash_flow";

drop table "public"."checkpoint";

drop table "public"."client_requirement";

drop table "public"."contact_history";

drop table "public"."contacts";

drop table "public"."conversation_messages";

drop table "public"."conversations";

drop table "public"."cron_job";

drop table "public"."daily_sales_metrics";

drop table "public"."documentation";

drop table "public"."email_template";

drop table "public"."employees";

drop table "public"."field_customization";

drop table "public"."file";

drop table "public"."guide_content";

drop table "public"."import_log";

drop table "public"."lead_history";

drop table "public"."leads";

drop table "public"."modulesettings";

drop table "public"."note";

drop table "public"."notifications";

drop table "public"."opportunities";

drop table "public"."performance_log";

drop table "public"."performance_logs";

drop table "public"."subscription";

drop table "public"."subscription_plan";

drop table "public"."system_logs";

drop table "public"."systembranding";

drop table "public"."tenant";

drop table "public"."tenant_integration";

drop table "public"."tenant_integrations";

drop table "public"."test_report";

drop table "public"."user_invitation";

drop table "public"."users";

drop table "public"."webhook";

drop table "public"."workflow";

drop table "public"."workflow_execution";

drop type "public"."activity_priority";


