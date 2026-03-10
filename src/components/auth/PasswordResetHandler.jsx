import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * PasswordResetHandler - Handles Supabase password recovery links.
 * Supports PKCE hash or query code flows and forces a password update before normal app access.
 */
export default function PasswordResetHandler({ children }) {
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        setError('');
        setSuccess(false);
      }
    }).data.subscription;

    const bootstrap = async () => {
      try {
        const url = new URL(window.location.href);
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        const params = new URLSearchParams(hash);

        const type = params.get('type');
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        // Handle bearer-style recovery links with direct tokens
        if (type === 'recovery' && access_token && refresh_token) {
          console.log('[PasswordResetHandler] Using setSession with bearer tokens...');
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            console.error('[PasswordResetHandler] setSession error:', error);
            setError(
              'This password reset link is no longer valid. Please request a new reset email.',
            );
            setBootstrapDone(true);
            return;
          }
          setIsRecoveryMode(true);
          // Clean hash to avoid re-processing
          window.history.replaceState({}, document.title, url.pathname + url.search);
          setBootstrapDone(true);
          return;
        }

        // Fallback: query-style PKCE code exchange
        const authCode = url.searchParams.get('code');
        if (authCode) {
          console.log('[PasswordResetHandler] Query code detected. Exchanging...');
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) {
            console.error('[PasswordResetHandler] exchange (query) error:', error);
            setError(
              'This password reset link is no longer valid. Please request a new reset email.',
            );
            setBootstrapDone(true);
            return;
          }
          setIsRecoveryMode(true);
          url.searchParams.delete('code');
          if (url.searchParams.has('type')) url.searchParams.delete('type');
          window.history.replaceState(
            {},
            document.title,
            url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''),
          );
          setBootstrapDone(true);
          return;
        }

        // No recovery tokens found in URL — link may be malformed or already consumed
        console.warn('[PasswordResetHandler] No recovery tokens or code found in URL.');
        setError(
          'We couldn’t verify this password reset link. It may have expired or already been used. Please request a new reset email.',
        );
      } catch (e) {
        console.error('[PasswordResetHandler] bootstrap error:', e);
        setError(
          'Something went wrong while opening this reset link. Please request a new reset email.',
        );
      } finally {
        setBootstrapDone(true);
      }
    };

    bootstrap();
    return () => sub?.unsubscribe();
  }, []);

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      console.log('[PasswordResetHandler] Password updated successfully');
      setSuccess(true);

      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = '/login?reset=success';
      }, 2000);
    } catch (err) {
      console.error('[PasswordResetHandler] Password update failed:', err);
      setError(err?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (isRecoveryMode) {
    return (
      <div
        className="relative min-h-screen flex items-center justify-center overflow-hidden px-4"
        style={{ background: '#080c15' }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '800px', height: '800px',
              background: 'radial-gradient(circle, rgba(20,184,166,0.07) 0%, rgba(6,182,212,0.04) 35%, transparent 65%)',
              borderRadius: '50%',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(rgba(20,184,166,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(20,184,166,0.5) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>
        <div
          className="relative z-10 w-full max-w-md overflow-hidden"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(20, 184, 166, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 0 60px rgba(6, 182, 212, 0.08), 0 25px 50px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #14b8a6, #06b6d4, #22c55e)' }} />
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Reset Your Password</h2>
              <p className="text-slate-400 text-sm">Please enter a new password to continue</p>
            </div>

            {success ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <CheckCircle2 className="h-12 w-12" style={{ color: '#22c55e' }} />
                <p className="text-center text-slate-300">
                  Password updated successfully! Redirecting to login...
                </p>
              </div>
            ) : (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                {error && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: '#f87171' }} />
                    <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium mb-2 text-slate-300">
                    New Password
                  </label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 characters)"
                    required
                    minLength={8}
                    disabled={loading}
                    className="w-full text-white placeholder-slate-500"
                    style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.3)', '--tw-ring-color': '#14b8a6' }}
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-slate-300">
                    Confirm Password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                    disabled={loading}
                    className="w-full text-white placeholder-slate-500"
                    style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.3)', '--tw-ring-color': '#14b8a6' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white px-4 py-3 rounded-lg transition-all font-semibold text-base hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'linear-gradient(90deg, #14b8a6, #06b6d4)', boxShadow: '0 4px 20px rgba(20,184,166,0.3)' }}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>

                <p className="text-xs text-center text-slate-500 mt-4">
                  You&apos;ll need to log in again after changing your password
                </p>
              </form>
            )}

            <p className="mt-6 text-center text-xs text-slate-600">
              AiSHA CRM &mdash; AI-Native Executive Assistant
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Bootstrap finished but recovery mode was not activated — show error
  if (bootstrapDone && error) {
    return (
      <div
        className="relative min-h-screen flex items-center justify-center overflow-hidden px-4"
        style={{ background: '#080c15' }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '800px', height: '800px',
              background: 'radial-gradient(circle, rgba(20,184,166,0.07) 0%, rgba(6,182,212,0.04) 35%, transparent 65%)',
              borderRadius: '50%',
            }}
          />
        </div>
        <div
          className="relative z-10 w-full max-w-md overflow-hidden"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(20, 184, 166, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 0 60px rgba(6, 182, 212, 0.08), 0 25px 50px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #14b8a6, #06b6d4, #22c55e)' }} />
          <div className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Password Reset</h2>
              <p className="text-slate-400 text-sm">This reset link is no longer valid</p>
            </div>
            <div className="flex flex-col items-center gap-4 py-4">
              <AlertCircle className="h-12 w-12" style={{ color: '#f87171' }} />
              <p className="text-center text-sm" style={{ color: '#fca5a5' }}>{error}</p>
              <button
                className="mt-2 w-full text-white px-4 py-3 rounded-lg transition-all font-semibold text-base hover:brightness-110"
                style={{ background: 'linear-gradient(90deg, #14b8a6, #06b6d4)', boxShadow: '0 4px 20px rgba(20,184,166,0.3)' }}
                onClick={() => { window.location.href = '/forgot-password'; }}
              >
                Request New Reset Email
              </button>
            </div>
            <p className="mt-6 text-center text-xs text-slate-600">
              AiSHA CRM &mdash; AI-Native Executive Assistant
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
