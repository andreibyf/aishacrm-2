


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."activity_priority" AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE "public"."activity_priority" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_tenant_id"() IS 'Returns the current tenant_id from session variable';



CREATE OR REPLACE FUNCTION "public"."sync_bizdev_sources_created_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_date IS NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_bizdev_sources_created_date"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_bizdev_sources_created_date"() IS 'Trigger function to sync created_date from created_at';



CREATE OR REPLACE FUNCTION "public"."sync_created_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_date IS NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_created_date"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_created_date"() IS 'Generic trigger function to sync created_date from created_at';



CREATE OR REPLACE FUNCTION "public"."update_employees_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_employees_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_tenant_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_tenant_updated_at"() IS 'Trigger function to auto-update updated_at timestamp';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "industry" "text",
    "website" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "annual_revenue" numeric(15,2)
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "subject" "text",
    "body" "text",
    "related_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "created_by" "text",
    "location" "text",
    "priority" "public"."activity_priority" DEFAULT 'normal'::"public"."activity_priority" NOT NULL,
    "due_date" "date",
    "due_time" time without time zone,
    "assigned_to" "text",
    "related_to" "text",
    "updated_date" timestamp with time zone
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."activities"."priority" IS 'Activity priority level: low, normal, high, or urgent';



COMMENT ON COLUMN "public"."activities"."due_time" IS 'Time component of due date in HH:MM:SS format';



CREATE TABLE IF NOT EXISTS "public"."ai_campaign" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'email'::"text",
    "status" "text" DEFAULT 'draft'::"text",
    "target_audience" "jsonb" DEFAULT '{}'::"jsonb",
    "content" "jsonb" DEFAULT '{}'::"jsonb",
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_campaign" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "is_active" boolean DEFAULT true,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "target_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_key" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "scopes" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "last_used" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_key" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apikey" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "key_name" "text" NOT NULL,
    "key_value" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "usage_count" integer DEFAULT 0,
    "last_used" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone DEFAULT "now"(),
    "created_by" "text"
);


ALTER TABLE "public"."apikey" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_index" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "archived_data" "jsonb" NOT NULL,
    "archived_by" "text",
    "archived_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."archive_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "changes" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bizdev_source" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'website'::"text",
    "url" "text",
    "status" "text" DEFAULT 'active'::"text",
    "last_scraped" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bizdev_source" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bizdev_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "source_name" "text" NOT NULL,
    "source_type" "text",
    "source_url" "text",
    "contact_person" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "status" "text" DEFAULT 'active'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "leads_generated" integer DEFAULT 0,
    "opportunities_created" integer DEFAULT 0,
    "revenue_generated" numeric(15,2) DEFAULT 0,
    "notes" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_test_data" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone
);


ALTER TABLE "public"."bizdev_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cache_key" "text" NOT NULL,
    "cache_value" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_flow" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "transaction_date" "date" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "type" "text" NOT NULL,
    "category" "text",
    "description" "text",
    "account_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cash_flow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkpoint" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "checkpoint_data" "jsonb" NOT NULL,
    "version" integer DEFAULT 1,
    "created_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."checkpoint" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_requirement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "due_date" "date",
    "assigned_to" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_requirement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "tenant_id" "text" NOT NULL,
    "field_name" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "account_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" character varying(50) NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_name" character varying(255) DEFAULT 'crm_assistant'::character varying NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "status" character varying(50) DEFAULT 'active'::character varying
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_job" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text",
    "name" "text" NOT NULL,
    "schedule" "text" NOT NULL,
    "function_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "last_run" timestamp with time zone,
    "next_run" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cron_job" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_sales_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "metric_date" "date" NOT NULL,
    "total_revenue" numeric(15,2) DEFAULT 0,
    "new_deals" integer DEFAULT 0,
    "closed_deals" integer DEFAULT 0,
    "pipeline_value" numeric(15,2) DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_sales_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documentation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "is_published" boolean DEFAULT false,
    "author" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documentation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_template" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "type" "text" DEFAULT 'marketing'::"text",
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_template" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "role" "text",
    "status" "text" DEFAULT 'active'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employees"."tenant_id" IS 'Tenant identifier. NULL indicates employee has no assigned client/tenant.';



