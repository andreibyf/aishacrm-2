// @ts-check
/**
 * signingActivityTracker (4VD-43 day 4 — replaces the deleted DocuSeal-era
 * activity-collapse logic).
 *
 * Goal: ONE row in the activities table per signing_session, status flows
 * pending → completed/cancelled as the recipient acts. This collapses what
 * would otherwise be 4 separate timeline rows (sent/viewed/signed/completed
 * or sent/viewed/declined/expired) into a single row with metadata.
 *
 * Wire points:
 *   - submissions.js POST  /api/submissions       → createSendActivity
 *   - public-sign.js GET   /api/sign/:token       → updateActivityForView
 *   - public-sign.js POST  /api/sign/:token/submit→ updateActivityForSign
 *   - public-sign.js POST  /api/sign/:token/decline→ updateActivityForDecline
 *
 * Lookup is by `metadata->>signing_session_id` so the four call sites can
 * find their row without threading the activity_id through every response.
 *
 * All write paths are best-effort: a failure here does NOT propagate to
 * the caller. The signing_sessions row + audit jsonb are the source of
 * truth; the activity is a denormalised UX surface.
 */

import logger from './logger.js';
import { computeDocumentDueFields } from './computeDocumentDueFields.js';
import { resolveRelatedEntityFields } from './resolveRelatedEntityFields.js';

/**
 * Resolve a user's email (req.user.email) to a tenant-scoped employees.id.
 *
 * activities.assigned_to has a FK to employees(id) — passing a users.id
 * UUID directly causes a silent FK violation that fails the entire row
 * insert. The day-4a v1 of this tracker did exactly that (passed
 * req.user.id) and the `.catch(() => undefined)` swallowed every error,
 * leaving 10 sessions with zero activity rows in dev.
 *
 * @param {object} supabase service-role client
 * @param {string} tenantId
 * @param {string|null} userEmail
 * @returns {Promise<string|null>} employees.id or null when no match
 */
async function resolveAssignedEmployee(supabase, tenantId, userEmail) {
  if (!userEmail || typeof userEmail !== 'string') return null;
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', userEmail)
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn('[signingActivityTracker] employee lookup failed', {
        tenantId,
        userEmail,
        message: error.message,
      });
      return null;
    }
    return data?.id || null;
  } catch (err) {
    logger.warn('[signingActivityTracker] employee lookup threw', {
      tenantId,
      userEmail,
      message: err?.message || String(err),
    });
    return null;
  }
}

/**
 * Find the activity row for a given signing_session, if any.
 *
 * @param {object} supabase service-role client
 * @param {string} tenantId
 * @param {string} signingSessionId
 * @returns {Promise<{ id: string, status: string, metadata: object }|null>}
 */
async function findActivityForSession(supabase, tenantId, signingSessionId) {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('id, status, metadata')
      .eq('tenant_id', tenantId)
      .filter('metadata->>signing_session_id', 'eq', signingSessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn('[signingActivityTracker] activity lookup failed', {
        tenantId,
        signingSessionId,
        message: error.message,
      });
      return null;
    }
    return data || null;
  } catch (err) {
    logger.warn('[signingActivityTracker] activity lookup threw', {
      tenantId,
      signingSessionId,
      message: err?.message || String(err),
    });
    return null;
  }
}

/**
 * Create the timeline activity row for a freshly-sent signing_session.
 *
 * @param {object} params
 * @param {object} params.supabase    service-role client
 * @param {string} params.tenantId
 * @param {object} params.session     signing_sessions row (id, related_to,
 *                                    related_id, recipient_email,
 *                                    recipient_name, message, expires_at,
 *                                    created_at)
 * @param {string} params.templateName
 * @param {string} [params.sentByUserId]  the auth user uuid who clicked Send
 *                                         (stored in metadata for audit)
 * @param {string} [params.sentByUserEmail] the auth user's email — looked up
 *                                          against employees.email to populate
 *                                          activities.assigned_to (FK to
 *                                          employees.id, NOT users.id)
 * @returns {Promise<{ ok: boolean, activityId?: string, reason?: string }>}
 */
