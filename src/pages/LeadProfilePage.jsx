import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { setAiShaContext } from "@/utils/contextBridge";
import EntityAiSummaryCard from "@/components/crm/EntityAiSummaryCard";

function getRuntimeEnv(key) {
  if (typeof window !== "undefined" && window._env_) return window._env_[key];
  return import.meta.env[key];
}

function formatDate(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      {status || "Unknown"}
    </span>
  );
}

/**
 * Universal Profile Page (Direct Edge Function)
 * Routes: /leads/:leadId | /accounts/:accountId | /contacts/:contactId | /bizdev/:bizdevId
 * Fetches person-profile directly from Supabase Edge Function using Authorization.
 */
export default function LeadProfilePage() {
  return (
    <LeadProfilePageContent />
  );
}

function LeadProfilePageContent() {
  console.log("LeadProfilePageContent rendering (New Version)");
  const params = useParams();
  const [searchParams] = useSearchParams();

  // Detect entity type from URL path and get ID
  const entityType = useMemo(() => {
    if (params.leadId) return 'lead';
    if (params.accountId) return 'account';
    if (params.contactId) return 'contact';
    if (params.bizdevId) return 'bizdev';
    return 'lead'; // default
  }, [params]);

  const entityId = useMemo(() => {
    return params.leadId || params.accountId || params.contactId || params.bizdevId || '';
  }, [params]);

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
      if (!entityId) return;
      setLoading(true);
      setError(null);
      try {
        // Use backend API instead of Edge Function to avoid CORS/404 issues
        const backendUrl = getRuntimeEnv('VITE_AISHACRM_BACKEND_URL') || 'http://localhost:4001';
        const effectiveTenantId = tenantId || (typeof window !== 'undefined' ? window.localStorage.getItem('tenant_id') : null);
        
        if (!effectiveTenantId) {
          throw new Error("Tenant ID not available");
        }
        
        // Fetch entity data from backend
        let url;
        if (entityType === 'lead') {
          url = `${backendUrl}/api/leads/${entityId}?tenant_id=${effectiveTenantId}`;
        } else if (entityType === 'account') {
          url = `${backendUrl}/api/v2/accounts/${entityId}?tenant_id=${effectiveTenantId}`;
        } else if (entityType === 'contact') {
          url = `${backendUrl}/api/v2/contacts/${entityId}?tenant_id=${effectiveTenantId}`;
        } else if (entityType === 'bizdev') {
          url = `${backendUrl}/api/bizdevsources/${entityId}?tenant_id=${effectiveTenantId}`;
        } else {
          throw new Error("Unknown entity type");
        }
        
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`Failed to load (${res.status}). ${msg}`);
        }
        let data = await res.json();
        if (import.meta.env.DEV) console.log('[Profile] Raw API response:', data);
        
        // Normalize data structure for different entity types
        // Leads returns: { status: 'success', data: { lead: {...} } }
        // Accounts/Contacts return: { status: 'success', data: { account/contact: {...}, aiContext: {...} } }
        // BizDev returns: { source: {...} }
        if (data.data) {
          if (data.data.lead) {
            data = data.data.lead;
          } else if (data.data.account) {
            data = data.data.account;
          } else if (data.data.contact) {
            data = data.data.contact;
          } else {
            // Fallback - just use data.data if it's a direct object
            data = data.data;
          }
        } else if (data.source) {
          // BizDev API returns { source: { ... } }
          data = data.source;
        }
        if (import.meta.env.DEV) console.log('[Profile] After normalization:', data);
        
        // Resolve assigned_to UUIDs to names
        if (data.assigned_to) {
          const name = await resolveEmployeeName(data.assigned_to);
          if (name) data.assigned_to_name = name;
        }
        
        // Fetch related activities - use related_to_type and related_to_id for proper filtering
        try {
          const activitiesUrl = `${backendUrl}/api/v2/activities?tenant_id=${effectiveTenantId}&related_to_type=${entityType}&related_to_id=${entityId}`;
          const activitiesRes = await fetch(activitiesUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          if (activitiesRes.ok) {
            const activitiesData = await activitiesRes.json();
            if (import.meta.env.DEV) console.log('[Profile] Activities response:', activitiesData);
            
            // Extract activities array from nested response: { data: { activities: [...] } }
            const rawActivities = activitiesData.data?.activities || activitiesData.activities || activitiesData.data || activitiesData;
            data.activities = Array.isArray(rawActivities) ? rawActivities : [];
            
            // Resolve activity assigned_to fields
            for (const activity of data.activities) {
              if (activity.assigned_to) {
                const name = await resolveEmployeeName(activity.assigned_to);
                if (name) activity.assigned_to_name = name;
              }
            }
          }
        } catch (e) {
          console.error('Failed to load activities:', e);
          data.activities = [];
        }
        
        // Fetch related notes
        try {
          const notesUrl = `${backendUrl}/api/notes?tenant_id=${effectiveTenantId}&related_type=${entityType}&related_id=${entityId}`;
          const notesRes = await fetch(notesUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          if (notesRes.ok) {
            const notesData = await notesRes.json();
            if (import.meta.env.DEV) console.log('[Profile] Notes response:', notesData);
            
            // Extract notes array from response
            const rawNotes = notesData.data?.notes || notesData.notes || notesData.data || notesData;
            data.notes = Array.isArray(rawNotes) ? rawNotes : [];
          }
        } catch (e) {
          console.error('Failed to load notes:', e);
          data.notes = [];
        }
        
        // Fetch related opportunities based on entity type
        try {
          let oppsUrl = `${backendUrl}/api/v2/opportunities?tenant_id=${effectiveTenantId}`;
          if (entityType === 'lead') {
            oppsUrl += `&lead_id=${entityId}`;
          } else if (entityType === 'account') {
            oppsUrl += `&account_id=${entityId}`;
          } else if (entityType === 'contact') {
            oppsUrl += `&contact_id=${entityId}`;
          }
          // Only fetch if we have a valid filter
          if (oppsUrl.includes('_id=')) {
            const oppsRes = await fetch(oppsUrl, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            });
            if (oppsRes.ok) {
              const oppsData = await oppsRes.json();
              if (import.meta.env.DEV) console.log('[Profile] Opportunities response:', oppsData);
              
              // Extract opportunities array from nested response: { data: { opportunities: [...] } }
              const rawOpps = oppsData.data?.opportunities || oppsData.opportunities || oppsData.data || oppsData;
              data.opportunities = Array.isArray(rawOpps) ? rawOpps : [];
            }
          } else {
            data.opportunities = [];
          }
        } catch (e) {
          console.error('Failed to load opportunities:', e);
          data.opportunities = [];
        }
        
        // Fetch activities linked to this entity's opportunities
        // This ensures activities created from opportunities appear in the profile
        try {
          if (data.opportunities && data.opportunities.length > 0) {
            const oppIds = data.opportunities.map(o => o.id);
            const oppActivitiesPromises = oppIds.map(async (oppId) => {
              const oppActUrl = `${backendUrl}/api/v2/activities?tenant_id=${effectiveTenantId}&related_to_type=opportunity&related_to_id=${oppId}`;
              const res = await fetch(oppActUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              });
              if (res.ok) {
                const resData = await res.json();
                return resData.data?.activities || resData.activities || [];
              }
              return [];
            });
            const oppActivitiesArrays = await Promise.all(oppActivitiesPromises);
            const oppActivities = oppActivitiesArrays.flat();
            
            // Add opportunity activities that aren't already in the list
            if (!data.activities) data.activities = [];
            const existingIds = new Set(data.activities.map(a => a.id));
            for (const activity of oppActivities) {
              if (!existingIds.has(activity.id)) {
                // Mark as opportunity-related for UI distinction
                activity._fromOpportunity = true;
                if (activity.assigned_to) {
                  const name = await resolveEmployeeName(activity.assigned_to);
                  if (name) activity.assigned_to_name = name;
                }
                data.activities.push(activity);
              }
            }
            if (import.meta.env.DEV) console.log('[Profile] Added opportunity activities:', oppActivities.length);
          }
        } catch (e) {
          console.error('Failed to load opportunity activities:', e);
        }
        
        if (import.meta.env.DEV) console.log('[Profile] tenantId available:', !!effectiveTenantId);
        
        // Generate AI summary only if missing and not recently generated (cache for 24 hours)
        if (effectiveTenantId && (!data.ai_summary || shouldRefreshSummary(data.ai_summary_updated_at))) {
          try {
            if (import.meta.env.DEV) console.log('[Profile] Calling AI summary endpoint...', { entityId, tenant_id: effectiveTenantId });
            const summaryRes = await fetch(`${backendUrl}/api/ai/summarize-person-profile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                person_id: entityId,
                person_type: entityType,
                profile_data: data,
                tenant_id: effectiveTenantId,
              }),
            });
            if (summaryRes.ok) {
              const respData = await summaryRes.json();
              if (import.meta.env.DEV) console.log('[Profile] AI summary response:', respData);
              const { ai_summary } = respData;
              if (ai_summary) {
                data.ai_summary = ai_summary;
                data.ai_summary_updated_at = new Date().toISOString();
                if (import.meta.env.DEV) console.log('[Profile] AI summary stored:', ai_summary.substring(0, 100));
              }
            } else {
              const errText = await summaryRes.text().catch(() => "");
              if (import.meta.env.DEV) console.error('[Profile] AI summary endpoint error:', summaryRes.status, errText);
            }
          } catch (e) {
            console.error('[Profile] Failed to generate AI summary:', e?.message);
          }
        } else {
          if (import.meta.env.DEV) console.log('[Profile] Skipping AI summary:', { 
            has_tenant: !!effectiveTenantId, 
            has_summary: !!data.ai_summary, 
            needs_refresh: data.ai_summary ? shouldRefreshSummary(data.ai_summary_updated_at) : 'N/A' 
          });
        }
        
        if (import.meta.env.DEV) console.log('[Profile] Final data before setProfile:', data);
        // Set profile if we have any data object
        if (!aborted) {
          setProfile(data || {});
          if (data && Object.keys(data).length > 0) {
            // Determine title for context
            let title = data.name || data.subject;
            if (!title && (data.first_name || data.last_name)) {
              title = [data.first_name, data.last_name].filter(Boolean).join(" ");
            }
            setAiShaContext({
              entity_type: entityType,
              entity_id: entityId,
              title: title || entityType
            });
          }
          if (!data || Object.keys(data).length === 0) {
            console.warn('[Profile] Empty data received');
          }
        }
      } catch (e) {
        console.error('[Profile] Load error:', e);
        if (!aborted) setError(e?.message || "Failed to load");
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
      setAiShaContext(null);
    };
  }, [entityId, tenantId, entityType]);

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
    const debugInfo = profile ? `Profile keys: ${Object.keys(profile).length}` : 'Profile is null/undefined';
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-zinc-900">Could not load {entityType}</div>
            <div className="mt-2 text-sm text-zinc-600">{error || "Missing profile data"}</div>
            {import.meta.env.DEV && <div className="mt-2 text-xs text-gray-500">{debugInfo}</div>}
            <div className="mt-6 flex gap-2">
              <Link to={`/${entityType}s`} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                Back to {entityType}s
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

  const lead = profile || {};
  
  // Build display name based on entity type
  let name, companyName, subtitle;
  if (entityType === 'account') {
    name = lead.name || lead.account_name || "Account";
    companyName = lead.industry || "—";
    subtitle = lead.type || "Customer";
  } else if (entityType === 'contact') {
    name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Contact";
    companyName = lead.account_name || lead.company || "—";
    subtitle = lead.job_title || lead.title || "—";
  } else if (entityType === 'bizdev') {
    name = lead.contact_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "BizDev Source";
    companyName = lead.company || lead.account_name || "—";
    subtitle = lead.source || "—";
  } else {
    // lead
    name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead";
    companyName = lead.company || lead.account_name || "—";
    subtitle = lead.job_title || lead.title || "—";
  }

  function ActivityBadge({ status }) {
    const s = (status || "unknown").toLowerCase();
    if (s.includes("overdue")) return <span className="inline-block px-2 py-1 text-xs font-bold text-white bg-red-600 rounded">Overdue</span>;
    if (s.includes("completed")) return <span className="inline-block px-2 py-1 text-xs font-bold text-white bg-green-600 rounded">Completed</span>;
    if (s.includes("scheduled")) return <span className="inline-block px-2 py-1 text-xs font-bold text-white bg-blue-600 rounded">Scheduled</span>;
    return <span className="inline-block px-2 py-1 text-xs font-bold text-gray-700 bg-gray-200 rounded">Normal</span>;
  }

  function StageBadge({ stage }) {
    const s = (stage || "").toLowerCase().replace(/_/g, " ");
    const cls = s.includes("won") ? "bg-emerald-100 text-emerald-800" 
      : s.includes("lost") ? "bg-red-100 text-red-800"
      : s.includes("proposal") ? "bg-purple-100 text-purple-800"
      : s.includes("negotiation") ? "bg-orange-100 text-orange-800"
      : s.includes("qualified") ? "bg-blue-100 text-blue-800"
      : "bg-gray-100 text-gray-800";
    return <span className={`inline-block px-2 py-1 text-xs font-semibold rounded capitalize ${cls}`}>{stage?.replace(/_/g, " ") || "Unknown"}</span>;
  }

  // Scroll to section helper
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Navigate to list page with filter
  const navigateToFiltered = (entityListType) => {
    // Build URL with filter for related records
    const filterParam = encodeURIComponent(JSON.stringify({ related_id: entityId }));
    window.location.href = `/${entityListType}?filter=${filterParam}`;
  };

  // Count helpers for sidebar badges
  const notesCount = Array.isArray(lead.notes) ? lead.notes.length : 0;
  const activitiesCount = Array.isArray(lead.activities) ? lead.activities.length : 0;
  const opportunitiesCount = Array.isArray(lead.opportunities) ? lead.opportunities.length : 0;

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}

      {/* Sidebar */}
      <aside className="fixed top-0 left-0 bottom-0 w-64 bg-gray-900 text-white p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-1">{name}</h1>
        {subtitle && <p className="text-gray-400 text-sm mb-2">{subtitle}</p>}
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-6">{companyName}</p>
        <nav className="border-t border-gray-700 pt-4">
          <a href="#overview" className="text-white block py-3 text-sm font-medium">Overview</a>
          <button 
            onClick={() => scrollToSection('notes')} 
            className="text-gray-400 hover:text-white w-full text-left py-3 text-sm flex items-center justify-between group"
          >
            <span>+ Notes</span>
            {notesCount > 0 && (
              <span className="bg-gray-700 group-hover:bg-gray-600 text-gray-300 text-xs px-2 py-0.5 rounded-full">{notesCount}</span>
            )}
          </button>
          <button 
            onClick={() => scrollToSection('activities')} 
            className="text-gray-400 hover:text-white w-full text-left py-3 text-sm flex items-center justify-between group"
          >
            <span>+ Activities</span>
            {activitiesCount > 0 && (
              <span className="bg-gray-700 group-hover:bg-gray-600 text-gray-300 text-xs px-2 py-0.5 rounded-full">{activitiesCount}</span>
            )}
          </button>
          <button 
            onClick={() => scrollToSection('opportunities')} 
            className="text-gray-400 hover:text-white w-full text-left py-3 text-sm flex items-center justify-between group"
          >
            <span>+ Opportunities</span>
            {opportunitiesCount > 0 && (
              <span className="bg-gray-700 group-hover:bg-gray-600 text-gray-300 text-xs px-2 py-0.5 rounded-full">{opportunitiesCount}</span>
            )}
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-4xl">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Profile</h2>

          {/* AI Summary */}
          <EntityAiSummaryCard
            entityType={entityType}
            entityId={entityId}
            entityLabel={name}
            aiSummary={lead.ai_summary}
            lastUpdated={lead.updated_at}
            profile={lead}
            relatedData={{
              opportunities: lead.opportunities || [],
              activities: lead.activities || [],
              notes: lead.notes || []
            }}
          />

          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">📧 Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Email</div>
                <div className="text-sm text-gray-900">
                  {lead.email ? <a href={`mailto:${lead.email}`} className="text-indigo-600 hover:underline">{lead.email}</a> : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Phone</div>
                <div className="text-sm text-gray-900">
                  {lead.phone ? <a href={`tel:${lead.phone}`} className="text-indigo-600 hover:underline">{lead.phone}</a> : "—"}
                </div>
              </div>
              {entityType === 'account' && (
                <>
                  <div>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Website</div>
                    <div className="text-sm text-gray-900">
                      {lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{lead.website}</a> : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Type</div>
                    <div className="text-sm text-gray-900">{lead.type || "—"}</div>
                  </div>
                  {lead.address_1 && (
                    <div className="col-span-2">
                      <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Address</div>
                      <div className="text-sm text-gray-900">
                        {[lead.address_1, lead.address_2, lead.city, lead.state, lead.zip_code, lead.country].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  )}
                </>
              )}
              {(entityType === 'contact' || entityType === 'lead') && lead.company && (
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Company</div>
                  <div className="text-sm text-gray-900">{lead.company}</div>
                </div>
              )}
              {(entityType === 'bizdev') && (
                <>
                  <div>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Source</div>
                    <div className="text-sm text-gray-900">{lead.source || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">License Status</div>
                    <div className="text-sm text-gray-900">{lead.license_status || "—"}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">📅 Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Last Activity</span>
                <span className="font-semibold text-gray-900">{formatDate(lead.last_activity_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Updated</span>
                <span className="font-semibold text-gray-900">{formatDate(lead.updated_at)}</span>
              </div>
              {lead.assigned_to_name && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Assigned To</span>
                  <span className="font-semibold text-gray-900">{lead.assigned_to_name}</span>
                </div>
              )}
              {lead.status && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="font-semibold text-gray-900"><StatusPill status={lead.status} /></span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div id="notes" className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900">📝 Notes</h3>
            </div>
            {lead.notes && lead.notes.length > 0 ? (
              <div className="space-y-3">
                {lead.notes.map((note) => (
                  <div key={note.id} className="pb-3 border-b border-gray-200 last:border-b-0">
                    <h4 className="font-semibold text-gray-900">{note.title}</h4>
                    <p className="text-sm text-gray-700 mt-1">{note.content}</p>
                    <p className="text-xs text-gray-500 mt-2">{formatDate(note.updated_at)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No notes yet</p>
            )}
          </div>

          {/* Activities */}
          <div id="activities" className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900">⚡ Activities</h3>
            </div>
            {Array.isArray(lead.activities) && lead.activities.length > 0 ? (
              <div className="space-y-4">
                {lead.activities.map((activity) => (
                  <div key={activity.id} className="pb-4 border-b border-gray-200 last:border-b-0">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{activity.subject}</h4>
                      <ActivityBadge status={activity.status} />
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{activity.body}</p>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>Type: <span className="font-medium">{activity.type}</span> | Priority: <span className="font-medium">{activity.priority || "Normal"}</span></p>
                      {activity.due_date && <p>Due: <span className="font-medium">{formatDate(activity.due_date)}</span></p>}
                      {activity.assigned_to_name && <p>Assigned to: <span className="font-medium">{activity.assigned_to_name}</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No activities yet</p>
            )}
          </div>

          {/* Opportunities */}
          <div id="opportunities" className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900">🎯 Opportunities</h3>
            </div>
            {Array.isArray(lead.opportunities) && lead.opportunities.length > 0 ? (
              <div className="space-y-4">
                {lead.opportunities.map((opp) => (
                  <Link
                    key={opp.id}
                    to={`/opportunities?id=${opp.id}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{opp.name}</h4>
                      <StageBadge stage={opp.stage} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {opp.amount != null && (
                        <span className="font-medium text-green-700">
                          ${Number(opp.amount).toLocaleString()}
                        </span>
                      )}
                      {opp.close_date && (
                        <span>Close: {formatDate(opp.close_date)}</span>
                      )}
                      {opp.probability != null && (
                        <span>{opp.probability}% probability</span>
                      )}
                    </div>
                    {opp.next_step && (
                      <p className="mt-2 text-xs text-gray-500">
                        <span className="font-medium">Next step:</span> {opp.next_step}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No opportunities yet</p>
            )}
          </div>
        </div>
      </main>




    </div>
  );
}
