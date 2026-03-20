/**
 * Calendar Service
 *
 * Frontend bridge for the 2-way Cal.com ↔ CRM calendar sync.
 *
 *   checkCalendarConflict  — queries CRM activities for time overlap before booking
 *   createCalendarEvent    — creates a CRM activity (backend then pushes it to Cal.com)
 *   findNextAvailableSlot  — scans CRM activities to find the next conflict-free slot
 *
 * The CRM calendar is the go-between:
 *   Personal Calendar (Google/Outlook)  ↔  Cal.com  ↔  AiSHA CRM Activities
 */

import { supabase } from '@/lib/supabase';

export interface CalendarEvent {
  tenantId: string;
  leadId?: string;
  contactId?: string;
  /** ISO 8601 datetime — treated as UTC */
  datetime: string;
  durationMinutes?: number;
  title?: string;
  description?: string;
  /** Activity type — defaults to 'meeting' */
  type?: string;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/**
 * Check if any scheduled CRM activities overlap with the proposed datetime window.
 *
 * @param tenantId       Tenant UUID
 * @param datetime       Proposed start time (ISO 8601 / UTC)
 * @param durationMinutes Duration of the event in minutes (default 60)
 */
export async function checkCalendarConflict(
  tenantId: string,
  datetime: string,
  durationMinutes = 60,
): Promise<boolean> {
  try {
    const start = new Date(datetime);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const dateStr = start.toISOString().split('T')[0];

    const headers = await getAuthHeader();
    const res = await fetch(
      `/api/v2/activities?tenant_id=${encodeURIComponent(tenantId)}&due_date=${dateStr}&status=scheduled&limit=100`,
      { headers },
    );
    if (!res.ok) return false;

    const json = await res.json();
    const activities: Array<{
      due_date: string;
      due_time: string;
      duration_minutes?: number;
    }> = Array.isArray(json.data?.activities)
      ? json.data.activities
      : Array.isArray(json.data)
        ? json.data
        : [];

    return activities.some((act) => {
      if (!act.due_date || !act.due_time) return false;
      const actStart = new Date(`${act.due_date}T${act.due_time}:00.000Z`);
      const actEnd = new Date(actStart.getTime() + (act.duration_minutes || 60) * 60 * 1000);
      // Overlap: actStart < proposedEnd AND actEnd > proposedStart
      return actStart < end && actEnd > start;
    });
  } catch {
    // Safe default: assume no conflict if the check fails
    return false;
  }
}

/**
 * Create a CRM activity for the given calendar event.
 * The backend will automatically push it to Cal.com as a blocker booking,
 * which Cal.com will then propagate into any connected personal calendars.
 */
export async function createCalendarEvent(
  event: CalendarEvent,
): Promise<{ id: string; success: boolean }> {
  try {
    const headers = await getAuthHeader();
    const start = new Date(event.datetime);
    const due_date = start.toISOString().split('T')[0];
    const due_time = `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`;

    const res = await fetch('/api/v2/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        tenant_id: event.tenantId,
        type: event.type || 'meeting',
        subject: event.title || 'Meeting',
        body: event.description || '',
        due_date,
        due_time,
        duration_minutes: event.durationMinutes || 60,
        status: 'scheduled',
        ...(event.leadId ? { related_to: 'lead', related_id: event.leadId } : {}),
        ...(event.contactId ? { related_to: 'contact', related_id: event.contactId } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `HTTP ${res.status}`);
    }

    const { data } = await res.json();
    return { id: data?.activity?.id || `local-${Date.now()}`, success: true };
  } catch (err) {
    console.error('[CalendarService] createCalendarEvent error:', err);
    return { id: `error-${Date.now()}`, success: false };
  }
}

const SLOT_INCREMENT_MINUTES = 30;
const MAX_SLOTS_TO_CHECK = 48; // Up to 24 hours ahead

/**
 * Find the next conflict-free time slot after the given datetime by checking CRM activities.
 * Rounds up to the nearest 30-minute boundary before scanning.
 */
export async function findNextAvailableSlot(
  tenantId: string,
  afterDatetime: string,
  durationMinutes = 60,
): Promise<string> {
  let candidate = new Date(afterDatetime);

  // Round up to the next 30-minute boundary
  const rem = candidate.getMinutes() % SLOT_INCREMENT_MINUTES;
  if (rem !== 0) {
    candidate.setMinutes(candidate.getMinutes() + (SLOT_INCREMENT_MINUTES - rem));
  }
  candidate.setSeconds(0, 0);

  for (let i = 0; i < MAX_SLOTS_TO_CHECK; i++) {
    const iso = candidate.toISOString();
    const conflict = await checkCalendarConflict(tenantId, iso, durationMinutes);
    if (!conflict) return iso;
    candidate = new Date(candidate.getTime() + SLOT_INCREMENT_MINUTES * 60 * 1000);
  }

  // Fallback: return current candidate even if we couldn't verify
  return candidate.toISOString();
}
