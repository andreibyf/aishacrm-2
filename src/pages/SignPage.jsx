// 4VD-43: public signing page placeholder. The full renderer ships on day 4
// — public PDF preview over pdfjs-dist with field overlays in signer mode
// (signature pad, text inputs, etc.). Until then this route returns a polite
// "in rebuild" placeholder so any stale email link from prior dev/staging
// test sends doesn't show a broken page.
//
// The existing route in src/pages/index.jsx — `/sign/:slug/:token` — is
// preserved so links keep resolving; the route signature will tighten to
// `/sign/:token` once signing_sessions.signing_token replaces the legacy
// slug+token pair on day 4.

export default function SignPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md w-full bg-background border rounded-lg shadow-sm p-6 space-y-3">
        <h1 className="text-xl font-semibold">Signing temporarily unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This document signing flow is being rebuilt. If you received this link from someone in
          your team or a vendor, please ask them to re-send the document — the new system goes
          live shortly.
        </p>
        <p className="text-xs text-muted-foreground">Reference: 4VD-43 (in-house eSign engine).</p>
      </div>
    </div>
  );
}
