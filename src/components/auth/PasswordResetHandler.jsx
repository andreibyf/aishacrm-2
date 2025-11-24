import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * PasswordResetHandler - Detects PASSWORD_RECOVERY event and forces user to set new password
 * before allowing access to the app. Prevents auto-login after reset link click.
 */
export default function PasswordResetHandler({ children }) {
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('[PasswordResetHandler] PASSWORD_RECOVERY detected - requiring password change');
        setIsRecoveryMode(true);
        setError('');
        setSuccess(false);
      }
    });

    // Check if we're currently in recovery mode by detecting the hash parameter
    // This triggers Supabase to exchange the token and fire PASSWORD_RECOVERY event
    const checkRecoveryState = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');

      // If recovery hash is present, call getSession() to trigger token exchange
      // This will cause PASSWORD_RECOVERY event to fire if successful
      if (type === 'recovery') {
        console.log('[PasswordResetHandler] Recovery hash detected, triggering session check');
        try {
          await supabase.auth.getSession();
          // The PASSWORD_RECOVERY event handler above will set isRecoveryMode
        } catch (error) {
          console.error('[PasswordResetHandler] Error during recovery session check:', error);
          setError('Invalid or expired reset link. Please request a new one.');
        }
      }
    };

    checkRecoveryState();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validation
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
      // Update password using the temporary recovery session
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw updateError;
      }

      console.log('[PasswordResetHandler] Password updated successfully');
      setSuccess(true);

      // Sign out to require explicit login with new password
      await supabase.auth.signOut();
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login?reset=success';
      }, 2000);

    } catch (err) {
      console.error('[PasswordResetHandler] Password update failed:', err);
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  // If in recovery mode, show password reset form
  if (isRecoveryMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>
              Please enter a new password to continue
            </CardDescription>
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

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>

                <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-4">
                  You'll need to log in again after changing your password
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not in recovery mode - render children normally
  return <>{children}</>;
}
