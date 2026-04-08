/**
 * SessionCreditsPanel.jsx
 * Displays session credit balance, purchase history, and booking history.
 * Designed for embedding in ContactDetailPanel / LeadDetailPanel.
 *
 * Props:
 *   entityId   — contact or lead UUID
 *   entityType — 'contact' | 'lead'
 *   email      — contact/lead email (used for scheduler prefill)
 *   tenantId   — UUID
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CalendarCheck, CreditCard, ShoppingCart, Loader2, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatRelativeTime } from '@/utils/dateFormatting';
import { getBackendUrl } from '@/api/backendUrl';
import { supabase } from '@/lib/supabase';

async function apiFetch(path, options = {}) {
  const BACKEND_URL = getBackendUrl();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

const STATUS_COLORS = {
  confirmed: 'default',
  pending: 'secondary',
  cancelled: 'destructive',
  completed: 'outline',
  no_show: 'destructive',
};

export default function SessionCreditsPanel({ entityId, entityType, email, tenantId }) {
  const [credits, setCredits] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [packages, setPackages] = useState([]);
  const [summary, setSummary] = useState({ total_remaining: 0, active_records: 0 });
  const [loading, setLoading] = useState(true);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [purchasing, setPurchasing] = useState(false);

  const idParam = entityType === 'contact' ? `contact_id=${entityId}` : `lead_id=${entityId}`;

  const fetchData = useCallback(async () => {
    if (!entityId || !tenantId) return;
    setLoading(true);
    try {
      const [creditsRes, bookingsRes, packagesRes] = await Promise.all([
        apiFetch(`/api/session-credits?tenant_id=${tenantId}&${idParam}`),
        apiFetch(`/api/session-credits/bookings?tenant_id=${tenantId}&${idParam}`),
        apiFetch(`/api/session-packages?tenant_id=${tenantId}`),
      ]);
      const [creditsJson, bookingsJson, packagesJson] = await Promise.all([
        creditsRes.json(),
        bookingsRes.json(),
        packagesRes.json(),
      ]);
      setCredits(creditsJson.data || []);
      setSummary(creditsJson.summary || { total_remaining: 0, active_records: 0 });
      setBookings(bookingsJson.data || []);
      setPackages(packagesJson.data || []);
    } catch {
      toast.error('Failed to load session data');
    } finally {
      setLoading(false);
    }
  }, [entityId, tenantId, idParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handlePurchase() {
    if (!selectedPackageId) {
      toast.error('Please select a package');
      return;
    }
    const pkg = packages.find((p) => p.id === selectedPackageId);
    setPurchasing(true);
    try {
      const entityParam =
        entityType === 'contact' ? { contact_id: entityId } : { lead_id: entityId };

      if (pkg && pkg.price_cents > 0) {
        // Paid package → redirect to Stripe Checkout
        const successUrl = `${window.location.href}?payment=success`;
        const cancelUrl = `${window.location.href}?payment=cancelled`;
        const res = await apiFetch('/api/session-credits/checkout', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: tenantId,
            package_id: selectedPackageId,
            success_url: successUrl,
            cancel_url: cancelUrl,
            ...entityParam,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to create checkout session');
        // Redirect to Stripe hosted checkout page
        window.location.href = json.data.url;
        return; // don't run finally cleanup — page is navigating away
      } else {
        // Free / admin grant → direct purchase
        const res = await apiFetch('/api/session-credits/purchase', {
          method: 'POST',
          body: JSON.stringify({
            tenant_id: tenantId,
            package_id: selectedPackageId,
            ...entityParam,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Purchase failed');
        toast.success('Credits added successfully');
        setPurchaseOpen(false);
        setSelectedPackageId('');
        fetchData();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCredits = summary.total_remaining > 0;
  const expiringCredits = credits.filter((c) => {
    const daysLeft = (new Date(c.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
    return daysLeft > 0 && daysLeft <= 7;
  });

  return (
    <div className="space-y-4">
      {/* Credit balance banner */}
      <div
        className={`rounded-lg border p-4 flex items-center justify-between ${hasCredits ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}
      >
        <div className="flex items-center gap-3">
          <CreditCard className={`h-5 w-5 ${hasCredits ? 'text-purple-600' : 'text-gray-400'}`} />
          <div>
            <div className="font-semibold text-sm">
              {hasCredits ? (
                <span className="text-purple-700">
                  {summary.total_remaining} session{summary.total_remaining !== 1 ? 's' : ''}{' '}
                  remaining
                </span>
              ) : (
                <span className="text-gray-500">No active credits</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.active_records} active credit record{summary.active_records !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setPurchaseOpen(true)}
          variant={hasCredits ? 'outline' : 'default'}
        >
          <ShoppingCart className="h-4 w-4 mr-1" />
          Buy Package
        </Button>
      </div>

      {/* Expiry warning */}
      {expiringCredits.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Credits expiring soon:{' '}
            {expiringCredits.map((c) => (
              <span key={c.id} className="font-medium">
                {c.credits_remaining} session{c.credits_remaining !== 1 ? 's' : ''} expire{' '}
                {formatRelativeTime(c.expiry_date)}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Credit records */}
      {credits.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Purchase History</h4>
          <div className="space-y-2">
            {credits.map((credit) => {
              const expired = new Date(credit.expiry_date) < new Date();
              return (
                <div
                  key={credit.id}
                  className={`rounded border px-3 py-2 text-sm flex items-center justify-between ${expired ? 'opacity-50' : ''}`}
                >
                  <div>
                    <span className="font-medium">
                      {credit.session_packages?.name || 'Package'}
                    </span>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      Expires {formatDate(credit.expiry_date)}
                      {expired && (
                        <Badge variant="destructive" className="ml-1 text-xs">
                          Expired
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {credit.credits_remaining}/{credit.credits_purchased}
                    </div>
                    <div className="text-xs text-muted-foreground">remaining</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking history */}
      {bookings.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <CalendarCheck className="h-4 w-4" /> Booking History
          </h4>
          <div className="space-y-1.5">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="rounded border px-3 py-2 text-sm flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">
                    {formatDate(b.scheduled_start, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">{b.calcom_booking_id}</div>
                </div>
                <Badge variant={STATUS_COLORS[b.status] || 'secondary'} className="capitalize">
                  {b.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {credits.length === 0 && bookings.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No session history yet. Purchase a package to get started.
        </div>
      )}

      {/* Purchase dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Purchase Session Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active packages available. Contact your administrator to set up session packages.
              </p>
            ) : (
              <div>
                <Label>Select Package</Label>
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose a package…" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} — {pkg.session_count} sessions
                        {pkg.price_cents > 0
                          ? ` ($${(pkg.price_cents / 100).toFixed(2)})`
                          : ' (Free)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePurchase} disabled={purchasing || packages.length === 0}>
              {purchasing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
