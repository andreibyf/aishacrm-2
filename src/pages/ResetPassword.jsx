import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [tokenExtracted, setTokenExtracted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Extract access_token from URL hash (Supabase redirects with #access_token=...)
    const hash = location.hash;
    if (hash && !tokenExtracted) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        setAccessToken(token);
        setTokenExtracted(true);
        
        // CRITICAL: Clear the hash from URL to prevent Supabase from auto-logging in
        window.history.replaceState(null, '', '/reset-password');
        
        // Also clear any Supabase session storage to prevent auto-login
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.clear();
      } else {
        toast.error('Invalid reset link. Please request a new password reset.');
        setTimeout(() => navigate('/'), 3000);
      }
    } else if (!hash && !tokenExtracted) {
      toast.error('Invalid reset link. Please request a new password reset.');
      setTimeout(() => navigate('/'), 3000);
    }
  }, [location, navigate, tokenExtracted]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!accessToken) {
      toast.error('Invalid reset token. Please request a new password reset.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/users/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          new_password: password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        toast.success('Password updated successfully! Redirecting to login...');
        
        // Clear any session data before redirecting
        localStorage.clear();
        sessionStorage.clear();
        
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        toast.error(data.message || 'Failed to update password');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-slate-400">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              New Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="bg-slate-700 border-slate-600 text-white"
              disabled={loading || !accessToken}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-300">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="bg-slate-700 border-slate-600 text-white"
              disabled={loading || !accessToken}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={loading || !accessToken}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-slate-400 hover:text-slate-300 text-sm"
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
