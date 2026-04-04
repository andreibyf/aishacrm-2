/**
 * Cal.com booking-link validation helpers.
 *
 * Booking URLs are expected to be either:
 *   - username
 *   - username/event-slug
 *
 * The first segment resolves the Cal.com user; the optional second segment
 * resolves the event type slug for that user.
 */

export function parseCalcomLink(rawLink) {
  if (typeof rawLink !== 'string') return null;

  const trimmed = rawLink.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;

  const username = parts[0];
  const slug = parts[1] || null;

  if (!username) return null;

  return {
    calLink: slug ? `${username}/${slug}` : username,
    username,
    slug,
  };
}

export function parseCalcomBookingUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const link = parsed.pathname.replace(/^\/+/, '').trim();
  const parsedLink = parseCalcomLink(link);
  if (!parsedLink) return null;

  return {
    ...parsedLink,
    origin: parsed.origin,
    url: parsed.toString(),
  };
}

export async function validateCalcomLink(db, rawLink) {
  const parsed = parseCalcomLink(rawLink);
  if (!parsed || !db) {
    return { valid: false, reason: 'invalid_link' };
  }

  const userResult = await db.query('SELECT id, username FROM users WHERE username = $1 LIMIT 1', [
    parsed.username,
  ]);

  if (!userResult.rows.length) {
    return { valid: false, reason: 'user_not_found' };
  }

  if (!parsed.slug) {
    return {
      valid: true,
      calLink: parsed.calLink,
      username: parsed.username,
      slug: null,
    };
  }

  const userId = userResult.rows[0].id;
  const eventTypeResult = await db.query(
    `SELECT id, slug
       FROM "EventType"
      WHERE "userId" = $1
        AND slug = $2
      LIMIT 1`,
    [userId, parsed.slug],
  );

  if (!eventTypeResult.rows.length) {
    return { valid: false, reason: 'event_type_not_found' };
  }

  return {
    valid: true,
    calLink: parsed.calLink,
    username: parsed.username,
    slug: parsed.slug,
    userId,
    eventTypeId: eventTypeResult.rows[0].id,
  };
}

export async function validateCalcomBookingUrl(db, rawUrl) {
  const parsed = parseCalcomBookingUrl(rawUrl);
  if (!parsed) {
    return { valid: false, reason: 'invalid_url' };
  }

  const validation = await validateCalcomLink(db, parsed.calLink);
  if (!validation.valid) {
    return validation;
  }

  return {
    ...validation,
    origin: parsed.origin,
    url: parsed.url,
  };
}
