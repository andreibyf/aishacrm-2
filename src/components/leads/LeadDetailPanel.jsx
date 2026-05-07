import { useState, useEffect, useCallback } from 'react';
import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import {
  Building2,
  UserCheck,
  CalendarCheck,
  FileSignature,
  FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AssignmentHistory from './AssignmentHistory';
import BookingWidget from '../scheduling/BookingWidget';
import SendDocumentDialog from '../docuseal/SendDocumentDialog';
import { CustomFieldsDisplay } from '../shared/CustomFieldsDisplay';
import ErrorBoundary from '../shared/ErrorBoundary';
import { getAuthorizationHeader } from '@/api/functions';
import { getBackendUrl } from '@/api/backendUrl';

// Mirror of ContactDetailPanel's status palette so the Document Signatures
// section looks identical across Contact / Lead / Account / Opportunity (4VD-6).
const DOCUSEAL_STATUS_BADGE_CLASS = {
  pending: 'bg-blue-100 text-blue-800 border border-blue-200',
  sent: 'bg-blue-100 text-blue-800 border border-blue-200',
  viewed: 'bg-amber-100 text-amber-800 border border-amber-200',
  signed: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-green-100 text-green-800 border border-green-200',
  declined: 'bg-red-100 text-red-800 border border-red-200',
  expired: 'bg-red-100 text-red-800 border border-red-200',
  failed: 'bg-red-100 text-red-800 border border-red-200',
};

function getDocuSealStatusClass(status) {
  return (
    DOCUSEAL_STATUS_BADGE_CLASS[String(status || '').toLowerCase()] ||
    'bg-slate-100 text-slate-800 border border-slate-200'
  );
}

function formatDocuSealDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function LeadDetailPanel({
  lead,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onConvert,
  user,
  associatedAccountName,
}) {
  const [showSendDocDialog, setShowSendDocDialog] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const leadId = lead?.id;

  const loadSubmissions = useCallback(async () => {
    if (!leadId) return;
    try {
      const BACKEND_URL = getBackendUrl();
      const headers = { 'Content-Type': 'application/json' };
      const authHeader = await getAuthorizationHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      const tenantId =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id') || ''
          : '';
      if (tenantId) {
        headers['x-tenant-id'] = tenantId;
      }

      const url = `${BACKEND_URL}/api/docuseal/submissions?related_to=lead&related_id=${encodeURIComponent(
        leadId,
      )}`;
      const resp = await fetch(url, { headers, credentials: 'include' });
      if (!resp.ok) {
        // Silent on poll errors so we don't toast-spam.
        return;
      }
      const json = await resp.json().catch(() => ({}));
      const list = Array.isArray(json) ? json : json?.data || json?.submissions || [];
      setSubmissions(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error loading DocuSeal submissions:', err);
    }
  }, [leadId]);

  useEffect(() => {
    if (!open || !leadId) return undefined;
    let cancelled = false;
    setSubmissionsLoading(true);
    (async () => {
      await loadSubmissions();
      if (!cancelled) setSubmissionsLoading(false);
    })();
    const interval = setInterval(loadSubmissions, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, leadId, loadSubmissions]);

  if (!lead) {
    return null;
  }

  // Debug: Log account information
  console.log('[LeadDetailPanel] Debug:', {
    lead,
    associatedAccountName,
    account_id: lead.account_id,
    metadata_account_id: lead.metadata?.account_id,
    metadata: lead.metadata,
  });

  // UniversalDetailPanel expects action descriptors (not rendered <Button> elements):
  // { label, icon, onClick }. Passing JSX elements here previously caused an empty
  // button to render because UniversalDetailPanel would try to read .label/.icon
  // from a React element object (both undefined).
  const customActions = [];

  if (lead.status !== 'converted') {
    customActions.push({
      label: 'Convert to Contact',
      icon: <UserCheck className="w-4 h-4" />,
      onClick: () => onConvert(lead),
    });
  }

  // Send Document is available regardless of lead status — sales workflows
  // routinely require an NDA or contract before conversion is possible.
  customActions.push({
    label: 'Send Document',
    icon: <FileSignature className="w-4 h-4" />,
    onClick: () => setShowSendDocDialog(true),
  });

  const detailDisplayData = {
    'Associated Account': associatedAccountName ? (
      <div className="text-slate-200 font-medium mt-1 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-slate-400" />
        {associatedAccountName}
      </div>
    ) : (
      <div className="text-slate-500 italic mt-1">No associated account</div>
    ),
    'Assigned To': (
      <p className="text-slate-200 font-medium mt-1">{assignedUserName || 'Unassigned'}</p>
    ),
    'Assignment History': (
      <AssignmentHistory entityId={lead.id} entityType="lead" tenantId={lead.tenant_id} />
    ),
  };

  const documentSignaturesSection = (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
      {submissionsLoading && submissions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading documents...</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No documents sent yet.</p>
      ) : (
        <ul className="space-y-3">
          {submissions.map((s) => {
            const status = String(s.status || 'pending').toLowerCase();
            const templateName =
              s.template_name || s.template_title || s.template_id || 'Document';
            const recipient = s.recipient_email || s.recipient_name || '';
            const sentAt = s.sent_at || s.created_at || s.created_date;
            // Prefer the durable Supabase Storage mirror (`mirror_url`,
            // populated by the webhook step 8b mirror) over DocuSeal's hosted
            // URL (`signed_document_url`). Falls back to the DocuSeal URL
            // if the mirror hasn't run yet.
            const signedHref = s.mirror_url || s.signed_document_url;
            const showSigned = (status === 'completed' || status === 'signed') && signedHref;
            return (
              <li
                key={s.id || `${s.template_id}-${sentAt}`}
                className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {templateName}
                    </span>
                  </div>
                  {recipient && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-6 truncate">
                      {recipient}
                    </p>
                  )}
                  {sentAt && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-6">
                      Sent {formatDocuSealDate(sentAt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-6 sm:ml-0 mt-1 sm:mt-0">
                  <Badge className={getDocuSealStatusClass(status)}>{status}</Badge>
                  {showSigned && (
                    <a
                      href={signedHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-400 hover:underline"
                    >
                      View signed PDF
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <ErrorBoundary variant="inline" label={`LeadDetailPanel[id=${lead?.id}]`}>
        <UniversalDetailPanel
          entity={lead}
          entityType="lead"
          open={open}
          onOpenChange={onOpenChange}
          onEdit={onEdit}
          onDelete={onDelete}
          user={user}
          displayData={detailDisplayData}
          customActions={customActions}
          showNotes={true}
          customSections={[
            {
              content: <CustomFieldsDisplay entityType="Lead" metadata={lead.metadata} showHeader />,
            },
            {
              title: 'Session Booking',
              icon: <CalendarCheck className="w-4 h-4" />,
              content: (
                <BookingWidget
                  contactName={`${lead.first_name || ''} ${lead.last_name || ''}`.trim()}
                  contactEmail={lead.email}
                  leadId={lead.id}
                  tenantId={lead.tenant_id || user?.tenant_id}
                  assignedTo={lead.assigned_to}
                  fallbackLinkedUserId={user?.id || user?.user_id}
                  fallbackUserEmail={user?.email}
                />
              ),
            },
            {
              title: 'Document signatures',
              icon: <FileSignature className="w-4 h-4" />,
              content: documentSignaturesSection,
            },
          ]}
        />
      </ErrorBoundary>

      <SendDocumentDialog
        open={showSendDocDialog}
        onOpenChange={setShowSendDocDialog}
        relatedTo="lead"
        relatedId={lead.id}
        defaultRecipientName={`${lead.first_name || ''} ${lead.last_name || ''}`.trim()}
        defaultRecipientEmail={lead.email || ''}
        onSent={(submission) => {
          if (submission && typeof submission === 'object') {
            setSubmissions((prev) => [submission, ...prev]);
          }
          loadSubmissions();
        }}
      />
    </>
  );
}
