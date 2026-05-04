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

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBackendUrl } from '@/api/backendUrl';

// DocuSeal's embeddable signing form is loaded from their CDN as a JS
// web component. We inject the script tag once on mount and rely on the
// custom-element lifecycle to render the form when the data-src prop
// becomes available.
const DOCUSEAL_SCRIPT_SRC = 'https://cdn.docuseal.com/js/form.js';

function ensureDocusealScriptLoaded() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.customElements?.get('docuseal-form')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${DOCUSEAL_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = DOCUSEAL_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function SignPage() {
  const { slug, token } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [scriptReady, setScriptReady] = useState(false);
  const containerRef = useRef(null);

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

  // Lazy-load DocuSeal's web component script once the data resolves
  useEffect(() => {
    if (state.status !== 'ready' || state.data?.fallback) return;
    let cancelled = false;
    ensureDocusealScriptLoaded()
      .then(() => {
        if (!cancelled) setScriptReady(true);
      })
      .catch(() => {
        if (!cancelled) setScriptReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

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
      <div ref={containerRef} className="mt-6">
        {scriptReady ? (
          // The DocuSeal web component renders its own iframe + form chrome
          // when the data-src attribute is present. Using React's
          // dangerouslySetInnerHTML would also work, but the custom-element
          // approach is cleaner and benefits from React's diffing.
          <docuseal-form data-src={embed_src} data-email={state.data?.recipient_email || ''} />
        ) : (
          <div className="text-sm text-slate-500">Loading signing form…</div>
        )}
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
