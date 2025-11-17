-- 041_calendar_view_metadata_fallback.sql
-- Purpose: Make calendar view robust by falling back to metadata for due_date, due_time, assigned_to, and related_to

CREATE OR REPLACE VIEW v_calendar_activities AS
SELECT
  a.id,
  a.tenant_id,
  a.type,
  a.subject,
  a.status,
  COALESCE(a.assigned_to, a.metadata->>'assigned_to') AS assigned_to,
  COALESCE(a.related_to, a.metadata->>'related_to') AS related_to,
  a.related_id,
  -- compute due_date and due_time from columns or metadata (YYYY-MM-DD and HH:MM)
  COALESCE(a.due_date, to_date(a.metadata->>'due_date','YYYY-MM-DD')) AS due_date,
  (
    CASE
      WHEN COALESCE(a.due_time::text, a.metadata->>'due_time') ~ '^[0-9]{1,2}:[0-9]{2}'
        THEN (COALESCE(a.due_time::text, a.metadata->>'due_time'))::time
      ELSE NULL
    END
  ) AS due_time,
  (
    CASE
      WHEN COALESCE(a.due_date, to_date(a.metadata->>'due_date','YYYY-MM-DD')) IS NOT NULL
           AND COALESCE(a.due_time::text, a.metadata->>'due_time') ~ '^[0-9]{1,2}:[0-9]{2}'
        THEN (COALESCE(a.due_date, to_date(a.metadata->>'due_date','YYYY-MM-DD'))::timestamp
              + (COALESCE(a.due_time::text, a.metadata->>'due_time'))::time)
      WHEN COALESCE(a.due_date, to_date(a.metadata->>'due_date','YYYY-MM-DD')) IS NOT NULL
        THEN (COALESCE(a.due_date, to_date(a.metadata->>'due_date','YYYY-MM-DD'))::timestamp + time '12:00')
      ELSE NULL
    END
  ) AS due_at,
  a.created_at,
  a.updated_date AS updated_at
FROM activities a;
