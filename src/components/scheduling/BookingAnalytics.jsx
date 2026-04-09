/**
 * BookingAnalytics.jsx
 *
 * Analytics dashboard for scheduler booking metrics and session package performance.
 * Accessible via Settings → Booking Analytics.
 *
 * Features:
 *   - Date range picker (last 7 / 30 / 90 days or custom)
 *   - Booking stats: total, by status, completion rate, no-show rate, lead time
 *   - Package performance: revenue, utilization
 *   - Credit balance distribution
 *   - Top bookers table
 *   - CSV export
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Download, Calendar, TrendingUp, Users, Package } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { supabase } from '@/lib/supabase';
import CsvExportButton from '@/components/shared/CsvExportButton';

const STATUS_COLORS = {
  confirmed: '#22c55e',
  completed: '#3b82f6',
  cancelled: '#ef4444',
  no_show: '#f59e0b',
  pending: '#8b5cf6',
};

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

async function apiFetch(path, options = {}) {
  const backendUrl = getBackendUrl();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${backendUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function parseJsonResponse(response, fallbackMessage) {
  const contentType = response.headers?.get?.('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    const body = await response.text().catch(() => '');
    const preview = body.trim().slice(0, 80).toLowerCase();

    if (preview.startsWith('<!doctype') || preview.startsWith('<html') || preview.startsWith('<')) {
      throw new Error(`${fallbackMessage}. The server returned HTML instead of JSON.`);
    }

    throw new Error(`${fallbackMessage}. The server returned an unexpected response.`);
  }

  const json = await response.json().catch(() => null);
  if (!json) {
    throw new Error(`${fallbackMessage}. The server returned invalid JSON.`);
  }

  if (!response.ok) {
    throw new Error(json.message || fallbackMessage);
  }

  return json;
}

function StatCard({ title, value, sub, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    purple: 'text-purple-400',
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value ?? '—'}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          {Icon && <Icon className={`w-5 h-5 ${colorMap[color]}`} />}
        </div>
      </CardContent>
    </Card>
  );
}

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 365 days', days: 365 },
];

export default function BookingAnalytics({ tenantId }) {
  const [range, setRange] = useState('30');
  const [bookingData, setBookingData] = useState(null);
  const [packageData, setPackageData] = useState(null);
  const [utilizationData, setUtilizationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    const days = Number(range);
    const to = new Date().toISOString();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const qs = `tenant_id=${tenantId}&from=${from}&to=${to}`;

    try {
      const [bRes, pRes, uRes] = await Promise.all([
        apiFetch(`/api/analytics/bookings?${qs}`),
        apiFetch(`/api/analytics/packages?${qs}`),
        apiFetch(`/api/analytics/credits-utilization?tenant_id=${tenantId}`),
      ]);

      const [b, p, u] = await Promise.all([
        parseJsonResponse(bRes, 'Failed to load booking stats'),
        parseJsonResponse(pRes, 'Failed to load package stats'),
        parseJsonResponse(uRes, 'Failed to load utilization stats'),
      ]);

      setBookingData(b.data);
      setPackageData(p.data);
      setUtilizationData(u.data);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, range]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const statusChartData = bookingData
    ? Object.entries(bookingData.by_status || {}).map(([name, value]) => ({ name, value }))
    : [];

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-400">
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={fetchAll} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Booking Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Session package performance and booking metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.days} value={String(r.days)}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {packageData?.packages && (
            <CsvExportButton
              data={packageData.packages.map((p) => ({
                package: p.name,
                sold: p.sold_count,
                revenue_usd: (p.revenue_cents / 100).toFixed(2),
                credits_purchased: p.credits_purchased,
                credits_used: p.credits_used,
                credits_expired: p.credits_expired_unused,
              }))}
              filename={`booking_analytics_${new Date().toISOString().slice(0, 10)}`}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </CsvExportButton>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Bookings"
          value={bookingData?.total ?? 0}
          icon={Calendar}
          color="blue"
        />
        <StatCard
          title="Completion Rate"
          value={
            bookingData?.completion_rate_pct != null ? `${bookingData.completion_rate_pct}%` : '—'
          }
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="No-Show Rate"
          value={bookingData?.no_show_rate_pct != null ? `${bookingData.no_show_rate_pct}%` : '—'}
          icon={Users}
          color="yellow"
        />
        <StatCard
          title="Avg Lead Time"
          value={
            bookingData?.avg_lead_time_days != null ? `${bookingData.avg_lead_time_days}d` : '—'
          }
          sub="days before session"
          icon={Calendar}
          color="purple"
        />
      </div>

      {/* Revenue + utilization */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={
            packageData?.total_revenue_cents != null
              ? `$${(packageData.total_revenue_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
              : '—'
          }
          icon={Package}
          color="green"
        />
        <StatCard
          title="Credit Utilization"
          value={
            packageData?.credit_utilization?.utilization_rate_pct != null
              ? `${packageData.credit_utilization.utilization_rate_pct}%`
              : '—'
          }
          sub={`${packageData?.credit_utilization?.total_used ?? 0} / ${packageData?.credit_utilization?.total_purchased ?? 0} credits used`}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Active Credit Holders"
          value={utilizationData?.active_credit_holders ?? 0}
          icon={Users}
          color="purple"
        />
        <StatCard
          title="Avg Days to 1st Booking"
          value={
            utilizationData?.avg_days_to_first_booking != null
              ? `${utilizationData.avg_days_to_first_booking}d`
              : '—'
          }
          sub="after purchase"
          icon={Calendar}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily booking trend */}
        {bookingData?.daily_trend?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={bookingData.daily_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Total" dot={false} />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="#22c55e"
                    name="Completed"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cancelled"
                    stroke="#ef4444"
                    name="Cancelled"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Booking status pie */}
        {statusChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Bookings by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  >
                    {statusChartData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || CHART_COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Package performance */}
        {packageData?.packages?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Package Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={packageData.packages.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => (v.length > 12 ? `${v.slice(0, 12)}…` : v)}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sold_count" name="Packages Sold" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Credit balance distribution */}
        {utilizationData?.balance_distribution?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Credit Balance Distribution</CardTitle>
              <CardDescription>Active credit holders by remaining balance</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={utilizationData.balance_distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Holders" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Popular time slots */}
      {packageData?.popular_slots?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Most Popular Booking Hours (UTC)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              {packageData.popular_slots.map(({ hour, count }) => (
                <div key={hour} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                  <span className="font-mono text-sm font-semibold">
                    {String(hour).padStart(2, '0')}:00
                  </span>
                  <Badge variant="secondary">{count} bookings</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top bookers */}
      {utilizationData?.top_bookers?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Clients by Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Credits Purchased</TableHead>
                  <TableHead className="text-right">Credits Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utilizationData.top_bookers.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{b.email || '—'}</TableCell>
                    <TableCell className="text-right">{b.total_credits}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={b.total_remaining > 0 ? 'default' : 'secondary'}>
                        {b.total_remaining}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
