// @ts-check
/**
 * SignPage (4VD-43 day 4b) — public recipient signing page.
 *
 * Standalone page: no CRM nav, no auth, no app shell. Reached via the
 * /sign/:slug/:token route in src/pages/index.jsx; the slug is cosmetic
 * (path-level tenant disambiguation), the authoritative gate is the
 * 64-hex signing_token.
 *
 * Lifecycle:
 *   1. Mount → GET /api/sign/:token → backend stamps viewed_at + audit
 *      and returns session + template fields + signed PDF URL + tenant
 *      branding.
 *   2. Recipient fills fields, types signer name, draws signature.
 *   3. Click "Sign and submit" → "Are you sure?" modal previews exact
 *      record that will be persisted.
 *   4. Confirm → POST /api/sign/:token/submit → success page.
 *
 * Decline: button → optional reason modal → POST /api/sign/:token/decline.
 * Already-finalized states render a polite read-only view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Loader2, FileSignature, Check, X, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SignaturePad from '@/components/signing/SignaturePad';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Same fixed render width the builder uses, so normalised 0-1 areas land
// at the same pixel positions in signer mode.
const RENDER_WIDTH_PX = 720; // slightly larger than the builder for readability

const FALLBACK_PRIMARY = '#2563eb';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function backendBase() {
  return (
    (typeof window !== 'undefined' && window._env_?.VITE_AISHACRM_BACKEND_URL) ||
    import.meta.env.VITE_AISHACRM_BACKEND_URL ||
    // Public sign hits the backend directly; in dev mode without an env
    // override we infer port 4001 (Docker) or 3001 (local nodemon).
    `${typeof window !== 'undefined' ? window.location.protocol + '//' + window.location.hostname : ''}:4001`
  );
}

async function fetchSession(token) {
  const resp = await fetch(`${backendBase()}/api/sign/${encodeURIComponent(token)}`);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.error || `Failed to load (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

async function postSubmit(token, body) {
  const resp = await fetch(`${backendBase()}/api/sign/${encodeURIComponent(token)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Submit failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

async function postDecline(token, reason) {
  const resp = await fetch(`${backendBase()}/api/sign/${encodeURIComponent(token)}/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || undefined }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Decline failed (${resp.status})`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function PageShell({ branding, children }) {
  const primary = branding?.primary_color || FALLBACK_PRIMARY;
  const tenantName = branding?.tenant_name || 'Sign Document';
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt={tenantName}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div
              className="text-lg font-semibold"
              style={{ color: primary }}
            >
              {tenantName}
            </div>
          )}
          <div className="ml-auto text-xs text-slate-500 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            Secure signing session
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl">{children}</main>
    </div>
  );
}

function CenterCard({ children }) {
  return (
    <div className="bg-white border rounded-lg shadow-sm p-6 space-y-3">{children}</div>
  );
}

// ---------------------------------------------------------------------------
// PDF + field overlay renderer (signer mode)
// ---------------------------------------------------------------------------

function PdfWithFields({ pdfUrl, fields, fieldValues, setFieldValues, onSignatureRequest }) {
  const containerRef = useRef(null);
  const [pages, setPages] = useState([]); // [{ index, widthPx, heightPx, canvasRef }]
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setError(null);

    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
        const initialised = [];
        for (let i = 0; i < doc.numPages; i += 1) {
          const page = await doc.getPage(i + 1);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = RENDER_WIDTH_PX / baseViewport.width;
          const viewport = page.getViewport({ scale });
          initialised.push({
            index: i,
            page,
            widthPx: Math.floor(viewport.width),
            heightPx: Math.floor(viewport.height),
            viewport,
          });
        }
        if (!cancelled) setPages(initialised);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load PDF');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Render each page into its canvas once available.
  useEffect(() => {
    pages.forEach((p) => {
      const canvas = containerRef.current?.querySelector(
        `canvas[data-page-index="${p.index}"]`,
      );
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = p.widthPx;
      canvas.height = p.heightPx;
      p.page.render({ canvasContext: ctx, viewport: p.viewport });
    });
  }, [pages]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load document: {error}</AlertDescription>
      </Alert>
    );
  }
  if (pages.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading document…
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-6">
      {pages.map((p) => {
        const fieldsOnPage = fields.filter((f) =>
          (f.areas || []).some((a) => a.page === p.index),
        );
        return (
          <div
            key={p.index}
            className="relative inline-block border bg-white shadow-sm"
            style={{ width: p.widthPx, height: p.heightPx }}
          >
            <canvas data-page-index={p.index} className="block" />
            {fieldsOnPage.map((field) => {
              const area = (field.areas || []).find((a) => a.page === p.index);
              if (!area) return null;
              const style = {
                position: 'absolute',
                left: `${area.x * 100}%`,
                top: `${area.y * 100}%`,
                width: `${area.w * 100}%`,
                height: `${area.h * 100}%`,
              };
              return (
                <FieldControl
                  key={field.name}
                  field={field}
                  style={style}
                  value={fieldValues[field.name]}
                  onChange={(v) =>
                    setFieldValues((prev) => ({ ...prev, [field.name]: v }))
                  }
                  onSignatureRequest={() => onSignatureRequest(field)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function FieldControl({ field, style, value, onChange, onSignatureRequest }) {
  const baseClass =
    'absolute border-2 border-blue-500 bg-blue-100/40 text-[12px] font-medium overflow-hidden';
  switch (field.type) {
    case 'signature': {
      const hasSig = typeof value === 'string' && value.length > 0;
      return (
        <button
          type="button"
          onClick={onSignatureRequest}
          className={
            baseClass +
            ' flex items-center justify-center cursor-pointer hover:bg-blue-200/40 hover:border-blue-700'
          }
          style={style}
          aria-label={`Signature: ${field.name}`}
        >
          {hasSig ? (
            <img
              src={value}
              alt="Your signature"
              className="max-h-full max-w-full object-contain pointer-events-none"
            />
          ) : (
            <span className="text-blue-700 px-1 truncate">Click to sign</span>
          )}
        </button>
      );
    }
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute"
          style={{ ...style, padding: 2 }}
          aria-label={field.name}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass + ' bg-white px-1 text-[11px]'}
          style={style}
          aria-label={field.name}
        />
      );
    case 'email':
      return (
        <input
          type="email"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.name}
          className={baseClass + ' bg-white px-1 text-[11px]'}
          style={style}
          aria-label={field.name}
        />
      );
    case 'name':
    case 'text':
    default:
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.name}
          className={baseClass + ' bg-white px-1 text-[11px]'}
          style={style}
          aria-label={field.name}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Already-finalized page (signed/declined/expired returned by GET)
// ---------------------------------------------------------------------------

function FinalizedView({ status, branding, sessionData }) {
  const isSigned = status === 'signed' || status === 'completed';
  const isDeclined = status === 'declined';
  const isExpired = status === 'expired';
  const headline = isSigned
    ? 'This document has already been signed.'
    : isDeclined
    ? 'This document has been declined.'
    : 'This signing link has expired.';
  const detail = isSigned
    ? `Recorded ${new Date(sessionData?.signed_at || sessionData?.completed_at || Date.now()).toLocaleString()}.`
    : isDeclined
    ? `Declined ${new Date(sessionData?.declined_at || Date.now()).toLocaleString()}.`
    : `Expired ${new Date(sessionData?.expires_at || Date.now()).toLocaleString()}.`;
  return (
    <PageShell branding={branding}>
      <CenterCard>
        <div className="flex items-center gap-3">
          {isExpired ? (
            <ShieldAlert className="w-6 h-6 text-amber-600" />
          ) : isDeclined ? (
            <X className="w-6 h-6 text-red-600" />
          ) : (
            <Check className="w-6 h-6 text-green-600" />
          )}
          <h1 className="text-lg font-semibold">{headline}</h1>
        </div>
        <p className="text-sm text-slate-600">{detail}</p>
        <p className="text-xs text-slate-500">
          If you believe this is in error, contact the sender to receive a fresh signing link.
        </p>
      </CenterCard>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SignPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [session, setSession] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [pendingSignatureField, setPendingSignatureField] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);

  // Initial load.
  useEffect(() => {
    if (!token) {
      setLoadError('No signing token in URL.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSession(token);
        if (cancelled) return;
        setSession(data);
        if (data.recipient_name) setSignerName(data.recipient_name);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.body?.error || err.message || 'Failed to load.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const requiredFields = useMemo(
    () => (session?.template?.fields || []).filter((f) => f.required),
    [session],
  );

  const missingRequired = useMemo(() => {
    if (!session) return [];
    return requiredFields
      .filter((f) => {
        if (f.type === 'signature') {
          // Required signature satisfied by either signatureDataUrl or
          // a per-field value.
          if (signatureDataUrl) return false;
          const v = fieldValues[f.name];
          return !(typeof v === 'string' && v.length > 0);
        }
        const v = fieldValues[f.name];
        if (f.type === 'checkbox') return !v;
        return v === undefined || v === null || v === '';
      })
      .map((f) => f.name);
  }, [session, requiredFields, fieldValues, signatureDataUrl]);

  const canConfirm = useMemo(
    () =>
      !!session &&
      !submitting &&
      !!signatureDataUrl &&
      signerName.trim().length > 0 &&
      missingRequired.length === 0,
    [session, submitting, signatureDataUrl, signerName, missingRequired.length],
  );

  const handleSignatureRequest = useCallback((field) => {
    setPendingSignatureField(field || null);
    setSignatureModalOpen(true);
  }, []);

  const handleSignatureSaved = useCallback(
    (dataUrl) => {
      if (!dataUrl) return;
      // Save into the right slot — top-level for the single-signer case,
      // per-field if the recipient explicitly clicked a specific field.
      if (pendingSignatureField) {
        setFieldValues((prev) => ({ ...prev, [pendingSignatureField.name]: dataUrl }));
      }
      // Always also stash top-level so a single-signer template works
      // regardless of which field the recipient clicked.
      setSignatureDataUrl(dataUrl);
      setSignatureModalOpen(false);
      setPendingSignatureField(null);
    },
    [pendingSignatureField],
  );

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const data = await postSubmit(token, {
        signer_name: signerName.trim(),
        signature_data_url: signatureDataUrl,
        field_values: fieldValues,
      });
      setSubmitted(true);
      setSubmittedAt(data?.signed_at || new Date().toISOString());
      setConfirmOpen(false);
    } catch (err) {
      setSubmitError(err.body?.message || err.message || 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  }, [token, signerName, signatureDataUrl, fieldValues]);

  const handleDecline = useCallback(async () => {
    setDeclining(true);
    try {
      await postDecline(token, declineReason);
      setDeclined(true);
      setDeclineOpen(false);
    } catch (err) {
      setSubmitError(err.body?.message || err.message || 'Decline failed.');
    } finally {
      setDeclining(false);
    }
  }, [token, declineReason]);

  // -------------------------------------------------------------------------
  // Render branches
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <PageShell branding={null}>
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading signing session…
        </div>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell branding={null}>
        <CenterCard>
          <h1 className="text-lg font-semibold">Signing link not available</h1>
          <p className="text-sm text-slate-600">
            {loadError === 'expired'
              ? 'This signing link has expired. Ask the sender to issue a new one.'
              : loadError === 'not_found'
              ? 'This signing link is not valid. It may have been revoked or mistyped.'
              : loadError === 'declined'
              ? 'This document was declined and can no longer be signed.'
              : `We couldn't load this signing session: ${loadError}`}
          </p>
        </CenterCard>
      </PageShell>
    );
  }

  if (submitted) {
    return (
      <PageShell branding={session?.branding}>
        <CenterCard>
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6 text-green-600" />
            <h1 className="text-lg font-semibold">Thanks — your signature has been recorded.</h1>
          </div>
          <p className="text-sm text-slate-600">
            Recorded {submittedAt ? new Date(submittedAt).toLocaleString() : 'just now'}.
          </p>
          <p className="text-xs text-slate-500">
            A copy will be available to the sender shortly. You can close this tab.
          </p>
        </CenterCard>
      </PageShell>
    );
  }

  if (declined) {
    return (
      <PageShell branding={session?.branding}>
        <CenterCard>
          <div className="flex items-center gap-3">
            <X className="w-6 h-6 text-red-600" />
            <h1 className="text-lg font-semibold">You&apos;ve declined this document.</h1>
          </div>
          <p className="text-sm text-slate-600">
            The sender has been notified. You can close this tab.
          </p>
        </CenterCard>
      </PageShell>
    );
  }

  // Already finalized when the GET arrived.
  if (
    session?.status === 'signed' ||
    session?.status === 'completed' ||
    session?.status === 'declined' ||
    session?.status === 'expired'
  ) {
    return (
      <FinalizedView status={session.status} branding={session.branding} sessionData={session} />
    );
  }

  const primary = session?.branding?.primary_color || FALLBACK_PRIMARY;

  return (
    <PageShell branding={session?.branding}>
      <div className="space-y-6">
        <CenterCard>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">{session?.template?.name}</h1>
              {session?.recipient_name ? (
                <p className="text-sm text-slate-600">For {session.recipient_name}</p>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeclineOpen(true)}
              className="text-red-600 hover:text-red-600"
            >
              Decline
            </Button>
          </div>
          {session?.message ? (
            <div className="mt-2 rounded-md border-l-4 bg-slate-50 p-3 text-sm" style={{ borderLeftColor: primary }}>
              <p className="text-slate-700 whitespace-pre-wrap">{session.message}</p>
            </div>
          ) : null}
        </CenterCard>

        <PdfWithFields
          pdfUrl={session.pdf_url}
          fields={session.template?.fields || []}
          fieldValues={fieldValues}
          setFieldValues={setFieldValues}
          onSignatureRequest={handleSignatureRequest}
        />

        <CenterCard>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signer-name" className="text-sm font-medium">
                Type your full name
              </Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Jane Doe"
                maxLength={200}
                required
              />
              <p className="text-xs text-slate-500">
                This name and the timestamp will be recorded with your signature for legal
                verification.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Your signature</Label>
              <div
                className="rounded-md border bg-slate-50 p-3 cursor-pointer hover:bg-slate-100 inline-flex items-center gap-3"
                onClick={() => handleSignatureRequest(null)}
              >
                {signatureDataUrl ? (
                  <img
                    src={signatureDataUrl}
                    alt="Your signature"
                    className="h-12 w-auto bg-white border rounded"
                  />
                ) : (
                  <span className="text-sm text-slate-600">Click to sign</span>
                )}
                <Button type="button" variant="outline" size="sm">
                  <FileSignature className="w-4 h-4 mr-2" />
                  {signatureDataUrl ? 'Re-sign' : 'Sign'}
                </Button>
              </div>
            </div>

            {missingRequired.length > 0 ? (
              <Alert>
                <AlertDescription>
                  Required field{missingRequired.length > 1 ? 's' : ''} still empty:{' '}
                  {missingRequired.join(', ')}
                </AlertDescription>
              </Alert>
            ) : null}

            {submitError ? (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!canConfirm}
                style={canConfirm ? { backgroundColor: primary } : undefined}
              >
                <FileSignature className="w-4 h-4 mr-2" /> Sign and submit
              </Button>
            </div>
          </div>
        </CenterCard>
      </div>

      {/* Signature pad modal */}
      <Dialog
        open={signatureModalOpen}
        onOpenChange={(o) => {
          setSignatureModalOpen(o);
          if (!o) setPendingSignatureField(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="w-5 h-5" />
              Draw your signature
            </DialogTitle>
            <DialogDescription>
              Use your mouse, finger, or stylus to sign. Click <strong>Save signature</strong>{' '}
              when done.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad
            onChange={handleSignatureSaved}
            initialDataUrl={signatureDataUrl || undefined}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSignatureModalOpen(false);
                setPendingSignatureField(null);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Are-you-sure confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign and submit?</DialogTitle>
            <DialogDescription>
              By submitting, you agree that the signature image you drew is legally equivalent
              to your handwritten signature.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-slate-50 p-3 space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Signed by:</span>{' '}
              <span className="font-medium">{signerName.trim() || '(name required)'}</span>
            </div>
            <div>
              <span className="text-slate-500">Date / time:</span>{' '}
              <span className="font-medium">{new Date().toLocaleString()}</span>
            </div>
            {signatureDataUrl ? (
              <div>
                <div className="text-slate-500 mb-1">Signature:</div>
                <img
                  src={signatureDataUrl}
                  alt="Your signature"
                  className="h-12 w-auto bg-white border rounded"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canConfirm}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" /> Yes, sign and submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline modal */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this document</DialogTitle>
            <DialogDescription>
              The sender will be notified. You can optionally tell them why.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea
              id="decline-reason"
              rows={3}
              maxLength={1000}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g. wrong recipient, wrong template, etc."
            />
            <p className="text-xs text-slate-500">{declineReason.length} / 1000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={declining}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDecline} disabled={declining}>
              {declining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Declining…
                </>
              ) : (
                'Decline document'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