CREATE TABLE IF NOT EXISTS "public"."field_customization" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "field_name" "text" NOT NULL,
    "label" "text",
    "is_visible" boolean DEFAULT true,
    "is_required" boolean DEFAULT false,
    "options" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."field_customization" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "filepath" "text" NOT NULL,
    "filesize" bigint,
    "mimetype" "text",
    "related_type" "text",
    "related_id" "uuid",
    "uploaded_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."file" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guide_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "order_index" integer DEFAULT 0,
    "is_published" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guide_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "filename" "text",
    "status" "text" DEFAULT 'processing'::"text",
    "total_records" integer DEFAULT 0,
    "success_count" integer DEFAULT 0,
    "error_count" integer DEFAULT 0,
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."import_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "tenant_id" "text" NOT NULL,
    "field_name" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "company" "text",
    "status" "text" DEFAULT 'new'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "source" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone,
    "job_title" "text"
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modulesettings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "module_name" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "is_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."modulesettings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."note" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "title" "text",
    "content" "text",
    "related_type" "text",
    "related_id" "uuid",
    "created_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."note" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "message" "text",
    "is_read" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "stage" "text" DEFAULT 'qualification'::"text",
    "amount" numeric(15,2),
    "probability" integer DEFAULT 0,
    "close_date" "date",
    "account_id" "uuid",
    "contact_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "duration" integer NOT NULL,
    "status" "text" DEFAULT 'success'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."performance_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "method" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "status_code" integer,
    "duration_ms" integer NOT NULL,
    "response_time_ms" integer,
    "db_query_time_ms" integer DEFAULT 0,
    "user_email" "text",
    "ip_address" "text",
    "user_agent" "text",
    "error_message" "text",
    "error_stack" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."performance_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."performance_logs" IS 'API performance metrics and request tracking';



COMMENT ON COLUMN "public"."performance_logs"."duration_ms" IS 'Total request duration in milliseconds';



COMMENT ON COLUMN "public"."performance_logs"."response_time_ms" IS 'Time to first byte in milliseconds';



COMMENT ON COLUMN "public"."performance_logs"."db_query_time_ms" IS 'Database query execution time';



CREATE TABLE IF NOT EXISTS "public"."subscription" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "plan_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "start_date" "date",
    "end_date" "date",
    "stripe_subscription_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plan" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(15,2) NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "features" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_plan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "level" "text" NOT NULL,
    "message" "text" NOT NULL,
    "source" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "stack_trace" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_email" "text",
    "user_agent" "text",
    "url" "text",
    "created_date" timestamp with time zone
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."systembranding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone
);


ALTER TABLE "public"."systembranding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "branding_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "subscription_tier" "text" DEFAULT 'free'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_integration" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "integration_type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "last_sync" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_integration" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "integration_type" "text" NOT NULL,
    "integration_name" "text",
    "is_active" boolean DEFAULT true,
    "api_credentials" "jsonb" DEFAULT '{}'::"jsonb",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_date" timestamp with time zone
);


ALTER TABLE "public"."tenant_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_report" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "test_suite" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "results" "jsonb" DEFAULT '{}'::"jsonb",
    "duration" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."test_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_invitation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text",
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "invited_by" "text",
    "expires_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_invitation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text",
    "first_name" "text",
    "last_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" character varying(50) DEFAULT 'employee'::character varying,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."tenant_id" IS 'NULL for superadmins (global access), specific tenant_id for tenant-scoped admins';



CREATE TABLE IF NOT EXISTS "public"."webhook" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "url" "text" NOT NULL,
    "event_types" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "secret" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_type" "text" NOT NULL,
    "trigger_config" "jsonb" DEFAULT '{}'::"jsonb",
    "actions" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_execution" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "tenant_id" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text",
    "trigger_data" "jsonb" DEFAULT '{}'::"jsonb",
    "execution_log" "jsonb" DEFAULT '[]'::"jsonb",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_execution" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_campaign"
    ADD CONSTRAINT "ai_campaign_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcement"
    ADD CONSTRAINT "announcement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_key"
    ADD CONSTRAINT "api_key_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apikey"
    ADD CONSTRAINT "apikey_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archive_index"
    ADD CONSTRAINT "archive_index_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bizdev_source"
    ADD CONSTRAINT "bizdev_source_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bizdev_sources"
    ADD CONSTRAINT "bizdev_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cache"
    ADD CONSTRAINT "cache_cache_key_key" UNIQUE ("cache_key");



ALTER TABLE ONLY "public"."cache"
    ADD CONSTRAINT "cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_flow"
    ADD CONSTRAINT "cash_flow_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkpoint"
    ADD CONSTRAINT "checkpoint_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_requirement"
    ADD CONSTRAINT "client_requirement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_history"
    ADD CONSTRAINT "contact_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_job"
    ADD CONSTRAINT "cron_job_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_sales_metrics"
    ADD CONSTRAINT "daily_sales_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_sales_metrics"
    ADD CONSTRAINT "daily_sales_metrics_tenant_id_metric_date_key" UNIQUE ("tenant_id", "metric_date");



