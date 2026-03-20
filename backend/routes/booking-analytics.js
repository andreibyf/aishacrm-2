/**
 * Booking Analytics Routes
 *
 * Endpoints (all tenant-scoped):
 *   GET /api/analytics/bookings          — booking counts by status, completion rate, no-show rate, lead time
 *   GET /api/analytics/packages          — packages sold, revenue, credit utilization, popular slots
 *   GET /api/analytics/credits-utilization — credit balance distribution, top bookers, time-to-first-booking
 *
 * Query params (all endpoints):
 *   from  — ISO date start (default: 30 days ago)
 *   to    — ISO date end   (default: now)
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { validateTenantAccess, requireAdminRole } from '../middleware/validateTenant.js';

export default function createBookingAnalyticsRoutes() {
  const router = express.Router();
  router.use(validateTenantAccess);
  router.use(requireAdminRole);

  function resolveTenantId(req) {
    const id = req.tenant?.id || req.query?.tenant_id;
    if (!id) return { error: 'tenant_id is required' };
    return { tenant_id: id };
  }

  function parseDateRange(query) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (isNaN(to.getTime()) || isNaN(from.getTime())) {
      return { error: 'Invalid date range. Use ISO 8601 format for \'from\' and \'to\'.' };
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }

  // GET /api/analytics/bookings
  router.get('/bookings', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { from, to, error: rangeError } = parseDateRange(req.query);
      if (rangeError) return res.status(400).json({ status: 'error', message: rangeError });
      const supabase = getSupabaseClient();

      // Bookings by status within date range
      const { data: bookings, error: dbErr } = await supabase
        .from('booking_sessions')
        .select('status, scheduled_start, created_at')
        .eq('tenant_id', tenant_id)
        .gte('scheduled_start', from)
        .lte('scheduled_start', to);

      if (dbErr) throw new Error(dbErr.message);

      const total = bookings?.length ?? 0;
      const byStatus = {};
      let totalLeadTimeMs = 0;
      let leadTimeCount = 0;

      for (const b of bookings ?? []) {
        byStatus[b.status] = (byStatus[b.status] || 0) + 1;
        if (b.created_at && b.scheduled_start) {
          const lead = new Date(b.scheduled_start) - new Date(b.created_at);
          if (lead > 0) {
            totalLeadTimeMs += lead;
            leadTimeCount++;
          }
        }
      }

      const completed = byStatus.completed ?? 0;
      const noShow = byStatus.no_show ?? 0;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      const noShowRate = total > 0 ? Math.round((noShow / total) * 100) : 0;
      const avgLeadTimeDays =
        leadTimeCount > 0
          ? Math.round(totalLeadTimeMs / leadTimeCount / (1000 * 60 * 60 * 24))
          : null;

      // Daily trend for charts
      const dailyMap = {};
      for (const b of bookings ?? []) {
        const day = b.scheduled_start?.slice(0, 10);
        if (!day) continue;
        if (!dailyMap[day]) dailyMap[day] = { date: day, total: 0, completed: 0, cancelled: 0 };
        dailyMap[day].total++;
        if (b.status === 'completed') dailyMap[day].completed++;
        if (b.status === 'cancelled') dailyMap[day].cancelled++;
      }
      const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        status: 'success',
        data: {
          total,
          by_status: byStatus,
          completion_rate_pct: completionRate,
          no_show_rate_pct: noShowRate,
          avg_lead_time_days: avgLeadTimeDays,
          daily_trend: dailyTrend,
        },
        meta: { from, to },
      });
    } catch (err) {
      logger.error('[BookingAnalytics] GET /bookings error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/analytics/packages
  router.get('/packages', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const { from, to, error: rangeError } = parseDateRange(req.query);
      if (rangeError) return res.status(400).json({ status: 'error', message: rangeError });
      const supabase = getSupabaseClient();

      // Credits purchased (= packages sold) in date range
      const { data: credits, error: credErr } = await supabase
        .from('session_credits')
        .select(
          `
          id, credits_purchased, credits_remaining, purchase_date, expiry_date,
          session_packages (id, name, price_cents, session_count)
        `,
        )
        .eq('tenant_id', tenant_id)
        .gte('purchase_date', from)
        .lte('purchase_date', to);

      if (credErr) throw new Error(credErr.message);

      // Aggregate per package
      const pkgMap = {};
      let totalRevenueCents = 0;
      let totalPurchased = 0;
      let totalUsed = 0;
      let totalExpiredUnused = 0;
      const now = new Date();

      for (const c of credits ?? []) {
        const pkg = c.session_packages;
        if (!pkg) continue;

        const pkgId = pkg.id;
        if (!pkgMap[pkgId]) {
          pkgMap[pkgId] = {
            package_id: pkgId,
            name: pkg.name,
            sold_count: 0,
            revenue_cents: 0,
            credits_purchased: 0,
            credits_used: 0,
            credits_expired_unused: 0,
          };
        }

        const used = c.credits_purchased - c.credits_remaining;
        const isExpired = new Date(c.expiry_date) < now;

        pkgMap[pkgId].sold_count++;
        pkgMap[pkgId].revenue_cents += pkg.price_cents || 0;
        pkgMap[pkgId].credits_purchased += c.credits_purchased;
        pkgMap[pkgId].credits_used += used;
        if (isExpired && c.credits_remaining > 0) {
          pkgMap[pkgId].credits_expired_unused += c.credits_remaining;
          totalExpiredUnused += c.credits_remaining;
        }

        totalRevenueCents += pkg.price_cents || 0;
        totalPurchased += c.credits_purchased;
        totalUsed += used;
      }

      // Hour-of-day booking distribution (popular slots)
      const { data: bookings } = await supabase
        .from('booking_sessions')
        .select('scheduled_start')
        .eq('tenant_id', tenant_id)
        .gte('scheduled_start', from)
        .lte('scheduled_start', to)
        .not('status', 'eq', 'cancelled');

      const hourMap = {};
      for (const b of bookings ?? []) {
        const hour = new Date(b.scheduled_start).getUTCHours();
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      }
      const popularSlots = Object.entries(hourMap)
        .map(([hour, count]) => ({ hour: Number(hour), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        status: 'success',
        data: {
          total_revenue_cents: totalRevenueCents,
          packages: Object.values(pkgMap).sort((a, b) => b.sold_count - a.sold_count),
          credit_utilization: {
            total_purchased: totalPurchased,
            total_used: totalUsed,
            total_expired_unused: totalExpiredUnused,
            utilization_rate_pct:
              totalPurchased > 0 ? Math.round((totalUsed / totalPurchased) * 100) : 0,
          },
          popular_slots: popularSlots,
        },
        meta: { from, to },
      });
    } catch (err) {
      logger.error('[BookingAnalytics] GET /packages error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/analytics/credits-utilization
  router.get('/credits-utilization', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getSupabaseClient();

      // All active credits for balance distribution
      const { data: credits, error: credErr } = await supabase
        .from('session_credits')
        .select(
          `
          id, contact_id, lead_id, credits_purchased, credits_remaining,
          purchase_date, expiry_date,
          contacts:contact_id (id, first_name, last_name, email),
          leads:lead_id (id, first_name, last_name, email)
        `,
        )
        .eq('tenant_id', tenant_id)
        .gt('credits_remaining', 0)
        .gt('expiry_date', new Date().toISOString());

      if (credErr) throw new Error(credErr.message);

      // Balance distribution buckets
      const buckets = { '1-2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
      const entityUsage = {};

      for (const c of credits ?? []) {
        const rem = c.credits_remaining;
        if (rem <= 2) buckets['1-2']++;
        else if (rem <= 5) buckets['3-5']++;
        else if (rem <= 10) buckets['6-10']++;
        else buckets['11+']++;

        const entity = c.contacts || c.leads;
        if (!entity) continue;
        const key = entity.id;
        if (!entityUsage[key]) {
          entityUsage[key] = {
            id: entity.id,
            name: `${entity.first_name || ''} ${entity.last_name || ''}`.trim() || entity.email,
            email: entity.email,
            total_credits: 0,
            total_remaining: 0,
          };
        }
        entityUsage[key].total_credits += c.credits_purchased;
        entityUsage[key].total_remaining += c.credits_remaining;
      }

      // Top bookers by credits purchased (all time)
      const topBookers = Object.values(entityUsage)
        .sort((a, b) => b.total_credits - a.total_credits)
        .slice(0, 10);

      // Avg time-to-first-booking after purchase
      const { data: firstBookings } = await supabase
        .from('booking_sessions')
        .select('contact_id, lead_id, scheduled_start')
        .eq('tenant_id', tenant_id)
        .order('scheduled_start', { ascending: true });

      const firstBookingMap = {};
      for (const b of firstBookings ?? []) {
        const key = b.contact_id || b.lead_id;
        if (key && !firstBookingMap[key]) firstBookingMap[key] = new Date(b.scheduled_start);
      }

      let totalDays = 0;
      let pairCount = 0;
      for (const c of credits ?? []) {
        const key = c.contact_id || c.lead_id;
        const firstBooking = firstBookingMap[key];
        if (firstBooking && c.purchase_date) {
          const days = (firstBooking - new Date(c.purchase_date)) / (1000 * 60 * 60 * 24);
          if (days >= 0 && days < 365) {
            totalDays += days;
            pairCount++;
          }
        }
      }

      res.json({
        status: 'success',
        data: {
          balance_distribution: Object.entries(buckets).map(([range, count]) => ({
            range,
            count,
          })),
          top_bookers: topBookers,
          avg_days_to_first_booking: pairCount > 0 ? Math.round(totalDays / pairCount) : null,
          active_credit_holders: Object.keys(entityUsage).length,
        },
      });
    } catch (err) {
      logger.error('[BookingAnalytics] GET /credits-utilization error', { error: err.message });
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
