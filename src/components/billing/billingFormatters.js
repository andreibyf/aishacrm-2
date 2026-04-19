/**
 * Shared helpers for the billing UI.
 *
 * Keeping these in one place prevents component-level drift and gives
 * tests a single target for formatting rules.
 *
 * Note: formatDate is re-exported from the centralized shared util at
 * src/utils/dateFormatting.js so billing dates format consistently with
 * the rest of the app (and handle invalid/missing values uniformly).
 */

// Re-export the shared formatter so billing callers never have to know
// where it lives.
export { formatDate } from '@/utils/dateFormatting';

/** Format an integer cent amount as a currency string (default USD). */
export function formatCents(cents, currency = 'USD') {
  const amount = Number(cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unknown ISO codes
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Tailwind class map for subscription/invoice status badges. */
export const STATUS_BADGE_CLASSES = {
  // subscription statuses
  active: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  trialing: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
  past_due: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
  suspended: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
  canceled: 'bg-slate-700 text-slate-300 border-slate-600',
  incomplete: 'bg-slate-700 text-slate-300 border-slate-600',
  // invoice statuses
  draft: 'bg-slate-700 text-slate-300 border-slate-600',
  open: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
  paid: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  void: 'bg-slate-700 text-slate-400 border-slate-600',
  uncollectible: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
  // billing state
  exempt: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50',
};

/** Returns the tailwind class string for a status value, falling back to slate. */
export function statusBadgeClass(status) {
  return STATUS_BADGE_CLASSES[status] || 'bg-slate-700 text-slate-300 border-slate-600';
}

/** Humanize a snake_case event type for display ("payment.received" -> "Payment received"). */
export function humanizeEventType(type) {
  if (!type) return '';
  return type
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}
