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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Loader2, FileSignature, Check, X, ShieldAlert, Download } from 'lucide-react';
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

/**
 * Fetch a 5-minute Supabase signed URL for the recipient's stamped PDF.
 * Token-gated public endpoint mirroring the admin one but using the
 * recipient's signing_token as the authorization. Returns null with
 * `reason='not_yet_available'` when the finalize pipeline hasn't
 * uploaded the PDF yet — caller polls.
 */
async function fetchRecipientSignedPdfUrl(token) {
  const resp = await fetch(`${backendBase()}/api/sign/${encodeURIComponent(token)}/signed-pdf-url`);
  if (resp.status === 404) {
    const j = await resp.json().catch(() => ({}));
    return { url: null, reason: j?.error || 'not_found' };
  }
  if (!resp.ok) {
    const j = await resp.json().catch(() => ({}));
    const err = new Error(j?.message || j?.error || `Download failed (${resp.status})`);
    err.status = resp.status;
    err.body = j;
    throw err;
  }
  const json = await resp.json().catch(() => ({}));
  return { url: json?.data?.url || null };
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
  // IMPORTANT — DO NOT use `container`, `mx-auto`, or `max-w-*` classes
  // anywhere in this tree. The CRM-wide stylesheet
  // (src/styles/layout-theme.css, imported by Layout.jsx but applied
  // globally because CSS is not module-scoped) contains:
  //   body [class*='max-w-'], body .mx-auto, body .container,
  //   main [class*='max-w-'], main .mx-auto, main .container,
  //   main .overflow-x-auto {
  //     max-width: 100% !important;
  //     width: 100% !important;
  //     margin-left: 0 !important;
  //     margin-right: 0 !important;
  //   }
  // Any of those classes inside the SignPage tree gets stretched to
  // viewport width, breaking the 720px PDF page-div and pushing the
  // absolute-positioned field overlays off the canvas. Inline styles
  // CANNOT win against `!important` from a stylesheet rule, so the
  // only durable fix is to avoid the offending class names entirely
  // and use inline width/margin instead.
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Page-local keyframes for the next-field pulse + jump-flash.
          Scoped via the unique class names so they don't leak into the
          rest of the app. Inlining as <style> avoids touching the
          global stylesheet. */}
      <style>{`
        @keyframes signing-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25); }
          50%       { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.45); }
        }
        @keyframes signing-flash {
          0%   { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.0); }
          25%  { box-shadow: 0 0 0 12px rgba(245, 158, 11, 0.55); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.0); }
        }
        .signing-flash {
          animation: signing-flash 0.9s ease-out 1 !important;
        }
      `}</style>
      <header className="border-b bg-white">
        <div
          className="flex items-center gap-3"
          style={{
            width: '100%',
            maxWidth: '1280px',
            marginLeft: 'auto',
            marginRight: 'auto',
            paddingLeft: '1rem',
            paddingRight: '1rem',
            paddingTop: '1rem',
            paddingBottom: '1rem',
          }}
        >
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={tenantName} className="h-8 w-auto object-contain" />
          ) : (
            <div className="text-lg font-semibold" style={{ color: primary }}>
              {tenantName}
            </div>
          )}
          <div
            className="text-xs text-slate-500 flex items-center gap-2"
            style={{ marginLeft: 'auto' }}
          >
            <ShieldAlert className="w-4 h-4" />
            Secure signing session
          </div>
        </div>
      </header>
      <main
        style={{
          maxWidth: '768px',
          marginLeft: 'auto',
          marginRight: 'auto',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1.5rem',
          paddingBottom: '1.5rem',
        }}
      >
        {children}
      </main>
    </div>
  );
}

function CenterCard({ children }) {
  return <div className="bg-white border rounded-lg shadow-sm p-6 space-y-3">{children}</div>;
}

// ---------------------------------------------------------------------------
// PDF + field overlay renderer (signer mode)
// ---------------------------------------------------------------------------

