/**
 * File Entity Schema
 */

export const FileSchema = {
  name: "File",
  fields: {
    id: { type: "string", required: true, unique: true },
    filename: { type: "string", required: true },
    original_filename: { type: "string" },
    mime_type: { type: "string" },
    size_bytes: { type: "number" },
    storage_path: { type: "string" },
    storage_provider: { type: "string" }, // 'r2', 'minio', 'onedrive', 'google_drive'
    is_private: { type: "boolean", default: true },
    entity_type: { type: "string" }, // 'contact', 'account', 'opportunity', etc.
    entity_id: { type: "string" },
    uploaded_by: { type: "string" }, // user_id
    tenant_id: { type: "string", required: true },
    created_at: { type: "datetime", default: "now" },
    updated_at: { type: "datetime", default: "now" }
  },
  rls: {
    select: "tenant_id = auth.user().tenant_id",
    insert: "tenant_id = auth.user().tenant_id",
    update: "tenant_id = auth.user().tenant_id",
    delete: "tenant_id = auth.user().tenant_id"
  }
};

export default FileSchema;