ALTER TABLE ONLY "public"."documentation"
    ADD CONSTRAINT "documentation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_template"
    ADD CONSTRAINT "email_template_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_customization"
    ADD CONSTRAINT "field_customization_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_customization"
    ADD CONSTRAINT "field_customization_tenant_id_entity_type_field_name_key" UNIQUE ("tenant_id", "entity_type", "field_name");



ALTER TABLE ONLY "public"."file"
    ADD CONSTRAINT "file_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guide_content"
    ADD CONSTRAINT "guide_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_log"
    ADD CONSTRAINT "import_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_history"
    ADD CONSTRAINT "lead_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modulesettings"
    ADD CONSTRAINT "modulesettings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modulesettings"
    ADD CONSTRAINT "modulesettings_tenant_id_module_name_key" UNIQUE ("tenant_id", "module_name");



ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_log"
    ADD CONSTRAINT "performance_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_logs"
    ADD CONSTRAINT "performance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plan"
    ADD CONSTRAINT "subscription_plan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."systembranding"
    ADD CONSTRAINT "systembranding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_integration"
    ADD CONSTRAINT "tenant_integration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_integration"
    ADD CONSTRAINT "tenant_integration_tenant_id_integration_type_key" UNIQUE ("tenant_id", "integration_type");



ALTER TABLE ONLY "public"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant"
    ADD CONSTRAINT "tenant_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant"
    ADD CONSTRAINT "tenant_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."test_report"
    ADD CONSTRAINT "test_report_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitation"
    ADD CONSTRAINT "user_invitation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invitation"
    ADD CONSTRAINT "user_invitation_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_execution"
    ADD CONSTRAINT "workflow_execution_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow"
    ADD CONSTRAINT "workflow_pkey" PRIMARY KEY ("id");



CREATE INDEX "activities_created_at_idx" ON "public"."activities" USING "btree" ("created_at");



CREATE INDEX "contacts_created_at_idx" ON "public"."contacts" USING "btree" ("created_at");



CREATE INDEX "employees_email_idx" ON "public"."employees" USING "btree" ("email");



CREATE INDEX "idx_accounts_revenue" ON "public"."accounts" USING "btree" ("annual_revenue" DESC) WHERE ("annual_revenue" IS NOT NULL);



CREATE INDEX "idx_accounts_tenant" ON "public"."accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_accounts_type" ON "public"."accounts" USING "btree" ("tenant_id", "type");



CREATE INDEX "idx_activities_assigned_to" ON "public"."activities" USING "btree" ("tenant_id", "assigned_to");



CREATE INDEX "idx_activities_created_by" ON "public"."activities" USING "btree" ("tenant_id", "created_by");



CREATE INDEX "idx_activities_created_date" ON "public"."activities" USING "btree" ("tenant_id", "created_date" DESC);



CREATE INDEX "idx_activities_due_date" ON "public"."activities" USING "btree" ("tenant_id", "due_date") WHERE ("due_date" IS NOT NULL);



CREATE INDEX "idx_activities_priority" ON "public"."activities" USING "btree" ("tenant_id", "priority") WHERE ("priority" = ANY (ARRAY['high'::"public"."activity_priority", 'urgent'::"public"."activity_priority"]));



CREATE INDEX "idx_activities_tenant" ON "public"."activities" USING "btree" ("tenant_id");



CREATE INDEX "idx_activities_updated_date" ON "public"."activities" USING "btree" ("tenant_id", "updated_date" DESC);



CREATE INDEX "idx_ai_campaign_tenant" ON "public"."ai_campaign" USING "btree" ("tenant_id");



CREATE INDEX "idx_announcement_active" ON "public"."announcement" USING "btree" ("is_active", "start_date", "end_date");



CREATE INDEX "idx_api_key_tenant" ON "public"."api_key" USING "btree" ("tenant_id");



CREATE INDEX "idx_apikey_tenant" ON "public"."apikey" USING "btree" ("tenant_id");



CREATE INDEX "idx_archive_index_tenant" ON "public"."archive_index" USING "btree" ("tenant_id", "entity_type");



CREATE INDEX "idx_audit_log_tenant" ON "public"."audit_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("tenant_id", "user_email");



CREATE INDEX "idx_bizdev_source_tenant" ON "public"."bizdev_source" USING "btree" ("tenant_id");



CREATE INDEX "idx_bizdev_sources_priority" ON "public"."bizdev_sources" USING "btree" ("priority");



CREATE INDEX "idx_bizdev_sources_status" ON "public"."bizdev_sources" USING "btree" ("status");



CREATE INDEX "idx_bizdev_sources_tenant" ON "public"."bizdev_sources" USING "btree" ("tenant_id");



CREATE INDEX "idx_bizdev_sources_type" ON "public"."bizdev_sources" USING "btree" ("source_type");



CREATE INDEX "idx_cache_expires" ON "public"."cache" USING "btree" ("expires_at");