function PdfWithFields({
  pdfUrl,
  fields,
  fieldValues,
  setFieldValues,
  onSignatureRequest,
  nextFieldName,
  isFieldFilled,
  registerFieldRef,
}) {
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

  // Render each page into its canvas once available. We must set BOTH the
  // drawing-buffer size (canvas.width / canvas.height attrs — pixels of
  // resolution) AND the CSS display size (canvas.style.width / height) so
  // the on-screen canvas occupies the same box as its parent. Without the
  // CSS sizing the canvas defaults to HTML's 300x150 CSS size while the
  // buffer is 720+px — and field overlays positioned as percentages of
  // the parent end up far past the visible canvas edge.
  useEffect(() => {
    pages.forEach((p) => {
      const canvas = containerRef.current?.querySelector(`canvas[data-page-index="${p.index}"]`);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = p.widthPx;
      canvas.height = p.heightPx;
      canvas.style.width = `${p.widthPx}px`;
      canvas.style.height = `${p.heightPx}px`;
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
        // Sort fields on each page by visual reading order — top to bottom,
        // then left to right within a row. Without this sort, fields render
        // (and therefore Tab-navigate) in template-creation order, which
        // can put a left-column field AFTER a right-column field that
        // visually appears later. Symptom: Tab jumps from the document's
        // first field straight past visually-earlier fields to whichever
        // input was added to the template first, dragging the page-scroll
        // with it. Confirmed via Claude-in-Chrome live inspect of the
        // Service Agreement template (4VD-43): name_3 (right column) was
        // declared before signature_4 (left column), so Tab from
        // text_2 jumped to name_3 instead of the visually-prior
        // signature_4.
        //
        // Row-tolerance of 0.02 (≈2% of page height) groups fields that
        // share a baseline so we don't flip them by sub-pixel y noise —
        // a "BY: ___ Print name: ___" pair on the same line stays
        // left-then-right rather than oscillating.
        const fieldsOnPage = fields
          .filter((f) => (f.areas || []).some((a) => a.page === p.index))
          .slice()
          .sort((a, b) => {
            const aArea = (a.areas || []).find((ar) => ar.page === p.index);
            const bArea = (b.areas || []).find((ar) => ar.page === p.index);
            if (!aArea || !bArea) return 0;
            if (Math.abs(aArea.y - bArea.y) > 0.02) return aArea.y - bArea.y;
            return aArea.x - bArea.x;
          });
        return (
          <div
            key={p.index}
            className="relative border bg-white shadow-sm"
            // DO NOT add `mx-auto` here — global layout-theme.css forces
            // `width: 100% !important` on any `.mx-auto` inside <body>,
            // which would stretch the page-div past 720px and drag the
            // absolute-positioned field overlays off the canvas.
            // Center via inline marginLeft/marginRight instead.
            //
            // overflow is explicitly `visible` (not the previous
            // `overflow-hidden`) so the "Next ▸" badge — positioned
            // ABOVE its field wrapper at top: -1.25rem — isn't clipped
            // when the field sits near the top edge of a page. Field
            // areas are validated [0,1] both at template-create and
            // again at sign-time, so the original leak-prevention
            // rationale for overflow-hidden is already enforced upstream.
            style={{
              width: `${p.widthPx}px`,
              height: `${p.heightPx}px`,
              maxWidth: '100%',
              marginLeft: 'auto',
              marginRight: 'auto',
              overflow: 'visible',
            }}
          >
            <canvas
              data-page-index={p.index}
              className="block"
              style={{ width: `${p.widthPx}px`, height: `${p.heightPx}px` }}
            />
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
              const isNext = field.name === nextFieldName;
              const isFilled = isFieldFilled ? isFieldFilled(field) : false;
              return (
                <FieldControl
                  key={field.name}
                  field={field}
                  style={style}
                  value={fieldValues[field.name]}
                  isNext={isNext}
                  isFilled={isFilled}
                  registerFieldRef={registerFieldRef}
                  onChange={(v) => setFieldValues((prev) => ({ ...prev, [field.name]: v }))}
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

/**
 * FieldControl
 *
 * Visual states (in priority order so transitions are predictable):
 *   - `isFilled === true`  → green border, no NEXT badge.
 *   - `isNext === true`    → yellow border + ring + small "NEXT ▸" badge
 *                            anchored above-left of the box. Pulses subtly
 *                            via the `signing-pulse` keyframes (defined
 *                            inline below — no global CSS dependency).
 *   - default              → blue border (the resting "fill me" affordance).
 *
 * Why state-based borders instead of CSS pseudo-classes: the source of
 * truth for "filled" lives in React state (`fieldValues` / `signatureDataUrl`),
 * not in the DOM input value, so a pure-CSS `:valid`/`:placeholder-shown`
 * approach would miss the signature button (which is a `<button>`, not an
 * input). Driving the border off props keeps the rules consistent across
 * all field types.
 *
 * The wrapper `<div>` exists so that the NEXT badge (positioned
 * absolutely OUTSIDE the field's pixel box) can share the same offset
 * parent as the field. The wrapper itself takes the style from the
 * parent's normalized-area math; the input/button inside fills 100% of
 * the wrapper. This also gives us a single ref target for scrollIntoView
 * on the Jump-to-next button.
 */
function FieldControl({
  field,
  style,
  value,
  isNext,
  isFilled,
  registerFieldRef,
  onChange,
  onSignatureRequest,
}) {
  const wrapperRef = useRef(null);
  useEffect(() => {
    if (registerFieldRef && wrapperRef.current) {
      registerFieldRef(field.name, wrapperRef.current);
    }
    return () => {
      if (registerFieldRef) registerFieldRef(field.name, null);
    };
  }, [field.name, registerFieldRef]);

  // Border + background per state. Tailwind classes alone don't help here
  // because `border-blue-500` etc. aren't matched by the global
  // layout-theme.css rule we documented at the top of PageShell, so safe
  // to use them.
  const stateBorder = isFilled
    ? 'border-green-500 bg-green-100/40'
    : isNext
      ? 'border-amber-500 bg-amber-100/50'
      : 'border-blue-500 bg-blue-100/40';

  const baseInner =
    'block w-full h-full border-2 text-[12px] font-medium overflow-hidden ' + stateBorder;

  const renderInner = () => {
    switch (field.type) {
      case 'signature': {
        const hasSig = typeof value === 'string' && value.length > 0;
        return (
          <button
            type="button"
            onClick={onSignatureRequest}
            className={
              baseInner + ' flex items-center justify-center cursor-pointer hover:brightness-95'
            }
            aria-label={`Signature: ${field.name}`}
          >
            {hasSig ? (
              <img
                src={value}
                alt="Your signature"
                className="max-h-full max-w-full object-contain pointer-events-none"
              />
            ) : (
              <span
                className={
                  'px-1 truncate ' +
                  (isFilled ? 'text-green-700' : isNext ? 'text-amber-800' : 'text-blue-700')
                }
              >
                Click to sign
              </span>
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
            className={baseInner + ' p-[2px]'}
            aria-label={field.name}
          />
        );
      case 'date':
        // Use a typed text input rather than `<input type="date">`. The
        // native date picker traps focus inside its month/day/year
        // sub-fields — a single Tab press cycles month → day → year
        // → month again, never escaping to the next form field. That
        // breaks Tab navigation on a multi-field signature form. We
        // substitute a plain text input with a `MM/DD/YYYY` placeholder
        // and a permissive pattern so any reasonable date string is
        // accepted; the recipient gets a normal Tab-out experience.
        // pdf-lib stamping (day 5) parses whatever string they entered
        // — same as DocuSeal's date-field semantics.
        return (
          <input
            type="text"
            inputMode="numeric"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="MM/DD/YYYY"
            pattern="\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"
            className={baseInner + ' bg-white px-1 text-[11px]'}
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
            className={baseInner + ' bg-white px-1 text-[11px]'}
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
            className={baseInner + ' bg-white px-1 text-[11px]'}
            aria-label={field.name}
          />
        );
    }
  };

  // Pulse animation — inlined keyframes via a <style> tag scoped by class
  // name. Cheap and avoids touching global CSS.
  return (
    <div
      ref={wrapperRef}
      data-field-name={field.name}
      data-field-state={isFilled ? 'filled' : isNext ? 'next' : 'pending'}
      style={{
        ...style,
        boxShadow: isNext ? '0 0 0 3px rgba(245, 158, 11, 0.35)' : undefined,
        animation: isNext ? 'signing-pulse 1.6s ease-in-out infinite' : undefined,
      }}
    >
      {renderInner()}
      {isNext ? (
        <span
          className="absolute text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shadow-sm"
          style={{
            top: '-1.25rem',
            left: 0,
            backgroundColor: '#f59e0b', // amber-500
            color: '#fff',
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}
        >
          Next ▸
        </span>
      ) : null}
      {isFilled ? (
        <span
          className="absolute text-[10px] font-bold rounded-full"
          style={{
            top: '-0.5rem',
            right: '-0.5rem',
            width: '1.1rem',
            height: '1.1rem',
            backgroundColor: '#16a34a', // green-600
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
          aria-hidden="true"
        >
          ✓
        </span>
      ) : null}
    </div>
  );
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
  // Recipient signed-PDF download state. The finalize pipeline runs
  // asynchronously after POST /sign/:token/submit returns 201, so the
  // success page initially has no PDF to hand out. We poll
  // /api/sign/:token/signed-pdf-url for up to ~30s, surfacing a
  // "Preparing your copy…" message until the URL is ready, then a
  // Download button.
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Disable browser scroll restoration on this page so a fresh navigation
  // always starts at the top regardless of the tab's prior scroll memory.
  // The CRM Layout doesn't need this (its routes generally start at top
  // anyway), but the public sign URL is recipient-facing — having it
  // re-open scrolled to a previous position is jarring and inconsistent
  // across browsers.
  //
  // Why useLayoutEffect (not useEffect): runs synchronously after DOM
  // mutation but BEFORE the browser paints. That's earlier than the
  // useEffect commit phase, so we override the browser's scroll-restore
  // attempt before the user sees any flash at the wrong position.
  //
  // Why the retry chain: `scrollTo(0, 0)` only works if the document is
  // already tall enough to need scrolling. PDF rendering and async data
  // arrival both grow the page height after mount; some browsers retry
  // their own scroll restoration once the new content lands. The 3-retry
  // schedule (immediate / +50ms / +250ms / +800ms) covers PDF first paint,
  // post-render reflow, and worst-case slow networks. Each retry only
  // fires if the user hasn't manually scrolled away — we read the
  // current scrollY and bail if it's > 0 AND was set by a non-zero value
  // we didn't write (sentinel: track our own writes via lastWriteY).
  //
  // Cleanup restores the previous mode on unmount so we don't bleed
  // `manual` into any subsequent in-tab navigation — important because
  // the CRM Layout doesn't toggle scrollRestoration itself, so leaking
  // would silently disable the back-button-scroll-memory the rest of
  // the app relies on.
  // Minimal scroll-restoration override: disable browser scroll memory on
  // this public-facing page so refreshing or revisiting the URL always
  // starts at top. Cleanup restores the previous mode on unmount so we
  // don't leak `manual` into subsequent in-tab navigation.
  //
  // Earlier iterations of this effect added a hard 1.5s scroll-lock with
  // user-input detection and multiple retry timers — turned out to be
  // unnecessary. The reported "page lands at the signature block" symptom
  // wasn't scroll-on-mount; it was Tab navigation hitting fields in
  // DOM-declaration order (which didn't match visual reading order),
  // pulling focus — and therefore page scroll — to the bottom-of-doc
  // signature field. The actual fix lives in PdfWithFields, where fields
  // on each page are now sorted by (y, x) before render. Keeping just the
  // scrollRestoration override here for pure UX hygiene on refresh.
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.history) return undefined;
    if (!('scrollRestoration' in window.history)) return undefined;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

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

  // Once the recipient successfully submits, poll the public download URL
  // until the finalize pipeline has uploaded the stamped PDF. Empirically
  // finalize completes in 2-5 seconds on dev; we poll every 1.5s for up
  // to 40 seconds (27 attempts) before giving up and surfacing a "your
  // copy will be emailed" fallback. The signed URL is 5 minutes long, so
  // we don't need to re-fetch after we have it.
  useEffect(() => {
    if (!submitted || !token || downloadUrl) return undefined;
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 27;
    const INTERVAL_MS = 1500;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const { url, reason } = await fetchRecipientSignedPdfUrl(token);
        if (cancelled) return;
        if (url) {
          setDownloadUrl(url);
          return;
        }
        if (reason === 'not_yet_available') {
          if (attempts < MAX_ATTEMPTS) {
            setTimeout(tick, INTERVAL_MS);
          } else {
            setDownloadError('preparing'); // surfaces fallback copy in UI
          }
        } else if (reason === 'archived') {
          setDownloadError('archived');
        } else {
          setDownloadError(reason || 'unavailable');
        }
      } catch (err) {
        if (!cancelled) setDownloadError(err.body?.error || err.message || 'fetch_failed');
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [submitted, token, downloadUrl]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl || downloading) return;
    setDownloading(true);
    // Same pop-up-blocker-safe pattern as the admin DocumentSignaturesSection:
    // we already have the URL in hand (no fetch round-trip), so open
    // directly. window.open inside a synchronous click handler is treated
    // as user-initiated even with noopener.
    try {
      window.open(downloadUrl, '_blank', 'noopener');
    } finally {
      setDownloading(false);
    }
  }, [downloadUrl, downloading]);

  // ALL fields the recipient can fill, sorted by visual reading order
  // (page → y → x). The NEXT pointer walks this list, not just the
  // `required` subset — most templates mark only `signature` as required
  // (per signingFieldCoords.js#defaultRequired) so recipients with text/
  // name/email/date/checkbox boxes would otherwise see those blue fields
  // skipped entirely. Walking all fields matches recipient mental model:
  // every blue box on the page is something they're expected to engage
  // with, even if optional.
  //
  // Submit gating still uses required-only (see `missingRequired` below)
  // — optional fields don't block the Sign-and-Submit button, but they
  // DO appear in the NEXT-pointer traversal so the recipient is offered
  // a guided walk through every fillable area.
  //
  // Row-tolerance 0.01 (≈1% of page height) groups same-baseline fields
  // so a same-row pair sorts left-to-right rather than oscillating on
  // sub-pixel y noise.
  const orderedFields = useMemo(() => {
    const all = session?.template?.fields || [];
    return [...all].sort((a, b) => {
      const aArea = (a.areas || [])[0];
      const bArea = (b.areas || [])[0];
      if (!aArea || !bArea) return 0;
      if (aArea.page !== bArea.page) return aArea.page - bArea.page;
      if (Math.abs(aArea.y - bArea.y) > 0.01) return aArea.y - bArea.y;
      return aArea.x - bArea.x;
    });
  }, [session]);

  // True if the given field counts as filled. Mirrors the logic used by
  // missingRequired below — extracted so FieldControl can render its
  // green/amber/blue state directly off props.
  const isFieldFilled = useCallback(
    (field) => {
      if (field.type === 'signature') {
        if (signatureDataUrl) return true;
        const v = fieldValues[field.name];
        return typeof v === 'string' && v.length > 0;
      }
      const v = fieldValues[field.name];
      if (field.type === 'checkbox') return !!v;
      return v !== undefined && v !== null && v !== '';
    },
    [fieldValues, signatureDataUrl],
  );

  // Required-fields subset — used ONLY for the submit-button gate and
  // the alert listing missing required fields. Not used by the NEXT
  // pointer (which walks all fields).
  const missingRequired = useMemo(() => {
    if (!session) return [];
    return orderedFields.filter((f) => f.required && !isFieldFilled(f)).map((f) => f.name);
  }, [session, orderedFields, isFieldFilled]);

  // First unfilled field in reading order, regardless of required status
  // — what the NEXT badge and the Jump button target. Null when every
  // field is filled. Recipients who want to skip an optional field can
  // simply move on; the pointer recomputes from React state on every
  // change so it always reflects "the next blank box in reading order".
  const nextField = useMemo(() => {
    return orderedFields.find((f) => !isFieldFilled(f)) || null;
  }, [orderedFields, isFieldFilled]);

  // 1-based progress: "field 3 of 5". `position` is the index in the
  // ORDERED full-field list of the next-to-fill, so the user sees
  // "1 of 5" when nothing's done and "5 of 5" on the very last one.
  const nextFieldProgress = useMemo(() => {
    if (!nextField) return null;
    const idx = orderedFields.findIndex((f) => f.name === nextField.name);
    return { position: idx + 1, total: orderedFields.length };
  }, [nextField, orderedFields]);

  // Field-name → DOM-element registry for scrollIntoView from the Jump
  // button. Populated by FieldControl via its registerFieldRef effect.
  const fieldRefs = useRef(new Map());
  const registerFieldRef = useCallback((name, el) => {
    if (el) {
      fieldRefs.current.set(name, el);
    } else {
      fieldRefs.current.delete(name);
    }
  }, []);

  const jumpToNextField = useCallback(() => {
    if (!nextField) return;
    const el = fieldRefs.current.get(nextField.name);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Brief flash to confirm "this is the one". Adds + removes a class
    // so the pulse animation restarts even if the field was already the
    // active "next" field.
    el.classList.remove('signing-flash');
    // Force reflow so the class re-add re-triggers the animation.
    void el.offsetWidth;
    el.classList.add('signing-flash');
    // Auto-focus inputs (signature is a button — focus still works and
    // a keyboard-driven user can press Enter/Space to open the modal).
    const inner = el.querySelector('input') || el.querySelector('button') || null;
    if (inner && typeof inner.focus === 'function') {
      // Defer one tick so scroll completes before focus jumps.
      setTimeout(() => inner.focus({ preventScroll: true }), 250);
    }
  }, [nextField]);

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
    (dataUrl, mode) => {
      if (!dataUrl) return;
      // Save into the right slot — top-level for the single-signer case,
      // per-field if the recipient explicitly clicked a specific field.
      // Always also stash _signature_mode at the field_values root so
      // the backend's buildDigitalSignatureMetadata can record whether
      // the signer drew or typed (lands in the final PDF's
      // AiSHASignature Info-dict entry).
      setFieldValues((prev) => {
        const next = { ...prev };
        if (pendingSignatureField) {
          next[pendingSignatureField.name] = dataUrl;
        }
        if (mode === 'draw' || mode === 'drawn' || mode === 'type' || mode === 'typed') {
          next._signature_mode = mode;
        }
        return next;
      });
      // Top-level signatureDataUrl mirrors the canonical signature for
      // single-signer templates regardless of which field was clicked.
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
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-3">
            {downloadUrl ? (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">
                  Your signed copy is ready.
                </p>
                <Button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening…
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" /> Download signed PDF
                    </>
                  )}
                </Button>
                <p className="text-xs text-slate-500 mt-2">
                  We&apos;ve also emailed a copy to your address for safekeeping.
                </p>
              </>
            ) : downloadError ? (
              <p className="text-sm text-slate-600">
                {downloadError === 'archived'
                  ? 'This document was removed by the sender after signing.'
                  : 'Your signed copy is being prepared and will arrive in your inbox shortly.'}
              </p>
            ) : (
              <p className="text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing your signed copy…
              </p>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-3">You can close this tab.</p>
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
            <div
              className="mt-2 rounded-md border-l-4 bg-slate-50 p-3 text-sm"
              style={{ borderLeftColor: primary }}
            >
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
          nextFieldName={nextField?.name || null}
          isFieldFilled={isFieldFilled}
          registerFieldRef={registerFieldRef}
        />

        {/* Floating "Next required field" guidance bar.
            Sits between the PDF and the signer-name section so the user
            sees it whether they scroll up or down. Hidden once all
            required fields are filled — the green-bordered fields and
            the now-enabled Sign and submit button take over signaling. */}
        {nextField ? (
          <div
            className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 flex items-center gap-3 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-flex items-center justify-center rounded-full text-white font-bold"
              style={{
                width: '1.75rem',
                height: '1.75rem',
                backgroundColor: '#f59e0b',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {nextFieldProgress?.position}
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium text-amber-900 flex items-center gap-2 flex-wrap">
                <span>
                  Next field: <span className="font-mono">{nextField.name}</span>
                </span>
                {nextField.required ? (
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#dc2626', color: '#fff' }}
                  >
                    Required
                  </span>
                ) : (
                  <span
                    className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded text-amber-700"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #f59e0b',
                    }}
                  >
                    Optional
                  </span>
                )}
              </div>
              <div className="text-xs text-amber-700">
                Field {nextFieldProgress?.position} of {nextFieldProgress?.total}
                {missingRequired.length > 0
                  ? ` · ${missingRequired.length} required ${missingRequired.length === 1 ? 'field' : 'fields'} still empty`
                  : missingRequired.length === 0 && nextField
                    ? ' · all required fields complete'
                    : ''}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={jumpToNextField}
              style={{ backgroundColor: '#f59e0b', color: '#fff' }}
            >
              Jump to it ▸
            </Button>
          </div>
        ) : (
          <div
            className="rounded-lg border-2 border-green-400 bg-green-50 p-3 flex items-center gap-3 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <Check className="w-5 h-5 text-green-600" />
            <div className="flex-1 text-sm font-medium text-green-900">
              All fields complete. Review and submit below.
            </div>
          </div>
        )}

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

            {/* Removed the static "Required field still empty: …" alert.
                The floating "Next required field" bar above the PDF now
                provides the same information AND a Jump button — keeping
                the alert here would just duplicate UI noise. */}

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
              Use your mouse, finger, or stylus to sign. Click <strong>Save signature</strong> when
              done.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad
            onChange={handleSignatureSaved}
            initialDataUrl={signatureDataUrl || undefined}
            suggestedName={signerName || session?.recipient_name || undefined}
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
              By submitting, you agree that the signature image you drew is legally equivalent to
              your handwritten signature.
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
