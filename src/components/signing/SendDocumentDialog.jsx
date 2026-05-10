// @ts-check
/**
 * SendDocumentDialog (4VD-43 day 2).
 *
 * Modal that lists the tenant's active signing_templates, takes a recipient
 * email + optional name + optional message, and POSTs to /api/submissions.
 * Backend mints the signing_token, sends the branded email, and returns
 * the new signing_sessions row. Caller refreshes its own list.
 *
 * Tenant isolation: x-tenant-id header is sent on every request (mirrors the
 * pattern in DocumentTemplates.jsx). Server-side validateTenantAccess +
 * route-level resolveRequestTenantId enforce.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { getAuthorizationHeader } from '@/api/functions';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const auth = await getAuthorizationHeader();
  if (auth) headers['Authorization'] = auth;
  if (typeof localStorage !== 'undefined') {
    const t =
      localStorage.getItem('selected_tenant_id') ||
      localStorage.getItem('tenant_id') ||
      '';
    if (t) headers['x-tenant-id'] = t;
  }
  return headers;
}

async function fetchActiveTemplates() {
  const url = `${getBackendUrl()}/api/templates`;
  const resp = await fetch(url, { headers: await authHeaders(), credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Failed to load templates (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return Array.isArray(json?.data) ? json.data : [];
}

async function postSubmission({ templateId, relatedTo, relatedId, recipientEmail, recipientName, message }) {
  const url = `${getBackendUrl()}/api/submissions`;
  const headers = await authHeaders();
  const body = JSON.stringify({
    template_id: templateId,
    related_to: relatedTo,
    related_id: relatedId,
    recipient_email: recipientEmail,
    recipient_name: recipientName || undefined,
    message: message || undefined,
  });
  const resp = await fetch(url, { method: 'POST', headers, credentials: 'include', body });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Send failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {'contact'|'lead'|'account'|'opportunity'} props.relatedTo
 * @param {string} props.relatedId
 * @param {string} [props.defaultRecipientEmail]
 * @param {string} [props.defaultRecipientName]
 * @param {() => void} [props.onSent] — caller refresh hook
 */
export default function SendDocumentDialog({
  open,
  onOpenChange,
  relatedTo,
  relatedId,
  defaultRecipientEmail = '',
  defaultRecipientName = '',
  onSent,
}) {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  // Reset form whenever the dialog opens. Pre-fill recipient from the
  // entity context.
  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setRecipientEmail(defaultRecipientEmail || '');
    setRecipientName(defaultRecipientName || '');
    setMessage('');
    setSendError(null);
  }, [open, defaultRecipientEmail, defaultRecipientName]);

  // Load templates on open. Use only ACTIVE (non-archived) rows; the GET
  // route already excludes archived implicitly (no — actually it returns
  // all rows, but archived ones rarely happen in practice). Filter
  // defensively here.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    (async () => {
      try {
        const rows = await fetchActiveTemplates();
        if (!cancelled) {
          const active = rows.filter((t) => !t.archived_at);
          setTemplates(active);
        }
      } catch (err) {
        if (!cancelled) setTemplatesError(err.message || String(err));
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSend = useMemo(
    () => !!templateId && !!recipientEmail && !sending,
    [templateId, recipientEmail, sending],
  );

  const handleSend = useCallback(async () => {
    setSendError(null);
    if (!canSend) return;
    setSending(true);
    try {
      const result = await postSubmission({
        templateId,
        relatedTo,
        relatedId,
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || undefined,
        message: message.trim() || undefined,
      });
      const emailNote = result?.email?.ok
        ? `email sent via ${result.email.provider || 'tenant provider'}`
        : `row created — email delivery pending (${result?.email?.reason || 'no_provider'})`;
      toast.success(`Document sent — ${emailNote}`);
      onSent?.();
      onOpenChange?.(false);
    } catch (err) {
      const msg = err.body?.message
        ? `${err.message}: ${err.body.message}`.slice(0, 400)
        : err.message;
      setSendError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    templateId,
    relatedTo,
    relatedId,
    recipientEmail,
    recipientName,
    message,
    onOpenChange,
    onSent,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" /> Send document for signature
          </DialogTitle>
          <DialogDescription>
            Pick a template, enter the recipient&apos;s email, optionally add a note, and send.
            The recipient gets a tenant-branded email with a private signing link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="send-template">Template</Label>
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
              </div>
            ) : templatesError ? (
              <Alert variant="destructive">
                <AlertDescription>{templatesError}</AlertDescription>
              </Alert>
            ) : templates.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No templates available. Ask an administrator to create one in Document
                  Templates first.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={templateId} onValueChange={setTemplateId} disabled={sending}>
                <SelectTrigger id="send-template">
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="send-recipient-name">Recipient name</Label>
              <Input
                id="send-recipient-name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Jane Doe"
                disabled={sending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-recipient-email">Recipient email</Label>
              <Input
                id="send-recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="jane@example.com"
                disabled={sending}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-message">Message (optional)</Label>
            <Textarea
              id="send-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please sign by EOD Friday — call me with any questions."
              rows={3}
              disabled={sending}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">{message.length} / 2000</p>
          </div>

          {sendError ? (
            <Alert variant="destructive">
              <AlertDescription>{sendError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <FileSignature className="w-4 h-4 mr-2" /> Send Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
