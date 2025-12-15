import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getSupabaseAccessToken } from "@/api/edgeFunctions";
import { supabase } from "@/lib/supabase";

function getRuntimeEnv(key) {
  if (typeof window !== "undefined" && window._env_) return window._env_[key];
  return import.meta.env[key];
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatDate(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(value) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  } catch {
    return String(value);
  }
}

function StatusPill({ status }) {
  const s = (status || "unknown").toLowerCase();
  const cls =
    s.includes("new")
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : s.includes("qualified")
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : s.includes("disqual")
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : s.includes("contacted")
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-zinc-50 text-zinc-700 ring-zinc-200";

  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1", cls)}>
      {status || "Unknown"}
    </span>
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-zinc-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function SectionCard({ title, right, children }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div className="text-base font-semibold text-zinc-900">{title}</div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-900 text-right">{value ?? "—"}</div>
    </div>
  );
}

function EmptyState({ title, detail, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      {detail ? <div className="mt-1 text-sm text-zinc-600">{detail}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Lead Profile Page (Direct Edge Function)
 * Route: /leads/:leadId
 * Fetches person-profile directly from Supabase Edge Function using Authorization.
 */
export default function LeadProfilePage() {
  const { leadId = "" } = useParams();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);

  const tenantId = useMemo(() => {
    return (
      searchParams.get("tenant") ||
      searchParams.get("tenant_id") ||
      (typeof window !== "undefined" ? window.localStorage.getItem("tenant_id") : null) ||
      null
    );
  }, [searchParams]);

  // Check if AI summary should be refreshed (cache for 24 hours)
  function shouldRefreshSummary(lastUpdatedAt) {
    if (!lastUpdatedAt) return true; // No summary yet
    const lastUpdate = new Date(lastUpdatedAt);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    return hoursSinceUpdate > 24; // Refresh if older than 24 hours
  }

  // Helper to resolve UUID to employee name
  async function resolveEmployeeName(uuid) {
    if (!uuid) return null;
    try {
      const { data } = await supabase
        .from('employees')
        .select('first_name, last_name')
        .eq('id', uuid)
        .single();
      if (data) return `${data.first_name} ${data.last_name}`.trim();
    } catch {
      // Try users table if employees not found
      try {
        const { data } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('id', uuid)
          .single();
        if (data) return `${data.first_name} ${data.last_name}`.trim() || data.email;
      } catch {
        return null;
      }
    }
    return null;
  }

  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!leadId) return;
      setLoading(true);
      setError(null);
      try {
        // Get session and access token following Supabase pattern
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) throw new Error("Not authenticated");
        
        // Call Supabase Edge Function directly
        const supabaseUrl = getRuntimeEnv('VITE_SUPABASE_URL') || '';
        if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
        
        const functionsBase = supabaseUrl.replace(/\/$/, '').replace('.supabase.co', '.functions.supabase.co');
        const anonKey = getRuntimeEnv('VITE_SUPABASE_ANON_KEY') || '';
        const url = `${functionsBase}/person-refresh?person_id=${encodeURIComponent(leadId)}&max_wait_ms=1200`;
        
        const headers = {
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        };
        
        const res = await fetch(url, {
          method: 'GET',
          headers,
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`Failed to load (${res.status}). ${msg}`);
        }
        let data = await res.json();
        
        // Resolve assigned_to UUIDs to names
        if (data.assigned_to) {
          const name = await resolveEmployeeName(data.assigned_to);
          if (name) data.assigned_to_name = name;
        }
        
        // Resolve activity assigned_to fields
        if (data.activities && Array.isArray(data.activities)) {
          for (const activity of data.activities) {
            if (activity.assigned_to) {
              const name = await resolveEmployeeName(activity.assigned_to);
              if (name) activity.assigned_to_name = name;
            }
          }
        }
        
        // Get tenant_id: use tenantId from query params or localStorage
        const effectiveTenantId = tenantId || (typeof window !== 'undefined' ? window.localStorage.getItem('tenant_id') : null);
        
        if (import.meta.env.DEV) console.log('[LeadProfile] tenantId available:', !!effectiveTenantId);
        
        // Generate AI summary only if missing and not recently generated (cache for 24 hours)
        if (effectiveTenantId && (!data.ai_summary || shouldRefreshSummary(data.ai_summary_updated_at))) {
          try {
            const backendUrl = getRuntimeEnv('VITE_AISHACRM_BACKEND_URL') || 'http://localhost:4001';
            if (import.meta.env.DEV) console.log('[LeadProfile] Calling AI summary endpoint...', { leadId, tenant_id: effectiveTenantId });
            const summaryRes = await fetch(`${backendUrl}/api/ai/summarize-person-profile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                person_id: leadId,
                person_type: 'lead',
                profile_data: data,
                tenant_id: effectiveTenantId,
              }),
            });
            if (summaryRes.ok) {
              const respData = await summaryRes.json();
              if (import.meta.env.DEV) console.log('[LeadProfile] AI summary response:', respData);
              const { ai_summary } = respData;
              if (ai_summary) {
                data.ai_summary = ai_summary;
                data.ai_summary_updated_at = new Date().toISOString();
                if (import.meta.env.DEV) console.log('[LeadProfile] AI summary stored:', ai_summary.substring(0, 100));
              }
            } else {
              const errText = await summaryRes.text().catch(() => "");
              if (import.meta.env.DEV) console.error('[LeadProfile] AI summary endpoint error:', summaryRes.status, errText);
            }
          } catch (e) {
            console.error('[LeadProfile] Failed to generate AI summary:', e?.message);
          }
        } else {
          if (import.meta.env.DEV) console.log('[LeadProfile] Skipping AI summary:', { 
            has_tenant: !!effectiveTenantId, 
            has_summary: !!data.ai_summary, 
            needs_refresh: data.ai_summary ? shouldRefreshSummary(data.ai_summary_updated_at) : 'N/A' 
          });
        }
        
        if (!aborted) setProfile(data || null);
      } catch (e) {
        if (!aborted) setError(e?.message || "Failed to load");
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [leadId, tenantId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="h-6 w-56 animate-pulse rounded bg-zinc-200" />
            <div className="mt-3 h-4 w-80 animate-pulse rounded bg-zinc-200" />
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200" />
              ))}
            </div>
            <div className="mt-6 h-64 animate-pulse rounded-2xl bg-zinc-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-zinc-900">Could not load lead</div>
            <div className="mt-2 text-sm text-zinc-600">{error || "Missing profile data"}</div>
            <div className="mt-6 flex gap-2">
              <Link to="/leads" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                Back to Leads
              </Link>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-200"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const lead = profile;
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead";
  const companyName = lead.account_name || "—";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-12">
        {/* Header */}
        <div className="border-b border-zinc-200 pb-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-4xl font-bold text-zinc-900">{name}</h1>
            <StatusPill status={lead.status} />
          </div>
          <p className="mt-2 text-lg text-zinc-600">{lead.job_title} at {companyName}</p>
          <div className="mt-2 flex gap-4 text-sm text-zinc-600">
            <span>Last activity: {formatDate(lead.last_activity_at)}</span>
            {lead.assigned_to_name && (
              <span>• Assigned to: <span className="font-semibold text-zinc-900">{lead.assigned_to_name}</span></span>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">Contact Information</h3>
            <dl className="mt-4 space-y-4">
              {lead.email && (
                <div>
                  <dt className="text-sm text-zinc-600">Email</dt>
                  <dd className="mt-1 text-base text-zinc-900">
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                  </dd>
                </div>
              )}
              {lead.phone && (
                <div>
                  <dt className="text-sm text-zinc-600">Phone</dt>
                  <dd className="mt-1 text-base text-zinc-900">
                    <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">{lead.phone}</a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">Key Dates</h3>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-sm text-zinc-600">Last Activity</dt>
                <dd className="mt-1 text-base text-zinc-900">{formatDate(lead.last_activity_at)}</dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-600">Last Updated</dt>
                <dd className="mt-1 text-base text-zinc-900">{formatDate(lead.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* AI Summary */}
        {lead.ai_summary && (
          <div className="mt-8 border-t border-zinc-200 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">AI Summary</h3>
            <div className="mt-4 rounded-lg bg-blue-50 p-4 text-base text-zinc-900">
              {lead.ai_summary}
            </div>
          </div>
        )}

        {/* Notes */}
        {lead.notes && lead.notes.length > 0 && (
          <div className="mt-8 border-t border-zinc-200 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">Notes ({lead.notes.length})</h3>
            <div className="mt-4 space-y-4">
              {lead.notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-zinc-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-zinc-900">{note.title}</h4>
                      <p className="mt-1 text-sm text-zinc-700">{note.content}</p>
                    </div>
                    <span className="ml-4 flex-shrink-0 text-xs text-zinc-500">{formatDate(note.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activities */}
        {lead.activities && lead.activities.length > 0 && (
          <div className="mt-8 border-t border-zinc-200 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">Activities ({lead.activities.length})</h3>
            <div className="mt-4 space-y-4">
              {lead.activities.map((activity) => (
                <div key={activity.id} className="rounded-lg border border-zinc-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-zinc-900">{activity.subject}</h4>
                      <p className="mt-1 text-sm text-zinc-700">{activity.body}</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-600 md:grid-cols-3">
                        <div>
                          <span className="text-zinc-500">Type:</span> <span className="font-medium">{activity.type}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Status:</span> <span className="font-medium">{activity.status}</span>
                        </div>
                        {activity.priority && (
                          <div>
                            <span className="text-zinc-500">Priority:</span> <span className="font-medium">{activity.priority}</span>
                          </div>
                        )}
                        {activity.due_date && (
                          <div>
                            <span className="text-zinc-500">Due:</span> <span className="font-medium">{formatDate(activity.due_date)}</span>
                          </div>
                        )}
                        {activity.assigned_to_name && (
                          <div>
                            <span className="text-zinc-500">Assigned to:</span> <span className="font-medium">{activity.assigned_to_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="ml-4 flex-shrink-0 text-xs text-zinc-500">{formatDate(activity.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opportunities */}
        {lead.opportunity_stage && lead.opportunity_stage.length > 0 && (
          <div className="mt-8 border-t border-zinc-200 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">Opportunities ({lead.opportunity_stage.length})</h3>
            <div className="mt-4 space-y-2">
              {lead.opportunity_stage.map((stage, idx) => (
                <div key={idx} className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-800">
                  {stage}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
