/**
 * CronJob Entity Schema
 */

export const CronJobSchema = {
  name: "CronJob",
  fields: {
    id: { type: "string", required: true, unique: true },
    name: { type: "string", required: true, unique: true },
    function_name: { type: "string", required: true },
    schedule: { type: "string", required: true }, // cron expression
    enabled: { type: "boolean", default: true },
    last_run_at: { type: "datetime" },
    last_run_status: { type: "string" }, // 'success', 'error'
    last_run_message: { type: "text" },
    next_run_at: { type: "datetime" },
    run_count: { type: "number", default: 0 },
    error_count: { type: "number", default: 0 },
    tenant_id: { type: "string" }, // null for system-wide jobs
    created_at: { type: "datetime", default: "now" },
    updated_at: { type: "datetime", default: "now" }
  },
  rls: {
    select: "tenant_id IS NULL OR tenant_id = auth.user().tenant_id",
    insert: "auth.user().role IN ('admin', 'superadmin')",
    update: "auth.user().role IN ('admin', 'superadmin')",
    delete: "auth.user().role IN ('admin', 'superadmin')"
  }
};

export default CronJobSchema;
