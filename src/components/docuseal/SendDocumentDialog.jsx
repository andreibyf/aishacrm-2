import { useEffect, useState } from 'react';
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

  // Reset/refresh form whenever the dialog opens
  useEffect(() => {
    if (open) {
      setTemplateId('');
      setRecipientName(defaultRecipientName || '');
      setRecipientEmail(defaultRecipientEmail || '');
      setMessage('');
      setConfigError(false);
      setSending(false);
    }
  }, [open, defaultRecipientName, defaultRecipientEmail]);

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
      toast.success('Document sent for signature');
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
            <Label htmlFor="docuseal-template-id" className="text-slate-300">
              Template ID <span className="text-red-400">*</span>
            </Label>
            <Input
              id="docuseal-template-id"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Paste the DocuSeal template ID"
              className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
              disabled={sending}
              required
            />
            <p className="text-xs text-slate-400 mt-1">
              MVP: paste the template ID from your DocuSeal admin UI. A template picker is coming
              soon.
            </p>
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
