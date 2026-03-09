import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setAiShaContext } from '@/utils/contextBridge';
import EntityAiSummaryCard from '@/components/crm/EntityAiSummaryCard';

function getRuntimeEnv(key) {
  if (typeof window !== 'undefined' && window._env_) return window._env_[key];
  return import.meta.env[key];
}

// ─── Formatters ─────────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—';
  let dateStr = dt;
  if (typeof dt === 'string' && dt.includes(' ') && !dt.includes('T')) {
    const [datePart, timePart] = dt.split(' ');
    dateStr = `${datePart}T${timePart}.000Z`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg: '#F7F6F3',
  card: '#FFFFFF',
  cardAlt: '#FAFAF8',
  ink: '#1A1A1A',
  inkMuted: '#6B6B6B',
  inkLight: '#9C9C9C',
  accent: '#2563EB',
  accentSoft: '#EFF4FF',
  success: '#059669',
  successSoft: '#ECFDF5',
  warning: '#D97706',
  warningSoft: '#FFFBEB',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  border: '#E5E5E3',
  borderLight: '#F0EFED',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
};

const CARE_COLORS = {
  unaware: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
  aware: { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  engaged: { bg: '#ECFDF5', text: '#047857', dot: '#10B981' },
  evaluating: { bg: '#F5F3FF', text: '#6D28D9', dot: '#8B5CF6' },
  committed: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  active: { bg: '#ECFDF5', text: '#047857', dot: '#059669' },
  at_risk: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  dormant: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
  reactivated: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  lost: { bg: '#FEF2F2', text: '#991B1B', dot: '#DC2626' },
};

const ENTITY_ICONS = {
  bizdev: { bg: '#FEF3C7', border: '#F59E0B', icon: '🌱' },
  lead: { bg: '#DBEAFE', border: '#3B82F6', icon: '🎯' },
  contact: { bg: '#D1FAE5', border: '#10B981', icon: '👤' },
  account: { bg: '#FDE68A', border: '#F59E0B', icon: '🏢' },
  opportunity: { bg: '#EDE9FE', border: '#8B5CF6', icon: '💰' },
};

const ACTIVITY_ICONS = { call: '📞', email: '✉️', meeting: '🤝', task: '☑️' };

// ─── Sub-components ─────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  if (score == null) return null;
  const r = 28,
    circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? C.success : score >= 40 ? C.warning : C.danger;
  return (
    <div style={{ position: 'relative', width: 72, height: 72 }}>
      <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke={C.borderLight} strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 18,
          fontWeight: 700,
          color,
        }}
      >
        {score}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: `2px solid ${C.ink}`,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</h3>
      {count != null && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            background: C.accentSoft,
            color: C.accent,
            padding: '2px 8px',
            borderRadius: 10,
            marginLeft: 'auto',
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: C.card,
        borderRadius: 12,
        padding: '16px 20px',
        border: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: C.inkLight,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: color || C.ink,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PipelineJourney({ journey }) {
  if (!journey || journey.length === 0) {
    return (
      <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>
        No journey history yet. Journey steps will appear as this record moves through the pipeline.
      </p>
    );
  }
  return (
    <div>
      {journey.map((step, i) => {
        const isLast = i === journey.length - 1;
        const ec = ENTITY_ICONS[step.entity] || ENTITY_ICONS.lead;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 16,
              paddingBottom: isLast ? 0 : 24,
              position: 'relative',
            }}
          >
            {!isLast && (
              <div
                style={{
                  position: 'absolute',
                  left: 19,
                  top: 40,
                  bottom: 0,
                  width: 2,
                  background: C.borderLight,
                }}
              />
            )}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: ec.bg,
                border: `2px solid ${ec.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {ec.icon}
            </div>
            <div style={{ flex: 1, paddingTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{step.stage}</span>
                <span style={{ fontSize: 11, color: C.inkLight }}>{formatDate(step.date)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{step.via}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CareStateTimeline({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return (
      <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>
        No relationship state tracked yet. C.A.R.E. state will appear once signals are detected.
      </p>
    );
  }
  const current = timeline[timeline.length - 1];
  const colors = CARE_COLORS[current.state] || CARE_COLORS.unaware;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: colors.dot,
            boxShadow: `0 0 0 3px ${colors.bg}`,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: colors.text,
            background: colors.bg,
            padding: '3px 10px',
            borderRadius: 4,
          }}
        >
          {current.state.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: 11, color: C.inkLight }}>{formatDate(current.date)}</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        <div
          style={{
            position: 'absolute',
            left: 4,
            top: 0,
            bottom: 0,
            width: 2,
            background: `linear-gradient(to bottom, ${C.accent}, ${colors.dot})`,
            borderRadius: 1,
          }}
        />
        {timeline.map((s, i) => {
          const sc = CARE_COLORS[s.state] || CARE_COLORS.unaware;
          const isLast = i === timeline.length - 1;
          return (
            <div
              key={i}
              style={{ position: 'relative', paddingBottom: isLast ? 0 : 16, paddingLeft: 16 }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: -3,
                  top: 4,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: isLast ? sc.dot : C.card,
                  border: `2px solid ${sc.dot}`,
                }}
              />
              <div
                style={{
                  fontSize: 13,
                  fontWeight: isLast ? 600 : 400,
                  color: isLast ? C.ink : C.inkMuted,
                }}
              >
                {s.state.replace(/_/g, ' ')}
                <span style={{ fontSize: 11, color: C.inkLight, marginLeft: 8 }}>
                  {formatDate(s.date)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{s.reason}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssignmentHistory({ assignments }) {
  if (!assignments || assignments.length === 0) {
    return (
      <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>
        No assignment history yet. Changes will appear here as this record is assigned or
        reassigned.
      </p>
    );
  }
  const styles = {
    assign: { color: C.success, label: 'Assigned', icon: '→' },
    reassign: { color: C.accent, label: 'Reassigned', icon: '⇄' },
    unassign: { color: C.danger, label: 'Unassigned', icon: '✕' },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {assignments.map((a, i) => {
        const s = styles[a.action] || styles.assign;
        return (
          <div
            key={a.id || i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: C.cardAlt,
              border: `1px solid ${C.borderLight}`,
            }}
          >
            <span
              style={{
                fontSize: 16,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                background: `${s.color}14`,
                color: s.color,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {s.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.ink }}>
                <span style={{ fontWeight: 600, color: s.color }}>{s.label}</span>
                {a.assigned_from_name && (
                  <span style={{ color: C.inkMuted }}> from {a.assigned_from_name}</span>
                )}
                {a.assigned_to_name && (
                  <>
                    <span style={{ color: C.inkMuted }}> to </span>
                    <span style={{ fontWeight: 600 }}>{a.assigned_to_name}</span>
                  </>
                )}
              </div>
              {a.note && (
                <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{a.note}</div>
              )}
              <div style={{ fontSize: 10, color: C.inkLight, marginTop: 3 }}>
                {formatDateTime(a.created_at)}{' '}
                {a.assigned_by_name ? `· by ${a.assigned_by_name}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityBadge({ status }) {
  const s = (status || '').toLowerCase();
  const conf = s.includes('overdue')
    ? { bg: C.dangerSoft, color: C.danger }
    : s.includes('completed')
      ? { bg: C.successSoft, color: C.success }
      : s.includes('scheduled')
        ? { bg: C.accentSoft, color: C.accent }
        : { bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '3px 8px',
        borderRadius: 4,
        background: conf.bg,
        color: conf.color,
      }}
    >
      {status || 'Normal'}
    </span>
  );
}

function StageBadge({ stage }) {
  const s = (stage || '').toLowerCase();
  const color = s.includes('won')
    ? C.success
    : s.includes('lost')
      ? C.danger
      : s.includes('proposal')
        ? C.purple
        : s.includes('negotiation')
          ? C.warning
          : s.includes('qualified')
            ? C.accent
            : '#6B7280';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        padding: '3px 10px',
        borderRadius: 4,
        background: `${color}14`,
        color,
      }}
    >
      {stage?.replace(/_/g, ' ') || 'Unknown'}
    </span>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function LeadProfilePage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryUpdatedAt, setAiSummaryUpdatedAt] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const entityType = useMemo(() => {
    if (params.leadId) return 'lead';
    if (params.accountId) return 'account';
    if (params.contactId) return 'contact';
    if (params.bizdevId) return 'bizdev';
    return 'lead';
  }, [params]);

  const entityId = useMemo(() => {
    return params.leadId || params.accountId || params.contactId || params.bizdevId || '';
  }, [params]);

  const tenantId = useMemo(() => {
    return (
      searchParams.get('tenant') ||
      searchParams.get('tenant_id') ||
      (typeof window !== 'undefined' ? window.localStorage.getItem('tenant_id') : null) ||
      null
    );
  }, [searchParams]);

  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!entityId) return;
      setLoading(true);
      setError(null);
      try {
        const backendUrl = getRuntimeEnv('VITE_AISHACRM_BACKEND_URL') || 'http://localhost:4001';
        const tid =
          tenantId ||
          (typeof window !== 'undefined' ? window.localStorage.getItem('tenant_id') : null);
        if (!tid) throw new Error('Tenant ID not available');

        // Get auth token
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        const res = await fetch(
          `${backendUrl}/api/profile/${entityType}/${entityId}?tenant_id=${tid}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );
        if (!res.ok) {
          const msg = await res.text().catch(() => '');
          throw new Error(`Failed to load (${res.status}). ${msg}`);
        }
        const json = await res.json();
        if (json.status !== 'success' || !json.data) throw new Error('Invalid response');

        if (!aborted) {
          setData(json.data);
          const title = json.data.display_name || entityType;
          setAiShaContext({ entity_type: entityType, entity_id: entityId, title });

          // Seed AI summary state from profile route response
          const existingSummary = json.data.entity?.ai_summary || null;
          const existingUpdatedAt = json.data.entity?.ai_summary_updated_at || null;
          setAiSummary(existingSummary);
          setAiSummaryUpdatedAt(existingUpdatedAt);

          // Auto-generate summary in background if none exists yet
          if (!existingSummary) {
            setAiSummaryLoading(true);
            const backendUrl2 =
              getRuntimeEnv('VITE_AISHACRM_BACKEND_URL') || 'http://localhost:4001';
            // BUGFIX: Use selected_tenant_id (UUID) instead of deprecated tenant_id (text slug)
            const tid2 = tenantId || window.localStorage.getItem('selected_tenant_id');
            const { data: sess2 } = await supabase.auth.getSession();
            const tok2 = sess2?.session?.access_token;
            fetch(`${backendUrl2}/api/ai/summarize-person-profile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(tok2 ? { Authorization: `Bearer ${tok2}` } : {}),
              },
              body: JSON.stringify({
                person_id: entityId,
                person_type: entityType,
                tenant_id: tid2,
                profile_data: json.data.entity,
              }),
            })
              .then((r) => r.json())
              .then((summaryJson) => {
                if (!aborted && summaryJson?.ai_summary) {
                  const s = Array.isArray(summaryJson.ai_summary)
                    ? summaryJson.ai_summary.join(' ')
                    : summaryJson.ai_summary;
                  setAiSummary(s);
                  setAiSummaryUpdatedAt(new Date().toISOString());
                }
              })
              .catch(() => {
                // Ollama/LLM failed — generate a deterministic fallback summary from profile data
                if (!aborted) {
                  const e = json.data.entity;
                  const n =
                    [e.first_name, e.last_name].filter(Boolean).join(' ') || e.name || entityType;
                  const company = e.company || e.account_name || e.company_name || '';
                  const title = e.job_title || e.title || '';
                  const source = e.source || e.lead_source || '';
                  const status = e.status || '';
                  const parts = [
                    `${n}${title ? `, ${title}` : ''}${company ? ` at ${company}` : ''} is a ${status || 'new'} ${entityType}${source ? ` from ${source}` : ''}.`,
                    'No AI-generated summary is available right now — the local model is still loading.',
                  ];
                  setAiSummary(parts.join(' '));
                  setAiSummaryUpdatedAt(null);
                }
              })
              .finally(() => {
                if (!aborted) setAiSummaryLoading(false);
              });
          }
        }
      } catch (e) {
        if (!aborted) setError(e?.message || 'Failed to load');
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

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px' }}>
          <div
            style={{
              height: 24,
              width: 280,
              background: C.border,
              borderRadius: 6,
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 16,
              width: 400,
              background: C.borderLight,
              borderRadius: 6,
              marginBottom: 32,
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 28,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 90, background: C.borderLight, borderRadius: 12 }} />
            ))}
          </div>
          <div style={{ height: 200, background: C.borderLight, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
            Could not load {entityType}
          </div>
          <div style={{ fontSize: 14, color: C.inkMuted, marginBottom: 24 }}>
            {error || 'Missing profile data'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: C.ink,
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <Link
              to={`/${entityType}s`}
              style={{
                background: C.borderLight,
                color: C.ink,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Back to list
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Unpack data ──
  const entity = data.entity || {};
  const journey = data.journey || [];
  const careTimeline = data.care?.timeline || [];
  const assignments = data.assignments || [];
  const activities = data.activities || [];
  const notes = data.notes || [];
  const opportunities = data.opportunities || [];
  const summary = data.summary || {};

  // Build display fields
  let name, companyName, subtitle;
  if (entityType === 'account') {
    name = entity.name || entity.account_name || 'Account';
    companyName = entity.industry || '—';
    subtitle = entity.type || 'Customer';
  } else if (entityType === 'contact') {
    name = [entity.first_name, entity.last_name].filter(Boolean).join(' ') || 'Contact';
    companyName = entity.account_name || entity.company || '—';
    subtitle = entity.job_title || entity.title || '—';
  } else if (entityType === 'bizdev') {
    name =
      entity.contact_person ||
      entity.contact_name ||
      [entity.first_name, entity.last_name].filter(Boolean).join(' ') ||
      'Potential Lead';
    companyName = entity.company_name || entity.company || '—';
    subtitle = entity.source || '—';
  } else {
    name = [entity.first_name, entity.last_name].filter(Boolean).join(' ') || 'Lead';
    companyName = entity.company || entity.account_name || '—';
    subtitle = entity.job_title || entity.title || '—';
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'journey', label: 'Journey' },
    { id: 'activity', label: 'Activity' },
    { id: 'notes', label: 'Notes' },
    { id: 'deals', label: 'Deals' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div style={{ background: '#0F172A', padding: '32px 0 0', color: 'white' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, paddingBottom: 24 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(name || '?')[0]}
              {(name?.split(' ')[1] || '')[0] || ''}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{name}</h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 6,
                  flexWrap: 'wrap',
                }}
              >
                {subtitle !== '—' && (
                  <span style={{ fontSize: 14, color: '#94A3B8' }}>{subtitle}</span>
                )}
                {subtitle !== '—' && companyName !== '—' && (
                  <span style={{ color: '#475569' }}>·</span>
                )}
                {companyName !== '—' && (
                  <span style={{ fontSize: 14, color: '#94A3B8' }}>{companyName}</span>
                )}
                {entity.status && (
                  <>
                    <span style={{ color: '#475569' }}>·</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '3px 10px',
                        borderRadius: 4,
                        background: '#10B98120',
                        color: '#34D399',
                      }}
                    >
                      {entity.status}
                    </span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                {entity.email && (
                  <a
                    href={`mailto:${entity.email}`}
                    style={{ fontSize: 13, color: '#60A5FA', textDecoration: 'none' }}
                  >
                    {entity.email}
                  </a>
                )}
                {entity.phone && (
                  <span style={{ fontSize: 13, color: '#94A3B8' }}>{entity.phone}</span>
                )}
                {(entity.city || entity.state) && (
                  <span style={{ fontSize: 13, color: '#94A3B8' }}>
                    📍 {[entity.city, entity.state].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>
            {entity.score != null && (
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <ScoreRing score={entity.score} />
                <div
                  style={{
                    fontSize: 10,
                    color: '#94A3B8',
                    marginTop: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Lead Score
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #1E293B' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '12px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: activeTab === t.id ? 'white' : '#64748B',
                  borderBottom: activeTab === t.id ? '2px solid #3B82F6' : '2px solid transparent',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
                {t.id === 'activity' && activities.length > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      background: '#334155',
                      padding: '1px 6px',
                      borderRadius: 8,
                    }}
                  >
                    {activities.length}
                  </span>
                )}
                {t.id === 'notes' && notes.length > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      background: '#334155',
                      padding: '1px 6px',
                      borderRadius: 8,
                    }}
                  >
                    {notes.length}
                  </span>
                )}
                {t.id === 'deals' && opportunities.length > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      background: '#334155',
                      padding: '1px 6px',
                      borderRadius: 8,
                    }}
                  >
                    {opportunities.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Content ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 32px 60px' }}>
        {/* ── OVERVIEW ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
                marginBottom: 28,
              }}
            >
              <StatCard
                label="Pipeline Value"
                value={`$${(summary.total_pipeline_value || 0).toLocaleString()}`}
                sub={`${opportunities.length} active deal${opportunities.length !== 1 ? 's' : ''}`}
                color={C.success}
              />
              <StatCard
                label="Days in Pipeline"
                value={summary.days_in_pipeline ?? '—'}
                sub={
                  entity.created_date || entity.created_at
                    ? `Since ${formatDate(entity.created_date || entity.created_at)}`
                    : ''
                }
              />
              <StatCard
                label="Last Activity"
                value={
                  summary.days_since_activity != null ? `${summary.days_since_activity}d ago` : '—'
                }
                sub={formatDate(entity.last_activity_at)}
                color={(summary.days_since_activity || 0) > 14 ? C.warning : C.ink}
              />
              <StatCard
                label="Source"
                value={entity.source || entity.lead_source || 'Direct'}
                sub={entity.tags?.join?.(', ') || ''}
              />
            </div>

            {/* AI Summary */}
            <EntityAiSummaryCard
              entityType={entityType}
              entityId={entityId}
              entityLabel={name}
              aiSummary={aiSummary}
              aiSummaryLoading={aiSummaryLoading}
              lastUpdated={aiSummaryUpdatedAt || entity.updated_at}
              profile={entity}
              relatedData={{ opportunities, activities, notes }}
            />

            {/* Journey + CARE */}
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}
            >
              <div
                style={{
                  background: C.card,
                  borderRadius: 14,
                  padding: '20px 24px',
                  border: `1px solid ${C.border}`,
                }}
              >
                <SectionHeader icon="🗺️" title="Pipeline Journey" />
                <PipelineJourney journey={journey} />
              </div>
              <div
                style={{
                  background: C.card,
                  borderRadius: 14,
                  padding: '20px 24px',
                  border: `1px solid ${C.border}`,
                }}
              >
                <SectionHeader icon="💚" title="Relationship State" />
                <CareStateTimeline timeline={careTimeline} />
                <div
                  style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.borderLight}` }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
                    🔄 Assignment History
                  </div>
                  <AssignmentHistory assignments={assignments} />
                </div>
              </div>
            </div>

            {/* Recent activities preview */}
            <div
              style={{
                background: C.card,
                borderRadius: 14,
                padding: '20px 24px',
                border: `1px solid ${C.border}`,
              }}
            >
              <SectionHeader icon="⚡" title="Recent Activity" count={activities.length || null} />
              {activities.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activities.slice(0, 4).map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: C.cardAlt,
                        border: `1px solid ${C.borderLight}`,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{ACTIVITY_ICONS[a.type] || '📋'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                          {a.subject}
                        </div>
                        <div style={{ fontSize: 11, color: C.inkLight }}>
                          {formatDate(a.due_date || a.created_at)} ·{' '}
                          {a.assigned_to_name || 'Unassigned'}
                        </div>
                      </div>
                      <ActivityBadge status={a.status} />
                    </div>
                  ))}
                  {activities.length > 4 && (
                    <button
                      onClick={() => setActiveTab('activity')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.accent,
                        marginTop: 8,
                        padding: 0,
                        fontFamily: 'inherit',
                      }}
                    >
                      View all {activities.length} activities →
                    </button>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>
                  No activities yet
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── JOURNEY ──────────────────────────────────────────────── */}
        {activeTab === 'journey' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            <div
              style={{
                background: C.card,
                borderRadius: 14,
                padding: '24px 28px',
                border: `1px solid ${C.border}`,
              }}
            >
              <SectionHeader icon="🗺️" title="Full Pipeline Journey" />
              <PipelineJourney journey={journey} />
            </div>
            <div>
              <div
                style={{
                  background: C.card,
                  borderRadius: 14,
                  padding: '20px 24px',
                  border: `1px solid ${C.border}`,
                  marginBottom: 20,
                }}
              >
                <SectionHeader icon="💚" title="CARE State" />
                <CareStateTimeline timeline={careTimeline} />
              </div>
              <div
                style={{
                  background: C.card,
                  borderRadius: 14,
                  padding: '20px 24px',
                  border: `1px solid ${C.border}`,
                }}
              >
                <SectionHeader icon="🔄" title="Assignments" count={assignments.length || null} />
                <AssignmentHistory assignments={assignments} />
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITY ─────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div
            style={{
              background: C.card,
              borderRadius: 14,
              padding: '24px 28px',
              border: `1px solid ${C.border}`,
            }}
          >
            <SectionHeader icon="⚡" title="All Activities" count={activities.length || null} />
            {activities.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {activities.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 10,
                      background: C.cardAlt,
                      border: `1px solid ${C.borderLight}`,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                    >
                      <span style={{ fontSize: 20 }}>{ACTIVITY_ICONS[a.type] || '📋'}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
                        {a.subject}
                      </span>
                      <span style={{ marginLeft: 'auto' }}>
                        <ActivityBadge status={a.status} />
                      </span>
                    </div>
                    {a.body && (
                      <p
                        style={{
                          fontSize: 13,
                          color: C.inkMuted,
                          margin: '0 0 8px',
                          lineHeight: 1.5,
                        }}
                      >
                        {a.body}
                      </p>
                    )}
                    <div style={{ fontSize: 11, color: C.inkLight }}>
                      {a.type} · {formatDate(a.due_date || a.created_at)} ·{' '}
                      {a.assigned_to_name || 'Unassigned'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>
                No activities yet
              </p>
            )}
          </div>
        )}

        {/* ── NOTES ────────────────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div
            style={{
              background: C.card,
              borderRadius: 14,
              padding: '24px 28px',
              border: `1px solid ${C.border}`,
            }}
          >
            <SectionHeader icon="📝" title="Notes" count={notes.length || null} />
            {notes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 10,
                      borderLeft: `3px solid ${C.accent}`,
                      background: C.cardAlt,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
                      {n.title}
                    </div>
                    <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.6 }}>
                      {n.content}
                    </p>
                    <div style={{ fontSize: 10, color: C.inkLight, marginTop: 8 }}>
                      {formatDateTime(n.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>No notes yet</p>
            )}
          </div>
        )}

        {/* ── DEALS ────────────────────────────────────────────────── */}
        {activeTab === 'deals' && (
          <div
            style={{
              background: C.card,
              borderRadius: 14,
              padding: '24px 28px',
              border: `1px solid ${C.border}`,
            }}
          >
            <SectionHeader icon="💰" title="Opportunities" count={opportunities.length || null} />
            {opportunities.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {opportunities.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      padding: '20px 24px',
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{o.name}</span>
                      <span style={{ marginLeft: 'auto' }}>
                        <StageBadge stage={o.stage} />
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
                      {o.amount != null && (
                        <div>
                          <span style={{ color: C.inkLight }}>Value </span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: C.success,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            ${Number(o.amount).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {o.probability != null && (
                        <div>
                          <span style={{ color: C.inkLight }}>Probability </span>
                          <span
                            style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {o.probability}%
                          </span>
                        </div>
                      )}
                      {o.close_date && (
                        <div>
                          <span style={{ color: C.inkLight }}>Close </span>
                          <span style={{ fontWeight: 500 }}>{formatDate(o.close_date)}</span>
                        </div>
                      )}
                    </div>
                    {o.next_step && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: '8px 12px',
                          borderRadius: 6,
                          background: C.cardAlt,
                          fontSize: 12,
                          color: C.inkMuted,
                        }}
                      >
                        <span style={{ fontWeight: 600, color: C.ink }}>Next: </span>
                        {o.next_step}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: C.inkLight, fontStyle: 'italic' }}>
                No opportunities yet
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
