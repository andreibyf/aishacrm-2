import React, { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBackendUrl } from '@/api/backendUrl';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json();

      if (!response.ok) {
        const isRateLimit =
          response.status === 429 ||
          (result.message &&
            (result.message.includes('rate limit') ||
              result.message.includes('over_email_send_rate_limit')));

        if (isRateLimit) {
          throw new Error('Too many reset attempts. Please wait 60 seconds and try again.');
        }

        throw new Error(result.message || 'Failed to send reset email');
      }

      setSuccess(true);
    } catch (submitError) {
      setError(submitError?.message || 'Unable to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-4"
      style={{ background: '#080c15' }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: '800px',
            height: '800px',
            background:
              'radial-gradient(circle, rgba(20,184,166,0.07) 0%, rgba(6,182,212,0.04) 35%, transparent 65%)',
            borderRadius: '50%',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(20,184,166,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(20,184,166,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Card */}
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
        <div
          className="h-1 w-full"
          style={{ background: 'linear-gradient(90deg, #14b8a6, #06b6d4, #22c55e)' }}
        />
        <div className="p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Forgot Password</h2>
            <p className="text-slate-400 text-sm">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="h-12 w-12" style={{ color: '#22c55e' }} />
              <p className="text-center text-sm text-slate-300">
                Reset email sent. Please check your inbox (and spam folder).
              </p>
              <Button
                className="w-full text-white font-semibold py-3"
                style={{
                  background: 'linear-gradient(90deg, #14b8a6, #06b6d4)',
                  boxShadow: '0 4px 20px rgba(20, 184, 166, 0.3)',
                }}
                onClick={() => {
                  window.location.href = '/login';
                }}
              >
                Back to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg"
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                  }}
                >
                  <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: '#f87171' }} />
                  <p className="text-sm" style={{ color: '#fca5a5' }}>
                    {error}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-2 text-slate-300"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  disabled={loading}
                  className="w-full text-white placeholder-slate-500 focus:outline-none focus:ring-2"
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    '--tw-ring-color': '#14b8a6',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white px-4 py-3 rounded-lg transition-all font-semibold text-base hover:brightness-110 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(90deg, #14b8a6, #06b6d4)',
                  boxShadow: '0 4px 20px rgba(20, 184, 166, 0.3)',
                }}
              >
                {loading ? 'Sending...' : 'Send Reset Email'}
              </button>

              <button
                type="button"
                className="w-full px-4 py-3 rounded-lg transition-all font-medium text-sm hover:brightness-110 disabled:opacity-50"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(100, 116, 139, 0.3)',
                  color: '#94a3b8',
                }}
                onClick={() => {
                  window.location.href = '/login';
                }}
                disabled={loading}
              >
                Back to Login
              </button>
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