export async function createSendActivity({
  supabase,
  tenantId,
  session,
  templateName,
  sentByUserId,
  sentByUserEmail,
}) {
  if (!supabase || !tenantId || !session?.id) {
    return { ok: false, reason: 'missing_args' };
  }
  try {
    const dueFields = await computeDocumentDueFields(supabase, tenantId);
    // resolveRelatedEntityFields takes POSITIONAL args
    // (supabase, tenantId, relatedTo, relatedId), not an object —
    // calling it with an object passed `tenantId === undefined` and
    // tripped the early-return, making related_name silently null on
    // every signing activity row. Confirmed by SQL audit on dev:
    // 12/12 backfilled + 1/1 live row all had related_name=null.
    const related = await resolveRelatedEntityFields(
      supabase,
      tenantId,
      session.related_to,
      session.related_id,
    );
    // activities.assigned_to FKs to employees(id), so we MUST resolve the
    // auth user's email → matching employees row for this tenant.
    // Inserting a users.id directly violates the FK and silently fails.
    const assignedToEmployeeId = await resolveAssignedEmployee(
      supabase,
      tenantId,
      sentByUserEmail || null,
    );
    const recipientLabel = session.recipient_name
      ? `${session.recipient_name} <${session.recipient_email}>`
      : session.recipient_email;
    const subject = `Document sent — ${templateName}`;
    const body =
      `${templateName} sent to ${recipientLabel}.` +
      (session.message ? `\n\nMessage from sender: ${session.message}` : '');

    const { data, error } = await supabase
      .from('activities')
      .insert({
        tenant_id: tenantId,
        type: 'document',
        subject,
        body,
        status: 'pending',
        priority: 'normal',
        related_to: session.related_to,
        related_id: session.related_id,
        related_name: related?.related_name || null,
        related_email: related?.related_email || null,
        due_date: dueFields.due_date,
        due_time: dueFields.due_time,
        assigned_to: assignedToEmployeeId,
        is_test_data: false,
        metadata: {
          signing_session_id: session.id,
          template_name: templateName,
          recipient_email: session.recipient_email,
          recipient_name: session.recipient_name || null,
          sent_at: new Date().toISOString(),
          viewed_at: null,
          signed_at: null,
          declined_at: null,
          expires_at: session.expires_at,
          // Stash the actual user identifier for audit even if no
          // matching employee row exists (assigned_to stays null).
          sent_by_user_id: sentByUserId || null,
          sent_by_user_email: sentByUserEmail || null,
          source: '4vd-43-signing',
        },
      })
      .select('id')
      .single();
    if (error) {
      logger.warn('[signingActivityTracker] insert failed', {
        tenantId,
        signingSessionId: session.id,
        message: error.message,
      });
      return { ok: false, reason: 'insert_failed' };
    }
    return { ok: true, activityId: data.id };
  } catch (err) {
    logger.warn('[signingActivityTracker] createSendActivity threw', {
      tenantId,
      signingSessionId: session.id,
      message: err?.message || String(err),
    });
    return { ok: false, reason: 'threw' };
  }
}

/**
 * Stamp metadata.viewed_at on the activity row. First-view writes a fresh
 * timestamp; subsequent views overwrite (last-view-wins, useful for
 * tracking active recipients). Activity status stays 'pending' so the
 * timeline still reads "Document sent — pending" until signed/declined.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.tenantId
 * @param {string} params.signingSessionId
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function updateActivityForView({ supabase, tenantId, signingSessionId }) {
  const existing = await findActivityForSession(supabase, tenantId, signingSessionId);
  if (!existing) return { ok: false, reason: 'no_activity_row' };
  try {
    const newMetadata = {
      ...(existing.metadata || {}),
      viewed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('activities')
      .update({ metadata: newMetadata })
      .eq('id', existing.id);
    if (error) {
      logger.warn('[signingActivityTracker] update-for-view failed', {
        tenantId,
        signingSessionId,
        message: error.message,
      });
      return { ok: false, reason: 'update_failed' };
    }
    return { ok: true };
  } catch (err) {
    logger.warn('[signingActivityTracker] updateActivityForView threw', {
      tenantId,
      signingSessionId,
      message: err?.message || String(err),
    });
    return { ok: false, reason: 'threw' };
  }
}

/**
 * Transition the activity to 'completed' when the recipient signs. The
 * subject/body are left unchanged so timeline-search hits keep working;
 * downstream consumers (timeline UI, AI summaries) read status +
 * metadata.signed_at to display "Signed at <time>".
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.tenantId
 * @param {string} params.signingSessionId
 * @param {string} [params.signerName]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function updateActivityForSign({ supabase, tenantId, signingSessionId, signerName }) {
  const existing = await findActivityForSession(supabase, tenantId, signingSessionId);
  if (!existing) return { ok: false, reason: 'no_activity_row' };
  try {
    const nowIso = new Date().toISOString();
    const newMetadata = {
      ...(existing.metadata || {}),
      signed_at: nowIso,
      signer_name: signerName || existing.metadata?.signer_name || null,
    };
    const { error } = await supabase
      .from('activities')
      .update({ status: 'completed', metadata: newMetadata })
      .eq('id', existing.id);
    if (error) {
      logger.warn('[signingActivityTracker] update-for-sign failed', {
        tenantId,
        signingSessionId,
        message: error.message,
      });
      return { ok: false, reason: 'update_failed' };
    }
    return { ok: true };
  } catch (err) {
    logger.warn('[signingActivityTracker] updateActivityForSign threw', {
      tenantId,
      signingSessionId,
      message: err?.message || String(err),
    });
    return { ok: false, reason: 'threw' };
  }
}

/**
 * Transition the activity to 'cancelled' when the recipient declines.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.tenantId
 * @param {string} params.signingSessionId
 * @param {string} [params.reason]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function updateActivityForDecline({ supabase, tenantId, signingSessionId, reason }) {
  const existing = await findActivityForSession(supabase, tenantId, signingSessionId);
  if (!existing) return { ok: false, reason: 'no_activity_row' };
  try {
    const nowIso = new Date().toISOString();
    const newMetadata = {
      ...(existing.metadata || {}),
      declined_at: nowIso,
      decline_reason: reason || null,
    };
    const { error } = await supabase
      .from('activities')
      .update({ status: 'cancelled', metadata: newMetadata })
      .eq('id', existing.id);
    if (error) {
      logger.warn('[signingActivityTracker] update-for-decline failed', {
        tenantId,
        signingSessionId,
        message: error.message,
      });
      return { ok: false, reason: 'update_failed' };
    }
    return { ok: true };
  } catch (err) {
    logger.warn('[signingActivityTracker] updateActivityForDecline threw', {
      tenantId,
      signingSessionId,
      message: err?.message || String(err),
    });
    return { ok: false, reason: 'threw' };
  }
}
