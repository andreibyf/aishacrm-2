import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { getAuthorizationHeader } from '@/api/functions';

/**
 * SendDocumentDialog
 *
 * Minimal MVP dialog for sending DocuSeal e-signature requests tied to a CRM entity.
 *
 * Props:
 *   - open                    : bool
 *   - onOpenChange            : (bool) => void
 *   - relatedTo               : 'contact' | 'lead' | 'account' | 'opportunity'
 *   - relatedId               : string
 *   - defaultRecipientName    : string  (pre-filled, editable)
 *   - defaultRecipientEmail   : string  (pre-filled, editable)
 *   - onSent                  : (submission) => void  called after a successful send
 */
export default function SendDocumentDialog({
  open,
  onOpenChange,
  relatedTo,
  relatedId,
  defaultRecipientName = '',
  defaultRecipientEmail = '',
  onSent,
}) {
  const [templateId, setTemplateId] = useState('');
  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [configError, setConfigError] = useState(false);

  // 4VD-8: dropdown of templates fetched from the tenant's DocuSeal account.
  // The list is tenant-isolated server-side: GET /api/docuseal/templates
  // resolves the per-tenant API key from tenant_integrations and proxies to
  // DocuSeal — DocuSeal Community filters templates by the user owning the
  // key, so this list never contains another tenant's templates.
  //
  // Three template-input modes:
  //   'loading'  : initial fetch in flight
  //   'dropdown' : list rendered, user picks by name
  //   'paste'    : fallback (config missing or upstream error) — paste field
  // The 'paste' mode preserves the MVP behaviour so the dialog never becomes
  // unusable when something upstream is misconfigured.
  const [templateMode, setTemplateMode] = useState('loading');
  const [templates, setTemplates] = useState([]);
  const [templatesError, setTemplatesError] = useState('');

  const fetchTemplates = useCallback(async ({ refresh = false } = {}) => {
    setTemplateMode('loading');
    setTemplatesError('');
    try {
      const BACKEND_URL = getBackendUrl();
      const headers = {};
      const authHeader = await getAuthorizationHeader();
      if (authHeader) headers['Authorization'] = authHeader;
      const tenantId =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id') || ''
          : '';
      if (tenantId) headers['x-tenant-id'] = tenantId;

      const url = `${BACKEND_URL}/api/docuseal/templates${refresh ? '?refresh=1' : ''}`;
      const resp = await fetch(url, { headers, credentials: 'include' });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        if (resp.status === 400 && json?.error === 'docuseal_not_configured') {
          setConfigError(true);
          setTemplateMode('paste');
          return;
        }
        // Any other error: fall back to paste mode so the user can still send.
        setTemplatesError(json?.error || `Failed to load templates (${resp.status})`);
        setTemplateMode('paste');
        return;
      }

      const list = Array.isArray(json?.data) ? json.data : [];
      setTemplates(list);
      // Empty list isn't an error — it means the tenant hasn't created any
      // templates in DocuSeal yet. Render the dropdown anyway so the user
      // sees an empty-state hint, but allow them to escape to paste mode.
      setTemplateMode('dropdown');
    } catch (err) {
      console.error('Error loading DocuSeal templates:', err);
      setTemplatesError(err?.message || 'Network error');
      setTemplateMode('paste');
    }
  }, []);

  // Reset/refresh form whenever the dialog opens
  useEffect(() => {
    if (open) {
      setTemplateId('');
      setRecipientName(defaultRecipientName || '');
      setRecipientEmail(defaultRecipientEmail || '');
      setMessage('');
      setConfigError(false);
      setSending(false);
      setTemplates([]);
      setTemplatesError('');
      fetchTemplates();
    }
  }, [open, defaultRecipientName, defaultRecipientEmail, fetchTemplates]);

  const handleSend = async () => {
    if (!templateId.trim()) {
      toast.error('Template ID is required');
      return;
    }
    if (!recipientEmail.trim()) {
      toast.error('Recipient email is required');
      return;
    }

    setSending(true);
    setConfigError(false);

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

      const body = {
        template_id: templateId.trim(),
        related_to: relatedTo,
        related_id: relatedId,
        recipient_email: recipientEmail.trim(),
        recipient_name: recipientName.trim(),
      };
      if (message.trim()) {
        body.message = message.trim();
      }

      const resp = await fetch(`${BACKEND_URL}/api/docuseal/submissions`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = json?.message || json?.error || `Failed to send document (${resp.status})`;
        if (resp.status === 400 && /docuseal not configured/i.test(msg)) {
          setConfigError(true);
        } else {
          toast.error(msg);
        }
        return;
      }

      const submission = json?.data || json?.submission || json;
      // 4VD-7: backend now returns { signing_url, email_sent, email_reason }
      // alongside the submission row. Show different UX for the two paths
      // so the user knows whether they need to share the link manually.
      if (submission?.email_sent === false) {
        const reason = submission?.email_reason;
        const reasonText =
          reason === 'no_provider'
            ? "this tenant doesn't have an SMTP provider configured"
            : reason === 'send_failed'
              ? 'the SMTP provider rejected the message'
              : `email skipped (${reason || 'unknown'})`;
        if (submission?.signing_url) {
          toast.success(
            `Document created. Email not sent — ${reasonText}. Copy the signing link to share manually.`,
            {
              duration: 12000,
              action: {
                label: 'Copy link',
                onClick: () => {
                  navigator.clipboard?.writeText(submission.signing_url).catch(() => {});
                  toast.success('Signing link copied to clipboard');
                },
              },
            },
          );
        } else {
          toast.warning(`Document created, but no signing URL was generated.`);
        }
      } else {
        toast.success('Document sent — recipient will receive a tenant-branded email.');
      }
      if (typeof onSent === 'function') {
        onSent(submission);
      }
      onOpenChange?.(false);
    } catch (err) {
      console.error('Error sending DocuSeal submission:', err);
      toast.error(`Failed to send document: ${err?.message || 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-200 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Send Document for Signature</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {configError && (
            <div className="rounded-md border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200">
              DocuSeal is not configured for this tenant. Please configure it in{' '}
              <a
                href="/Settings?tab=integrations"
                className="underline text-red-100 hover:text-white"
              >
                Settings &rarr; Integrations
              </a>
              .
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="docuseal-template" className="text-slate-300">
                Template <span className="text-red-400">*</span>
              </Label>
              {templateMode === 'dropdown' && (
                <button
                  type="button"
                  onClick={() => fetchTemplates({ refresh: true })}
                  disabled={sending}
                  className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
                  title="Refresh template list (bypass cache)"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              )}
            </div>
            {templateMode === 'loading' && (
              <div className="mt-2 px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-slate-400 text-sm">
                Loading templates…
              </div>
            )}
            {templateMode === 'dropdown' && templates.length > 0 && (
              <Select
                value={templateId}
                onValueChange={setTemplateId}
                disabled={sending}
              >
                <SelectTrigger
                  id="docuseal-template"
                  className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                >
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {templateMode === 'dropdown' && templates.length === 0 && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-200">
                No templates found in DocuSeal for this tenant. Create one in DocuSeal admin, then
                click Refresh.
                <button
                  type="button"
                  onClick={() => setTemplateMode('paste')}
                  className="ml-2 text-amber-100 underline"
                >
                  Paste an ID instead
                </button>
              </div>
            )}
            {templateMode === 'paste' && (
              <>
                <Input
                  id="docuseal-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  placeholder="Paste the DocuSeal template ID"
                  className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                  disabled={sending}
                  required
                />
                <p className="text-xs text-slate-400 mt-1">
                  {templatesError
                    ? `Couldn't load template list (${templatesError}). Paste the template ID from DocuSeal admin.`
                    : 'Paste the DocuSeal template ID from the admin UI.'}{' '}
                  <button
                    type="button"
                    onClick={() => fetchTemplates()}
                    className="text-blue-400 underline hover:text-blue-300"
                    disabled={sending}
                  >
                    Try the dropdown again
                  </button>
                </p>
              </>
            )}
          </div>

          <div>
            <Label htmlFor="docuseal-recipient-name" className="text-slate-300">
              Recipient Name
            </Label>
            <Input
              id="docuseal-recipient-name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Jane Doe"
              className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
              disabled={sending}
            />
          </div>

          <div>
            <Label htmlFor="docuseal-recipient-email" className="text-slate-300">
              Recipient Email <span className="text-red-400">*</span>
            </Label>
            <Input
              id="docuseal-recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="jane@example.com"
              className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
              disabled={sending}
              required
            />
          </div>

          <div>
            <Label htmlFor="docuseal-message" className="text-slate-300">
              Message (optional)
            </Label>
            <Textarea
              id="docuseal-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a short note for the recipient..."
              className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
              rows={3}
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={sending}
            className="bg-slate-700 border-slate-600 hover:bg-slate-600"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || !templateId.trim() || !recipientEmail.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