CREATE INDEX "idx_cash_flow_account_id" ON "public"."cash_flow" USING "btree" ("account_id");



COMMENT ON INDEX "public"."idx_cash_flow_account_id" IS 'Performance index for cash_flow.account_id foreign key (joins with accounts table)';



CREATE INDEX "idx_cash_flow_date" ON "public"."cash_flow" USING "btree" ("tenant_id", "transaction_date");



CREATE INDEX "idx_cash_flow_tenant" ON "public"."cash_flow" USING "btree" ("tenant_id");



CREATE INDEX "idx_checkpoint_tenant" ON "public"."checkpoint" USING "btree" ("tenant_id", "entity_type", "entity_id");



CREATE INDEX "idx_client_requirement_tenant" ON "public"."client_requirement" USING "btree" ("tenant_id");



CREATE INDEX "idx_contact_history_contact" ON "public"."contact_history" USING "btree" ("contact_id");



CREATE INDEX "idx_contacts_account_id" ON "public"."contacts" USING "btree" ("account_id");



COMMENT ON INDEX "public"."idx_contacts_account_id" IS 'Performance index for contacts.account_id foreign key (joins with accounts table)';



CREATE INDEX "idx_contacts_status" ON "public"."contacts" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_contacts_tenant" ON "public"."contacts" USING "btree" ("tenant_id");



CREATE INDEX "idx_conversations_agent_name" ON "public"."conversations" USING "btree" ("agent_name");



CREATE INDEX "idx_conversations_created_date" ON "public"."conversations" USING "btree" ("created_date" DESC);



CREATE INDEX "idx_conversations_status" ON "public"."conversations" USING "btree" ("status");



CREATE INDEX "idx_conversations_tenant_id" ON "public"."conversations" USING "btree" ("tenant_id");



CREATE INDEX "idx_cron_job_active" ON "public"."cron_job" USING "btree" ("is_active", "next_run");



CREATE INDEX "idx_daily_sales_metrics_tenant" ON "public"."daily_sales_metrics" USING "btree" ("tenant_id", "metric_date");



CREATE INDEX "idx_email_template_tenant" ON "public"."email_template" USING "btree" ("tenant_id");



CREATE INDEX "idx_employees_tenant" ON "public"."employees" USING "btree" ("tenant_id");



CREATE INDEX "idx_field_customization_tenant" ON "public"."field_customization" USING "btree" ("tenant_id", "entity_type");



CREATE INDEX "idx_file_related" ON "public"."file" USING "btree" ("tenant_id", "related_type", "related_id");



CREATE INDEX "idx_file_tenant" ON "public"."file" USING "btree" ("tenant_id");



CREATE INDEX "idx_import_log_tenant" ON "public"."import_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_lead_history_lead" ON "public"."lead_history" USING "btree" ("lead_id");



CREATE INDEX "idx_leads_job_title" ON "public"."leads" USING "btree" ("tenant_id", "job_title");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_leads_tenant" ON "public"."leads" USING "btree" ("tenant_id");



CREATE INDEX "idx_messages_conversation_id" ON "public"."conversation_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_created_date" ON "public"."conversation_messages" USING "btree" ("created_date");



CREATE INDEX "idx_modulesettings_tenant" ON "public"."modulesettings" USING "btree" ("tenant_id");



CREATE INDEX "idx_note_related" ON "public"."note" USING "btree" ("tenant_id", "related_type", "related_id");



CREATE INDEX "idx_note_tenant" ON "public"."note" USING "btree" ("tenant_id");



CREATE INDEX "idx_notifications_tenant" ON "public"."notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("tenant_id", "user_email");



CREATE INDEX "idx_opportunities_account_id" ON "public"."opportunities" USING "btree" ("account_id");



COMMENT ON INDEX "public"."idx_opportunities_account_id" IS 'Performance index for opportunities.account_id foreign key (joins with accounts table)';



CREATE INDEX "idx_opportunities_contact_id" ON "public"."opportunities" USING "btree" ("contact_id");



COMMENT ON INDEX "public"."idx_opportunities_contact_id" IS 'Performance index for opportunities.contact_id foreign key (joins with contacts table)';



CREATE INDEX "idx_opportunities_tenant" ON "public"."opportunities" USING "btree" ("tenant_id");



CREATE INDEX "idx_perflogs_tenant_id" ON "public"."performance_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_performance_log_tenant" ON "public"."performance_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_performance_logs_created_at" ON "public"."performance_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_performance_logs_duration" ON "public"."performance_logs" USING "btree" ("duration_ms");



CREATE INDEX "idx_performance_logs_endpoint" ON "public"."performance_logs" USING "btree" ("endpoint");



