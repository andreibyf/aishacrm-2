import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
            setError('Invalid or expired reset link. Please request a new one.');
            return;
          }
          setIsRecoveryMode(true);
          // Clean hash to avoid re-processing
          window.history.replaceState({}, document.title, url.pathname + url.search);
          return;
        }

        // Fallback: query-style code exchange
        const hasQueryCode = url.searchParams.get('code');
        if (hasQueryCode) {
          console.log('[PasswordResetHandler] Query code detected. Exchanging...');
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) {
            console.error('[PasswordResetHandler] exchange (query) error:', error);
            setError('Invalid or expired reset link. Please request a new one.');
            return;
          }
          setIsRecoveryMode(true);
          url.searchParams.delete('code');
          if (url.searchParams.has('type')) url.searchParams.delete('type');
          window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
        }
      } catch (e) {
        console.error('[PasswordResetHandler] bootstrap error:', e);
        setError('Unexpected error handling reset link.');
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>Please enter a new password to continue</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-center text-slate-700 dark:text-slate-300">
                  Password updated successfully! Redirecting to login...
                </p>
              </div>
            ) : (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
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
                    className="w-full"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
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
                    className="w-full"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>

                <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-4">
                  You&apos;ll need to log in again after changing your password
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
