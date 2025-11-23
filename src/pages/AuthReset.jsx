import React from 'react';
import PasswordResetHandler from '@/components/auth/PasswordResetHandler';

// Dedicated password reset landing page. Supabase redirectTo should point here.
// This page ensures the recovery session immediately triggers the reset form.
export default function AuthResetPage() {
  return (
    <PasswordResetHandler>
      {/* Empty children – handler will render reset form when in recovery mode. */}
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'60vh'}}>
        <p style={{opacity:0.6}}>Preparing password reset...</p>
      </div>
    </PasswordResetHandler>
  );
}
