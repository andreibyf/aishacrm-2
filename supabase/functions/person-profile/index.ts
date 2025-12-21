// deno-lint-ignore-file no-explicit-any
// person-profile Edge Function
// Behavior:
// - GET /person-profile/:id or /person-profile?id=:id
// - Returns a single JSON object with fixed keys and nulls for missing values
// - Preserves existing auth requirements (no changes here). Uses service key only for server-side fetch if needed
// - Does not 404; always returns the object shape
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// Helper: extract UUID from path or query
function extractId(req) {
  const url = new URL(req.url);
  const qp = url.searchParams.get("id");
  if (qp) return qp;
  // pathname like /functions/v1/person-profile/UUID or /person-profile/UUID when run locally
  const parts = url.pathname.split("/").filter(Boolean);
  // Expect the last segment to be the id if there are >= 1 after function name
  const last = parts[parts.length - 1];
  // Heuristic: basic UUID v4 pattern check; if not, ignore
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (uuidRegex.test(last)) return last;
  return null;
}
// Fixed response keys
const emptyResponse = (person_id)=>({
    idx: null,
    person_id,
    person_type: null,
    tenant_id: null,
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    job_title: null,
    status: null,
    account_id: null,
    account_name: null,
    updated_at: null,
    last_activity_at: null,
    open_opportunity_count: null,
    recent_documents: "[]",
    assigned_to: null,
    ai_summary: null,
    ai_summary_updated_at: null
  });
// Map DB row -> response
function mapRow(row, person_id) {
  if (!row) return emptyResponse(person_id);
  return {
    idx: row.idx ?? null,
    person_id: person_id,
    person_type: row.person_type ?? null,
    tenant_id: row.tenant_id ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    job_title: row.job_title ?? null,
    status: row.status ?? null,
    account_id: row.account_id ?? null,
    account_name: row.account_name ?? null,
    updated_at: row.updated_at ?? null,
    last_activity_at: row.last_activity_at ?? null,
    open_opportunity_count: row.open_opportunity_count ?? null,
    recent_documents: row.recent_documents ?? "[]",
    assigned_to: row.assigned_to ?? null,
    ai_summary: row.ai_summary ?? null,
    ai_summary_updated_at: row.ai_summary_updated_at ?? null
  };
}
// Build Supabase client with service_role for internal reads (RLS-safe cron tables)
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
}
// Fetch from a materialized/cron-populated view/table. Adjust the source as needed.
// We try multiple known sources to be resilient without changing configs.
async function fetchProfile(person_id) {
  const supabase = getAdminClient();
  // Candidate sources in order of preference
  const sources = [
    {
      schema: "public",
      table: "person_profile"
    },
    {
      schema: "public",
      table: "person_profiles"
    },
    {
      schema: "public",
      table: "person_profile_view"
    }
  ];
  for (const src of sources){
    const { data, error } = await supabase.from(`${src.table}`).select([
      "idx",
      "person_id",
      "person_type",
      "tenant_id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "job_title",
      "status",
      "account_id",
      "account_name",
      "updated_at",
      "last_activity_at",
      "open_opportunity_count",
      "recent_documents",
      "assigned_to",
      "ai_summary",
      "ai_summary_updated_at"
    ].join(",")).eq("person_id", person_id).limit(1).maybeSingle();
    if (error) {
      // Continue trying next source if table not found; otherwise return empty
      if (error.code === "42P01" || // undefined table
      error.message?.toLowerCase().includes("does not exist")) {
        continue;
      }
      // Unexpected error -> still return empty shape; do not leak details
      return {
        row: null
      };
    }
    if (data) return {
      row: data
    };
  }
  return {
    row: null
  };
}
Deno.serve(async (req)=>{
  try {
    const id = extractId(req);
    if (!id) {
      // No id -> return empty shape with person_id null to avoid 404s
      const payload = emptyResponse(null);
      return new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
          "Connection": "keep-alive"
        },
        status: 200
      });
    }
    const { row } = await fetchProfile(id);
    const payload = mapRow(row, id);
    return new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        "Connection": "keep-alive"
      },
      status: 200
    });
  } catch (_e) {
    // Never 404/500 outwardly; return empty shape per requirements
    const fallback = emptyResponse(null);
    return new Response(JSON.stringify(fallback), {
      headers: {
        "Content-Type": "application/json",
        "Connection": "keep-alive"
      },
      status: 200
    });
  }
});