CREATE INDEX "idx_performance_logs_status" ON "public"."performance_logs" USING "btree" ("status_code");



CREATE INDEX "idx_performance_logs_tenant" ON "public"."performance_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_performance_logs_tenant_created" ON "public"."performance_logs" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_subscription_plan_id" ON "public"."subscription" USING "btree" ("plan_id");



COMMENT ON INDEX "public"."idx_subscription_plan_id" IS 'Performance index for subscription.plan_id foreign key (joins with subscription_plan table)';



CREATE INDEX "idx_system_logs_level" ON "public"."system_logs" USING "btree" ("tenant_id", "level");



CREATE INDEX "idx_system_logs_tenant" ON "public"."system_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_logs_user" ON "public"."system_logs" USING "btree" ("tenant_id", "user_email");



CREATE INDEX "idx_systembranding_tenant" ON "public"."systembranding" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_integration_tenant" ON "public"."tenant_integration" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_integrations_active" ON "public"."tenant_integrations" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_tenant_integrations_tenant" ON "public"."tenant_integrations" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_integrations_type" ON "public"."tenant_integrations" USING "btree" ("tenant_id", "integration_type");



CREATE INDEX "idx_tenant_status" ON "public"."tenant" USING "btree" ("status");



CREATE INDEX "idx_tenant_tenant_id" ON "public"."tenant" USING "btree" ("tenant_id");



CREATE INDEX "idx_test_report_tenant" ON "public"."test_report" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_invitation_tenant" ON "public"."user_invitation" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_invitation_token" ON "public"."user_invitation" USING "btree" ("token");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_users_tenant_id" ON "public"."users" USING "btree" ("tenant_id");



CREATE INDEX "idx_webhook_tenant" ON "public"."webhook" USING "btree" ("tenant_id");



CREATE INDEX "idx_workflow_execution_tenant" ON "public"."workflow_execution" USING "btree" ("tenant_id");



CREATE INDEX "idx_workflow_execution_workflow" ON "public"."workflow_execution" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_tenant" ON "public"."workflow" USING "btree" ("tenant_id");



CREATE INDEX "leads_created_at_idx" ON "public"."leads" USING "btree" ("created_at");



CREATE INDEX "leads_created_at_idx1" ON "public"."leads" USING "btree" ("created_at");



CREATE INDEX "opportunities_created_date_idx" ON "public"."opportunities" USING "btree" ("created_date");



CREATE OR REPLACE TRIGGER "employees_updated_at_trigger" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."update_employees_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_updated_at_trigger" BEFORE UPDATE ON "public"."tenant" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenant_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_sync_bizdev_sources_created_date" BEFORE INSERT OR UPDATE ON "public"."bizdev_sources" FOR EACH ROW EXECUTE FUNCTION "public"."sync_bizdev_sources_created_date"();



ALTER TABLE ONLY "public"."cash_flow"
    ADD CONSTRAINT "cash_flow_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."contact_history"
    ADD CONSTRAINT "contact_history_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "fk_conversations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_history"
    ADD CONSTRAINT "lead_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plan"("id");



ALTER TABLE ONLY "public"."workflow_execution"
    ADD CONSTRAINT "workflow_execution_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE CASCADE;



CREATE POLICY "Backend service has full access to accounts" ON "public"."accounts" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to activities" ON "public"."activities" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to apikey" ON "public"."apikey" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to contacts" ON "public"."contacts" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to employees" ON "public"."employees" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to leads" ON "public"."leads" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to modulesettings" ON "public"."modulesettings" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to notifications" ON "public"."notifications" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to opportunities" ON "public"."opportunities" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to system_logs" ON "public"."system_logs" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Backend service has full access to users" ON "public"."users" TO "authenticated", "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to accounts" ON "public"."accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to activities" ON "public"."activities" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to ai_campaign" ON "public"."ai_campaign" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to announcement" ON "public"."announcement" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to api_key" ON "public"."api_key" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to apikey" ON "public"."apikey" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to archive_index" ON "public"."archive_index" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to audit_log" ON "public"."audit_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to bizdev_source" ON "public"."bizdev_source" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to bizdev_sources" ON "public"."bizdev_sources" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to cache" ON "public"."cache" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to cash_flow" ON "public"."cash_flow" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to checkpoint" ON "public"."checkpoint" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to client_requirement" ON "public"."client_requirement" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to contact_history" ON "public"."contact_history" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to contacts" ON "public"."contacts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to cron_job" ON "public"."cron_job" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to daily_sales_metrics" ON "public"."daily_sales_metrics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to documentation" ON "public"."documentation" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to email_template" ON "public"."email_template" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to employees" ON "public"."employees" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to field_customization" ON "public"."field_customization" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to file" ON "public"."file" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to guide_content" ON "public"."guide_content" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to import_log" ON "public"."import_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to lead_history" ON "public"."lead_history" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to leads" ON "public"."leads" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to modulesettings" ON "public"."modulesettings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to note" ON "public"."note" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to notifications" ON "public"."notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to opportunities" ON "public"."opportunities" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to performance_log" ON "public"."performance_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to subscription" ON "public"."subscription" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to subscription_plan" ON "public"."subscription_plan" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to system_logs" ON "public"."system_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to tenant" ON "public"."tenant" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to tenant_integration" ON "public"."tenant_integration" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to tenant_integrations" ON "public"."tenant_integrations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to test_report" ON "public"."test_report" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to user_invitation" ON "public"."user_invitation" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to users" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to webhook" ON "public"."webhook" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to workflow" ON "public"."workflow" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to workflow_execution" ON "public"."workflow_execution" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_campaign" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_key" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apikey" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archive_index" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_insert_only" ON "public"."performance_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."bizdev_source" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bizdev_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_flow" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkpoint" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_requirement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_tenant_isolation" ON "public"."conversations" USING ((("tenant_id")::"text" = "current_setting"('app.current_tenant_id'::"text", true)));



