/**
 * Centralized Date Formatting Utilities
 *
 * All date formatting functions should be imported from here to ensure
 * consistent date handling across the application.
 */

/**
 * Format a date for display (e.g., "Jan 15, 2025")
 * @param {string|Date|null|undefined} dateInput - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date or fallback string
 */
export function formatDate(dateInput, options = {}) {
  if (!dateInput) return '—';

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';

    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options,
    };

    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format a date for HTML input fields (yyyy-MM-dd)
 * @param {string|Date|null|undefined} dateInput - Date to format
 * @returns {string} Date in yyyy-MM-dd format or empty string
 */
export function formatDateForInput(dateInput) {
  if (!dateInput) return '';

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

/**
 * Format a date with time (e.g., "Jan 15, 2025, 2:30 PM")
 * @param {string|Date|null|undefined} dateInput - Date to format
 * @returns {string} Formatted date with time
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '—';

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format a date for datetime-local input (yyyy-MM-ddTHH:mm)
 * @param {string|Date|null|undefined} dateInput - Date to format
 * @returns {string} Date in datetime-local format or empty string
 */
export function formatDateTimeForInput(dateInput) {
  if (!dateInput) return '';

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 * @param {string|Date|null|undefined} dateInput - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return '—';

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffSecs = Math.round(diffMs / 1000);
    const diffMins = Math.round(diffSecs / 60);
    const diffHours = Math.round(diffMins / 60);
    const diffDays = Math.round(diffHours / 24);

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (Math.abs(diffSecs) < 60) {
      return rtf.format(diffSecs, 'second');
    } else if (Math.abs(diffMins) < 60) {
      return rtf.format(diffMins, 'minute');
    } else if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour');
    } else if (Math.abs(diffDays) < 30) {
      return rtf.format(diffDays, 'day');
    } else {
      return formatDate(date);
    }
  } catch {
    return '—';
  }
}

/**
 * Parse a date input string to Date object
 * @param {string|Date|null|undefined} dateInput - Date to parse
 * @returns {Date|null} Parsed Date or null if invalid
 */
export function parseDate(dateInput) {
  if (!dateInput) return null;

  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Check if a date is in the past
 * @param {string|Date|null|undefined} dateInput - Date to check
 * @returns {boolean}
 */
export function isPastDate(dateInput) {
  const date = parseDate(dateInput);
  if (!date) return false;
  return date.getTime() < Date.now();
}

/**
 * Check if a date is today
 * @param {string|Date|null|undefined} dateInput - Date to check
 * @returns {boolean}
 */
export function isToday(dateInput) {
  const date = parseDate(dateInput);
  if (!date) return false;

  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Get ISO date string (yyyy-MM-dd) for today
 * @returns {string}
 */
export function getTodayISO() {
  return formatDateForInput(new Date());
}

export default {
  formatDate,
  formatDateForInput,
  formatDateTime,
  formatDateTimeForInput,
  formatRelativeTime,
  parseDate,
  isPastDate,
  isToday,
  getTodayISO,
};
