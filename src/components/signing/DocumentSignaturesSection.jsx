// @ts-check
/**
 * DocumentSignaturesSection (4VD-43 day 2).
 *
 * Shared section rendering signing_sessions for a single CRM entity.
 * Used by Contact / Lead / Account / Opportunity detail panels so the
 * status badge palette + layout are consistent everywhere.
 *
 * Status palette mirrors the previous DocuSeal-era look so the UI feels
 * unchanged from the operator's perspective; the underlying source is
 * now signing_sessions, not docuseal_submissions.
 */

import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

const STATUS_BADGE_CLASS = {
  pending: 'bg-blue-100 text-blue-800 border border-blue-200',
  viewed: 'bg-amber-100 text-amber-800 border border-amber-200',
  signed: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-green-100 text-green-800 border border-green-200',
  declined: 'bg-red-100 text-red-800 border border-red-200',
  expired: 'bg-red-100 text-red-800 border border-red-200',
};

function getStatusClass(status) {
  return (
    STATUS_BADGE_CLASS[String(status || '').toLowerCase()] ||
    'bg-slate-100 text-slate-800 border border-slate-200'
  );
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * @param {Object} props
 * @param {Array} props.sessions  — rows from GET /api/submissions
 * @param {boolean} props.loading
 * @param {string|null} [props.error]
 */
export default function DocumentSignaturesSection({ sessions, loading, error = null }) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
      {loading && sessions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading documents…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No documents sent yet.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const status = String(s.status || 'pending').toLowerCase();
            // Template name isn't denormalized onto signing_sessions yet; show
            // the template_id-shortened or a "Document" fallback. Day 6 can
            // join template name into the API response if needed.
            const label = s.template_name || `Document ${(s.template_id || '').slice(0, 8)}`;
            const recipient = s.recipient_name
              ? `${s.recipient_name} <${s.recipient_email}>`
              : s.recipient_email;
            const sentAt = s.created_at;
            const completedAt = s.completed_at || s.signed_at;
            const signedHref = s.signed_pdf_storage_path || null; // day 5 will mint a signed URL helper
            const showSigned =
              (status === 'completed' || status === 'signed') && signedHref;
            return (
              <li
                key={s.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {label}
                    </span>
                  </div>
                  {recipient && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-6 truncate">
                      {recipient}
                    </p>
                  )}
                  {sentAt && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-6">
                      Sent {formatDate(sentAt)}
                      {completedAt ? ` · Completed ${formatDate(completedAt)}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-6 sm:ml-0 mt-1 sm:mt-0">
                  <Badge className={getStatusClass(status)}>{status}</Badge>
                  {showSigned && (
                    <span
                      className="text-xs text-slate-500 dark:text-slate-400 italic"
                      title="Signed PDF available — public URL helper ships with 4VD-43 day 5"
                    >
                      signed PDF stamping ships day 5
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