ALTER TABLE "public"."cron_job" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_sales_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documentation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_template" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_customization" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."file" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guide_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_tenant_isolation" ON "public"."conversation_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "conversation_messages"."conversation_id") AND (("conversations"."tenant_id")::"text" = "current_setting"('app.current_tenant_id'::"text", true))))));



ALTER TABLE "public"."modulesettings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."note" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_only_modulesettings" ON "public"."modulesettings" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "service_role_only_tenants" ON "public"."tenant" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."subscription" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."systembranding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_integration" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_isolation_accounts" ON "public"."accounts" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_activities" ON "public"."activities" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_bizdev_source" ON "public"."bizdev_source" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_cash_flow" ON "public"."cash_flow" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_client_requirement" ON "public"."client_requirement" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_contacts" ON "public"."contacts" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_leads" ON "public"."leads" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_note" ON "public"."note" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_notifications" ON "public"."notifications" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_opportunities" ON "public"."opportunities" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_workflow" ON "public"."workflow" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



CREATE POLICY "tenant_isolation_workflow_execution" ON "public"."workflow_execution" TO "authenticated" USING (("tenant_id" = "current_setting"('app.current_tenant_id'::"text", true)));



ALTER TABLE "public"."test_report" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_invitation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_execution" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."accounts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."activities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."apikey";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contacts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."employees";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."leads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."modulesettings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."opportunities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."system_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_bizdev_sources_created_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_bizdev_sources_created_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_bizdev_sources_created_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_created_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_created_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_created_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_employees_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_employees_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_employees_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_updated_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."ai_campaign" TO "anon";
GRANT ALL ON TABLE "public"."ai_campaign" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_campaign" TO "service_role";



GRANT ALL ON TABLE "public"."announcement" TO "anon";
GRANT ALL ON TABLE "public"."announcement" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement" TO "service_role";



GRANT ALL ON TABLE "public"."api_key" TO "service_role";



GRANT ALL ON TABLE "public"."apikey" TO "service_role";



GRANT ALL ON TABLE "public"."archive_index" TO "anon";
GRANT ALL ON TABLE "public"."archive_index" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_index" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."bizdev_source" TO "anon";
GRANT ALL ON TABLE "public"."bizdev_source" TO "authenticated";
GRANT ALL ON TABLE "public"."bizdev_source" TO "service_role";



GRANT ALL ON TABLE "public"."bizdev_sources" TO "anon";
GRANT ALL ON TABLE "public"."bizdev_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."bizdev_sources" TO "service_role";



GRANT ALL ON TABLE "public"."cache" TO "service_role";



GRANT ALL ON TABLE "public"."cash_flow" TO "anon";
GRANT ALL ON TABLE "public"."cash_flow" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_flow" TO "service_role";



GRANT ALL ON TABLE "public"."checkpoint" TO "anon";
GRANT ALL ON TABLE "public"."checkpoint" TO "authenticated";
GRANT ALL ON TABLE "public"."checkpoint" TO "service_role";



GRANT ALL ON TABLE "public"."client_requirement" TO "anon";
GRANT ALL ON TABLE "public"."client_requirement" TO "authenticated";
GRANT ALL ON TABLE "public"."client_requirement" TO "service_role";



GRANT ALL ON TABLE "public"."contact_history" TO "anon";
GRANT ALL ON TABLE "public"."contact_history" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_history" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."cron_job" TO "service_role";



