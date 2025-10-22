import React from "react";

export default function FooterBrand({ showLegal = true, className = "" }) {
  // Footer always shows Aisha branding - not customizable per tenant
  const AISHA_LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68ad592dcffacef630b477d2/c98adae7b_Ai-SHA-logo-2.png";

  return (
    <div className={`flex flex-col items-center text-center gap-2 ${className}`}>
      <img
        src={AISHA_LOGO_URL}
        alt="Ai‑SHA"
        className="h-16 w-auto object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />

      {showLegal && (
        <div className="text-xs text-slate-500 leading-relaxed">
          <div>Ai‑SHA® is a registered trademark of 4V Data Consulting LLC.</div>
          <div>© {new Date().getFullYear()} 4V Data Consulting LLC. All rights reserved.</div>
        </div>
      )}
    </div>
  );
}