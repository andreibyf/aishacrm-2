/**
 * Public white-label DocuSeal signing page (4VD-7).
 *
 * Route: /sign/:slug/:token  (declared in src/pages/index.jsx OUTSIDE the
 * authenticated Layout — recipients are not CRM users, the slug+token pair
 * is the only access control).
 *
 * Behaviour:
 *  - Fetches GET /api/public/docuseal/sign/:slug/:token via the public
 *    backend route (no auth header).
 *  - Renders tenant chrome (logo + brand colors) and embeds DocuSeal's
 *    `<docuseal-form>` web component for the actual signing UI.
 *  - On 404, shows a generic "this signing link is invalid or expired"
 *    page so the route can't be used to probe for valid tokens.
 *  - If the row exists but pre-dates the embed-token flow (no embed_src),
 *    falls back to a "please contact the sender" screen.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBackendUrl } from '@/api/backendUrl';

// We deliberately use a plain <iframe> against DocuSeal's hosted signing
// page (`embed_src` returns a URL like https://docuseal.aishacrm.com/s/<token>)
// rather than the `<docuseal-form>` web component shipped via DocuSeal's CDN.
//
// Why: the web component renders the form in-page by calling DocuSeal's
// /embed/forms API with `credentials: 'include'`. DocuSeal's default CORS
// config returns `Access-Control-Allow-Origin: *`, which the browser rejects
// when paired with credentialed requests (per the spec). DocuSeal Community
// has no env var to swap in a specific allowed origin, so we sidestep it.
//
// Framing: DocuSeal Community sets `X-Frame-Options: SAMEORIGIN` baked into
// Rails. We rewrite that header on the way out via the Cloudflare Worker
// at `cloudflare-workers/docuseal-iframe-allowlist/`, scoped to AiSHA CRM
// origins only. The Worker MUST be deployed to docuseal.aishacrm.com
// before this iframe will render — see that directory's README.
//
// Iframe trade-off: a small strip of DocuSeal chrome shows inside the frame.
// The host page provides the tenant logo + colors as outer chrome, so the
// recipient still primarily sees the tenant brand. Server-side HTML proxy
// is the heavier alternative if full white-label matters more later.

export default function SignPage() {
  const { slug, token } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  // Fetch the submission + branding once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${getBackendUrl()}/api/public/docuseal/sign/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
        const res = await fetch(url, { credentials: 'omit' });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ status: 'invalid' });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        setState({ status: 'ready', data });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  // Apply tenant brand colors to CSS variables on the container
  const brandStyle = (() => {
    if (state.status !== 'ready') return {};
    const t = state.data?.tenant || {};
    return {
      '--brand-primary': t.primary_color || '#06b6d4',
      '--brand-accent': t.accent_color || '#6366f1',
    };
  })();

  // ----- Render branches -----

  if (state.status === 'loading') {
    return <CenteredFrame>Loading…</CenteredFrame>;
  }

  if (state.status === 'invalid') {
    return (
      <CenteredFrame>
        <h1 className="text-xl font-semibold text-slate-800">
          This signing link is invalid or has expired.
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          If you believe this is a mistake, please reply to the email you received and ask the
          sender to resend the document.
        </p>
      </CenteredFrame>
    );
  }

  if (state.status === 'error') {
    return (
      <CenteredFrame>
        <h1 className="text-xl font-semibold text-slate-800">Something went wrong.</h1>
        <p className="mt-2 text-sm text-slate-500">
          Please try again in a moment, or contact the sender of this document.
        </p>
      </CenteredFrame>
    );
  }

  // status === 'ready'
  const { tenant, embed_src, fallback, signed, template_name, recipient_name } = state.data || {};

  if (signed) {
    return (
      <BrandedFrame tenant={tenant} brandStyle={brandStyle}>
        <h1 className="text-2xl font-semibold text-slate-800">Document signed</h1>
        <p className="mt-3 text-sm text-slate-600">
          Thank you{recipient_name ? `, ${recipient_name}` : ''}. Your signature has been recorded
          on <span className="font-medium">{template_name || 'this document'}</span>.
        </p>
        <p className="mt-1 text-sm text-slate-500">A copy will be emailed to you shortly.</p>
      </BrandedFrame>
    );
  }

  if (fallback) {
    return (
      <BrandedFrame tenant={tenant} brandStyle={brandStyle}>
        <h1 className="text-xl font-semibold text-slate-800">
          {tenant?.name || 'Sender'} would like you to sign a document.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          This document was sent through an earlier system that does not support in-page signing.
          Please reply to the original email and ask the sender to resend it via the new flow.
        </p>
      </BrandedFrame>
    );
  }

  return (
    <BrandedFrame tenant={tenant} brandStyle={brandStyle}>
      <h1 className="text-xl font-semibold text-slate-800">
        {tenant?.name || 'Sender'} has sent you a document for signature.
      </h1>
      {template_name && <p className="mt-1 text-sm text-slate-500">{template_name}</p>}
      <div className="mt-6 rounded-md overflow-hidden border border-slate-200">
        <iframe
          src={embed_src}
          title="Document signing"
          className="w-full"
          style={{ minHeight: '80vh', border: 0 }}
          // Sandbox: allow forms, scripts, and same-origin behavior so the
          // DocuSeal page itself functions; allow-popups so the
          // post-signing share/print sheet can open; allow-downloads so the
          // "Download" button on the completion screen actually saves the
          // signed PDF (modern browsers silently block iframe-initiated
          // downloads without this token, which was the 4VD-7 staging bug);
          // do NOT include allow-top-navigation (recipients shouldn't be
          // able to navigate this frame to arbitrary sites if a content-
          // injection bug exists upstream).
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          // referrerpolicy 'no-referrer' so DocuSeal can't see which tenant
          // slug the recipient came from beyond what's in embed_src itself.
          referrerPolicy="no-referrer"
        />
      </div>
    </BrandedFrame>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers — minimal, self-contained, no app shell
// ---------------------------------------------------------------------------

function CenteredFrame({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
        {children}
      </div>
    </div>
  );
}

function BrandedFrame({ tenant, brandStyle, children }) {
  const logoUrl = tenant?.logo_url;
  return (
    <div className="min-h-screen bg-slate-50" style={brandStyle}>
      <header className="bg-white border-b border-slate-200 py-4 px-6 flex items-center">
        {logoUrl ? (
          <img src={logoUrl} alt={tenant?.name || 'Logo'} className="h-8 w-auto object-contain" />
        ) : (
          <span className="font-semibold text-slate-800 text-lg">
            {tenant?.name || 'Document Signing'}
          </span>
        )}
      </header>
      <main className="max-w-3xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