GRANT ALL ON TABLE "public"."daily_sales_metrics" TO "anon";
GRANT ALL ON TABLE "public"."daily_sales_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_sales_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."documentation" TO "anon";
GRANT ALL ON TABLE "public"."documentation" TO "authenticated";
GRANT ALL ON TABLE "public"."documentation" TO "service_role";



GRANT ALL ON TABLE "public"."email_template" TO "anon";
GRANT ALL ON TABLE "public"."email_template" TO "authenticated";
GRANT ALL ON TABLE "public"."email_template" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."field_customization" TO "anon";
GRANT ALL ON TABLE "public"."field_customization" TO "authenticated";
GRANT ALL ON TABLE "public"."field_customization" TO "service_role";



GRANT ALL ON TABLE "public"."file" TO "anon";
GRANT ALL ON TABLE "public"."file" TO "authenticated";
GRANT ALL ON TABLE "public"."file" TO "service_role";



GRANT ALL ON TABLE "public"."guide_content" TO "anon";
GRANT ALL ON TABLE "public"."guide_content" TO "authenticated";
GRANT ALL ON TABLE "public"."guide_content" TO "service_role";



GRANT ALL ON TABLE "public"."import_log" TO "anon";
GRANT ALL ON TABLE "public"."import_log" TO "authenticated";
GRANT ALL ON TABLE "public"."import_log" TO "service_role";



GRANT ALL ON TABLE "public"."lead_history" TO "anon";
GRANT ALL ON TABLE "public"."lead_history" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_history" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."modulesettings" TO "anon";
GRANT ALL ON TABLE "public"."modulesettings" TO "authenticated";
GRANT ALL ON TABLE "public"."modulesettings" TO "service_role";



GRANT ALL ON TABLE "public"."note" TO "anon";
GRANT ALL ON TABLE "public"."note" TO "authenticated";
GRANT ALL ON TABLE "public"."note" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."performance_log" TO "service_role";



GRANT ALL ON TABLE "public"."performance_logs" TO "service_role";
GRANT INSERT ON TABLE "public"."performance_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."subscription" TO "anon";
GRANT ALL ON TABLE "public"."subscription" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plan" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plan" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "service_role";
GRANT INSERT ON TABLE "public"."system_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."systembranding" TO "anon";
GRANT ALL ON TABLE "public"."systembranding" TO "authenticated";
GRANT ALL ON TABLE "public"."systembranding" TO "service_role";



GRANT ALL ON TABLE "public"."tenant" TO "anon";
GRANT ALL ON TABLE "public"."tenant" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_integration" TO "anon";
GRANT ALL ON TABLE "public"."tenant_integration" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_integration" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_integrations" TO "anon";
GRANT ALL ON TABLE "public"."tenant_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."test_report" TO "anon";
GRANT ALL ON TABLE "public"."test_report" TO "authenticated";
GRANT ALL ON TABLE "public"."test_report" TO "service_role";



GRANT ALL ON TABLE "public"."user_invitation" TO "anon";
GRANT ALL ON TABLE "public"."user_invitation" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invitation" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."webhook" TO "anon";
GRANT ALL ON TABLE "public"."webhook" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook" TO "service_role";



GRANT ALL ON TABLE "public"."workflow" TO "anon";
GRANT ALL ON TABLE "public"."workflow" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_execution" TO "anon";
GRANT ALL ON TABLE "public"."workflow_execution" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_execution" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

revoke delete on table "public"."api_key" from "anon";

revoke insert on table "public"."api_key" from "anon";

revoke references on table "public"."api_key" from "anon";

revoke select on table "public"."api_key" from "anon";

revoke trigger on table "public"."api_key" from "anon";

revoke truncate on table "public"."api_key" from "anon";

revoke update on table "public"."api_key" from "anon";

revoke delete on table "public"."api_key" from "authenticated";

revoke insert on table "public"."api_key" from "authenticated";

revoke references on table "public"."api_key" from "authenticated";

revoke select on table "public"."api_key" from "authenticated";

revoke trigger on table "public"."api_key" from "authenticated";

revoke truncate on table "public"."api_key" from "authenticated";

revoke update on table "public"."api_key" from "authenticated";

revoke delete on table "public"."apikey" from "anon";

revoke insert on table "public"."apikey" from "anon";

revoke references on table "public"."apikey" from "anon";

revoke select on table "public"."apikey" from "anon";

revoke trigger on table "public"."apikey" from "anon";

revoke truncate on table "public"."apikey" from "anon";

revoke update on table "public"."apikey" from "anon";

revoke delete on table "public"."apikey" from "authenticated";

revoke insert on table "public"."apikey" from "authenticated";

revoke references on table "public"."apikey" from "authenticated";

revoke select on table "public"."apikey" from "authenticated";

revoke trigger on table "public"."apikey" from "authenticated";

revoke truncate on table "public"."apikey" from "authenticated";

