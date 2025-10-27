import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from '@/lib/supabase';

/**
 * PasswordChangeModal - Forces user to change temporary password on first login
 * 
 * Shows a blocking modal when user_metadata.password_change_required is true
 * Updates password in Supabase Auth and clears the flag after successful change
 */
export default function PasswordChangeModal({ user, onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [errors, setErrors] = useState({});

  const validatePassword = (password) => {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*)');
    }
    
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    // Validate password strength
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      setErrors({ newPassword: passwordErrors.join(', ') });
      return;
    }

    setIsChanging(true);

    try {
      // Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          ...user.user_metadata,
          password_change_required: false, // Clear the flag
          password_changed_at: new Date().toISOString(),
        }
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      toast.success('Password changed successfully!');
      
      // Notify parent component (triggers reload/refresh)
      if (onPasswordChanged) {
        onPasswordChanged();
      }
    } catch (error) {
      console.error('[Password Change] Error:', error);
      setErrors({ submit: error.message || 'Failed to change password. Please try again.' });
      toast.error('Password change failed: ' + error.message);
    } finally {
      setIsChanging(false);
    }
  };

  // Calculate password expiration time
  const expiresAt = user?.user_metadata?.password_expires_at;
  const expirationDate = expiresAt ? new Date(expiresAt) : null;
  const timeRemaining = expirationDate ? Math.max(0, Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60))) : null;

  return (
    <Dialog open={true} onOpenChange={() => {}} modal>
      <DialogContent 
        className="sm:max-w-md" 
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Password Change Required
          </DialogTitle>
          <DialogDescription>
            Your temporary password must be changed before you can continue.
            {timeRemaining !== null && (
              <span className="block mt-2 text-amber-600 font-medium">
                ⏱️ Password expires in {timeRemaining} hour{timeRemaining !== 1 ? 's' : ''}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              autoFocus
              disabled={isChanging}
            />
            {errors.newPassword && (
              <p className="text-sm text-red-600 mt-1">{errors.newPassword}</p>
            )}
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              disabled={isChanging}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-600 mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {errors.submit}
            </div>
          )}

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
            <div className="font-semibold mb-2">Password Requirements:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>At least 8 characters long</li>
              <li>One uppercase letter (A-Z)</li>
              <li>One lowercase letter (a-z)</li>
              <li>One number (0-9)</li>
              <li>One special character (!@#$%^&*)</li>
            </ul>
          </div>

          <Button type="submit" className="w-full" disabled={isChanging}>
            {isChanging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Changing Password...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Change Password
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
