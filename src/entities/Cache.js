/**
 * Cache Entity Schema
 */

export const CacheSchema = {
  name: "Cache",
  fields: {
    id: { type: "string", required: true, unique: true },
    key: { type: "string", required: true, unique: true },
    value: { type: "json" },
    expires_at: { type: "datetime" },
    tenant_id: { type: "string" },
    created_at: { type: "datetime", default: "now" },
    updated_at: { type: "datetime", default: "now" }
  },
  rls: {
    select: "tenant_id IS NULL OR tenant_id = auth.user().tenant_id",
    insert: "true", // Anyone can cache
    update: "true",
    delete: "true"
  }
};

export default CacheSchema;