revoke update on table "public"."apikey" from "authenticated";

revoke delete on table "public"."audit_log" from "anon";

revoke insert on table "public"."audit_log" from "anon";

revoke references on table "public"."audit_log" from "anon";

revoke select on table "public"."audit_log" from "anon";

revoke trigger on table "public"."audit_log" from "anon";

revoke truncate on table "public"."audit_log" from "anon";

revoke update on table "public"."audit_log" from "anon";

revoke delete on table "public"."audit_log" from "authenticated";

revoke insert on table "public"."audit_log" from "authenticated";

revoke references on table "public"."audit_log" from "authenticated";

revoke select on table "public"."audit_log" from "authenticated";

revoke trigger on table "public"."audit_log" from "authenticated";

revoke truncate on table "public"."audit_log" from "authenticated";

revoke update on table "public"."audit_log" from "authenticated";

revoke delete on table "public"."cache" from "anon";

revoke insert on table "public"."cache" from "anon";

revoke references on table "public"."cache" from "anon";

revoke select on table "public"."cache" from "anon";

revoke trigger on table "public"."cache" from "anon";

revoke truncate on table "public"."cache" from "anon";

revoke update on table "public"."cache" from "anon";

revoke delete on table "public"."cache" from "authenticated";

revoke insert on table "public"."cache" from "authenticated";

revoke references on table "public"."cache" from "authenticated";

revoke select on table "public"."cache" from "authenticated";

revoke trigger on table "public"."cache" from "authenticated";

revoke truncate on table "public"."cache" from "authenticated";

revoke update on table "public"."cache" from "authenticated";

revoke delete on table "public"."cron_job" from "anon";

revoke insert on table "public"."cron_job" from "anon";

revoke references on table "public"."cron_job" from "anon";

revoke select on table "public"."cron_job" from "anon";

revoke trigger on table "public"."cron_job" from "anon";

revoke truncate on table "public"."cron_job" from "anon";

revoke update on table "public"."cron_job" from "anon";

revoke delete on table "public"."cron_job" from "authenticated";

revoke insert on table "public"."cron_job" from "authenticated";

revoke references on table "public"."cron_job" from "authenticated";

revoke select on table "public"."cron_job" from "authenticated";

revoke trigger on table "public"."cron_job" from "authenticated";

revoke truncate on table "public"."cron_job" from "authenticated";

revoke update on table "public"."cron_job" from "authenticated";

revoke delete on table "public"."performance_log" from "anon";

revoke insert on table "public"."performance_log" from "anon";

revoke references on table "public"."performance_log" from "anon";

revoke select on table "public"."performance_log" from "anon";

revoke trigger on table "public"."performance_log" from "anon";

revoke truncate on table "public"."performance_log" from "anon";

revoke update on table "public"."performance_log" from "anon";

revoke delete on table "public"."performance_log" from "authenticated";

revoke insert on table "public"."performance_log" from "authenticated";

revoke references on table "public"."performance_log" from "authenticated";

revoke select on table "public"."performance_log" from "authenticated";

revoke trigger on table "public"."performance_log" from "authenticated";

revoke truncate on table "public"."performance_log" from "authenticated";

revoke update on table "public"."performance_log" from "authenticated";

revoke delete on table "public"."performance_logs" from "anon";

revoke insert on table "public"."performance_logs" from "anon";

revoke references on table "public"."performance_logs" from "anon";

revoke select on table "public"."performance_logs" from "anon";

revoke trigger on table "public"."performance_logs" from "anon";

revoke truncate on table "public"."performance_logs" from "anon";

revoke update on table "public"."performance_logs" from "anon";

revoke delete on table "public"."performance_logs" from "authenticated";

revoke references on table "public"."performance_logs" from "authenticated";

revoke select on table "public"."performance_logs" from "authenticated";

revoke trigger on table "public"."performance_logs" from "authenticated";

revoke truncate on table "public"."performance_logs" from "authenticated";

revoke update on table "public"."performance_logs" from "authenticated";

revoke delete on table "public"."system_logs" from "anon";

revoke insert on table "public"."system_logs" from "anon";

revoke references on table "public"."system_logs" from "anon";

revoke select on table "public"."system_logs" from "anon";

revoke trigger on table "public"."system_logs" from "anon";

revoke truncate on table "public"."system_logs" from "anon";

revoke update on table "public"."system_logs" from "anon";

revoke delete on table "public"."system_logs" from "authenticated";

revoke references on table "public"."system_logs" from "authenticated";

revoke select on table "public"."system_logs" from "authenticated";

revoke trigger on table "public"."system_logs" from "authenticated";

revoke truncate on table "public"."system_logs" from "authenticated";

revoke update on table "public"."system_logs" from "authenticated";


