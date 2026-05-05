import { useState, useEffect, useCallback } from 'react';
import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import BookingWidget from '../scheduling/BookingWidget';
import SendDocumentDialog from '../docuseal/SendDocumentDialog';
import { Star, Phone, Mail, CalendarCheck, FileSignature, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CustomFieldsDisplay } from '../shared/CustomFieldsDisplay';
import ErrorBoundary from '../shared/ErrorBoundary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { universalAICall, getAuthorizationHeader } from '@/api/functions';
import { generateAIEmailDraft } from '@/api/functions';
import { sendAIEmail } from '@/api/functions';
import { getBackendUrl } from '@/api/backendUrl';
import { toast } from 'sonner';

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

export default function ContactDetailPanel({
  contact,
  accountId,
  accountName,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  user,
}) {
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [callPrompt, setCallPrompt] = useState('');
  const [emailPrompt, setEmailPrompt] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [showSendDocDialog, setShowSendDocDialog] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const contactId = contact?.id;

  const loadSubmissions = useCallback(async () => {
    if (!contactId) return;
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

      const url = `${BACKEND_URL}/api/docuseal/submissions?related_to=contact&related_id=${encodeURIComponent(
        contactId,
      )}`;
      const resp = await fetch(url, { headers, credentials: 'include' });
      if (!resp.ok) {
        // Don't toast spam on poll errors; surface only when not 404/501 etc.
        return;
      }
      const json = await resp.json().catch(() => ({}));
      const list = Array.isArray(json) ? json : json?.data || json?.submissions || [];
      setSubmissions(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error loading DocuSeal submissions:', err);
    }
  }, [contactId]);

  useEffect(() => {
    if (!open || !contactId) return undefined;
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
  }, [open, contactId, loadSubmissions]);

  if (!contact) {
    return null;
  }

  const handleMakeCall = () => {
    if (!contact.phone && !contact.mobile) {
      toast.error('No phone number available for this contact');
      return;
    }
    setCallPrompt(
      `Call ${contact.first_name} ${contact.last_name} from ${accountName || contact.account_name || 'their company'} for a follow-up conversation.`,
    );
    setShowCallDialog(true);
  };

  const handleInitiateCall = async () => {
    if (!callPrompt.trim()) {
      toast.error('Please provide a call objective');
      return;
    }

    const phone = contact.phone || contact.mobile;
    setIsCalling(true);
    try {
      await universalAICall({
        contactPhone: phone,
        contactName: `${contact.first_name} ${contact.last_name}`,
        prompt: callPrompt,
        callObjective: 'follow_up',
      });
      toast.success('AI call initiated successfully');
      setShowCallDialog(false);
    } catch (error) {
      console.error('Error initiating call:', error);
      toast.error(`Failed to initiate call: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCalling(false);
    }
  };

  const handleComposeEmail = () => {
    if (!contact.email) {
      toast.error('No email address available for this contact');
      return;
    }
    setEmailPrompt(
      `Write a professional follow-up email to ${contact.first_name} ${contact.last_name} from ${accountName || contact.account_name || 'their company'}.`,
    );
    setEmailDraft('');
    setShowEmailDialog(true);
  };

  const handleGenerateEmail = async () => {
    if (!emailPrompt.trim()) {
      toast.error('Please provide email instructions');
      return;
    }

    setIsGeneratingEmail(true);
    try {
      const response = await generateAIEmailDraft({
        recipientEmail: contact.email,
        recipientName: `${contact.first_name} ${contact.last_name}`,
        context: `Contact from ${accountName || contact.account_name || 'company'}, current status: ${contact.status}`,
        prompt: emailPrompt,
      });

      if (response.data && response.data.draft) {
        setEmailDraft(response.data.draft);
        toast.success('Email draft generated successfully');
      } else {
        throw new Error('Failed to generate email draft');
      }
    } catch (error) {
      console.error('Error generating email:', error);
      toast.error(`Failed to generate email: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailDraft.trim()) {
      toast.error('Please generate an email draft first');
      return;
    }

    setIsSendingEmail(true);
    try {
      await sendAIEmail({
        entityType: 'contact',
        entityId: contact.id,
        to: contact.email,
        subject: `Follow-up: ${contact.first_name} ${contact.last_name}`,
        body: emailDraft,
      });
      toast.success('Email sent successfully');
      setShowEmailDialog(false);
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(`Failed to send email: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleViewAccount = (e) => {
    if (e) e.preventDefault();
    if (!accountId) {
      console.log('No accountId provided');
      return;
    }

    // Navigate to Accounts page with accountId query parameter
    // The Accounts page will automatically open the AccountDetailPanel
    window.location.href = `/Accounts?accountId=${accountId}`;
  };

  const customActions = [];

  if (contact.phone || contact.mobile) {
    customActions.push({
      label: 'Make AI Call',
      icon: <Phone className="w-4 h-4" />,
      onClick: handleMakeCall,
    });
  }

  if (contact.email) {
    customActions.push({
      label: 'Compose AI Email',
      icon: <Mail className="w-4 h-4" />,
      onClick: handleComposeEmail,
    });
  }

  customActions.push({
    label: 'Send Document',
    icon: <FileSignature className="w-4 h-4" />,
    onClick: () => setShowSendDocDialog(true),
  });

  customActions.push({
    label: 'Convert to Lead',
    icon: <Star className="w-4 h-4" />,
    onClick: (contact) => {
      console.log('Convert to lead:', contact);
    },
  });

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
            // URL (`signed_document_url`). The mirror survives a DocuSeal
            // volume loss; the DocuSeal URL does not. Falls back to the
            // DocuSeal URL if the mirror hasn't run yet (e.g., right after
            // completion before the storage upload finishes).
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
      <ErrorBoundary variant="inline" label={`ContactDetailPanel[id=${contact?.id}]`}>
        <UniversalDetailPanel
          entity={contact}
          entityType="contact"
          open={open}
          onOpenChange={onOpenChange}
          onEdit={onEdit}
          onDelete={onDelete}
          user={user}
          displayData={{
            'Account Name': accountId ? (
              <button
                onClick={handleViewAccount}
                className="text-blue-400 hover:text-blue-300 hover:underline text-left mt-1 cursor-pointer"
              >
                {accountName || contact.account_name || 'Unknown Account'}
              </button>
            ) : accountName || contact.account_name ? (
              <p className="text-slate-200 font-medium mt-1">
                {accountName || contact.account_name}
              </p>
            ) : (
              <p className="text-slate-500 italic mt-1">No account linked</p>
            ),
            'Assigned To': (
              <p className="text-slate-200 font-medium mt-1">
                {assignedUserName ||
                  contact.assigned_to_name ||
                  contact.assigned_to ||
                  'Unassigned'}
              </p>
            ),
          }}
          customActions={customActions}
          showNotes={true}
          customSections={[
            {
              content: (
                <CustomFieldsDisplay entityType="Contact" metadata={contact.metadata} showHeader />
              ),
            },
            {
              title: 'Session Booking',
              icon: <CalendarCheck className="w-4 h-4" />,
              content: (
                <BookingWidget
                  contactName={`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                  contactEmail={contact.email}
                  contactId={contact.id}
                  tenantId={contact.tenant_id || user?.tenant_id}
                  assignedTo={contact.assigned_to}
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

      <Dialog open={showCallDialog} onOpenChange={setShowCallDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Make AI Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">
                Calling: {contact.first_name} {contact.last_name}
              </Label>
              <p className="text-sm text-slate-400 mt-1">
                Phone: {contact.phone || contact.mobile}
              </p>
            </div>
            <div>
              <Label htmlFor="callPrompt" className="text-slate-300">
                Call Objective
              </Label>
              <Textarea
                id="callPrompt"
                value={callPrompt}
                onChange={(e) => setCallPrompt(e.target.value)}
                placeholder="Describe what you want to accomplish in this call..."
                className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCallDialog(false)}
              className="bg-slate-700 border-slate-600 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInitiateCall}
              disabled={isCalling || !callPrompt.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCalling ? 'Initiating...' : 'Make Call'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Compose AI Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">
                To: {contact.first_name} {contact.last_name}
              </Label>
              <p className="text-sm text-slate-400 mt-1">{contact.email}</p>
            </div>
            <div>
              <Label htmlFor="emailPrompt" className="text-slate-300">
                Email Instructions
              </Label>
              <Textarea
                id="emailPrompt"
                value={emailPrompt}
                onChange={(e) => setEmailPrompt(e.target.value)}
                placeholder="Describe what you want to say in this email..."
                className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                rows={3}
              />
              <Button
                onClick={handleGenerateEmail}
                disabled={isGeneratingEmail || !emailPrompt.trim()}
                className="mt-2 bg-green-600 hover:bg-green-700"
                size="sm"
              >
                {isGeneratingEmail ? 'Generating...' : 'Generate Draft'}
              </Button>
            </div>
            {emailDraft && (
              <div>
                <Label htmlFor="emailDraft" className="text-slate-300">
                  Email Draft
                </Label>
                <Textarea
                  id="emailDraft"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                  rows={8}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEmailDialog(false)}
              className="bg-slate-700 border-slate-600 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={isSendingEmail || !emailDraft.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSendingEmail ? 'Sending...' : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendDocumentDialog
        open={showSendDocDialog}
        onOpenChange={setShowSendDocDialog}
        relatedTo="contact"
        relatedId={contact.id}
        defaultRecipientName={`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
        defaultRecipientEmail={contact.email || ''}
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
