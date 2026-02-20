import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getBackendUrl } from '@/api/backendUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, UserPlus } from 'lucide-react';

/**
 * AcceptInvite - Handles Supabase invitation links.
 * When a user clicks an invite link from their email, they land here to set their password.
 *
 * Supabase invite links include:
 * - type=invite in the hash
 * - access_token and refresh_token for authentication
 */
export default function AcceptInvite() {
  const [isInviteMode, setIsInviteMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const url = new URL(window.location.href);
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        const params = new URLSearchParams(hash);

        const type = params.get('type');
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        console.log('[AcceptInvite] type:', type, 'has tokens:', !!access_token);

        // Handle invite links with direct tokens
        if (
          (type === 'invite' || type === 'signup' || type === 'magiclink') &&
          access_token &&
          refresh_token
        ) {
          console.log('[AcceptInvite] Using setSession with bearer tokens...');
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (sessionError) {
            console.error('[AcceptInvite] setSession error:', sessionError);
            setError(
              'Invalid or expired invitation link. Please contact your administrator for a new invite.',
            );
            setLoading(false);
            return;
          }

          // Get user email for display
          if (data?.user?.email) {
            setUserEmail(data.user.email);
          }

          setIsInviteMode(true);
          // Clean hash to avoid re-processing
          window.history.replaceState({}, document.title, url.pathname);
          setLoading(false);
          return;
        }

        // Check for query-style code exchange (PKCE flow)
        const hasQueryCode = url.searchParams.get('code');
        if (hasQueryCode) {
          console.log('[AcceptInvite] Query code detected. Exchanging...');
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            window.location.href,
          );

          if (exchangeError) {
            console.error('[AcceptInvite] exchange error:', exchangeError);
            setError(
              'Invalid or expired invitation link. Please contact your administrator for a new invite.',
            );
            setLoading(false);
            return;
          }

          if (data?.user?.email) {
            setUserEmail(data.user.email);
          }

          setIsInviteMode(true);
          url.searchParams.delete('code');
          if (url.searchParams.has('type')) url.searchParams.delete('type');
          window.history.replaceState({}, document.title, url.pathname);
          setLoading(false);
          return;
        }

        // No valid invite parameters found
        console.warn('[AcceptInvite] No invite tokens found, redirecting to login');
        setError('No invitation found. Please use the link from your invitation email.');
        setLoading(false);
      } catch (e) {
        console.error('[AcceptInvite] bootstrap error:', e);
        setError('Unexpected error handling invitation link.');
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) errors.push('at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('a number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('a special character');
    return errors;
  };

  const handlePasswordCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate password strength
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      setError(`Password must contain ${passwordErrors.join(', ')}`);
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

      console.log('[AcceptInvite] Password set successfully');

      // Sync invite acceptance to backend (public.users + employees)
      // This must happen BEFORE signOut while we still have a valid session
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) {
          const backendUrl = getBackendUrl();
          const syncRes = await fetch(`${backendUrl}/api/auth/invite-accepted`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken }),
          });
          if (syncRes.ok) {
            console.log('[AcceptInvite] Backend sync successful');
          } else {
            const syncBody = await syncRes.json().catch(() => ({}));
            console.warn('[AcceptInvite] Backend sync returned:', syncRes.status, syncBody);
          }
        } else {
          console.warn('[AcceptInvite] No session access_token available for backend sync');
        }
      } catch (syncErr) {
        // Non-fatal: password is already set in auth.users; backend sync is best-effort
        console.warn('[AcceptInvite] Backend sync failed (non-fatal):', syncErr);
      }

      setSuccess(true);

      // Sign out and redirect to login
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = '/login?invite=success';
      }, 2500);
    } catch (err) {
      console.error('[AcceptInvite] Password update failed:', err);
      setError(err?.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading && !error && !isInviteMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-slate-600 dark:text-slate-400">Processing your invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state (no valid invite)
  if (error && !isInviteMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-red-600">Invitation Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md mb-4">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
            <Button onClick={() => (window.location.href = '/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invite mode - show password creation form
  if (isInviteMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <UserPlus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-2xl">Welcome to AiSHA CRM</CardTitle>
                <CardDescription>
                  {userEmail
                    ? `Create a password for ${userEmail}`
                    : 'Create your password to get started'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-center text-slate-700 dark:text-slate-300">
                  Account activated successfully!
                  <br />
                  Redirecting to login...
                </p>
              </div>
            ) : (
              <form onSubmit={handlePasswordCreate} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300"
                  >
                    Create Password
                  </label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    minLength={8}
                    disabled={loading}
                    className="w-full"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300"
                  >
                    Confirm Password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    required
                    minLength={8}
                    disabled={loading}
                    className="w-full"
                    autoComplete="new-password"
                  />
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
                  <p className="font-medium mb-1">Password requirements:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>At least 8 characters</li>
                    <li>One uppercase letter</li>
                    <li>One lowercase letter</li>
                    <li>One number</li>
                    <li>One special character (!@#$%^&*)</li>
                  </ul>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback
  return null;
}
