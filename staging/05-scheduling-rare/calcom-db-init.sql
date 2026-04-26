-- Cal.com database backfill script
-- Run this if the calcom_db_data volume is ever wiped and recreated.
-- All statements are idempotent (ON CONFLICT DO NOTHING).
--
-- Root cause: Cal.com's Docker setup does not auto-populate Host or
-- _user_eventtype when event types are created via seeding/migrations,
-- leaving booking URLs broken even though EventType rows exist.
--
-- Usage (one-off on production):
--   docker exec -i aishacrm-calcom-db psql -U calcom -d calcom < scripts/calcom-db-init.sql

-- 1. Backfill Host table — links each event type to the owner user
--    IDs 2-7 were duplicates (seeder ran multiple times) and have been deleted.
--    Only ID 1 (4v-data 30min) and ID 8 (labor-depot 30min) are canonical.
INSERT INTO "Host" ("userId", "eventTypeId", "isFixed")
SELECT 2, id, true
FROM "EventType"
WHERE id IN (1, 8, 9, 10, 11)
ON CONFLICT DO NOTHING;

-- 2. Backfill _user_eventtype join table — many-to-many users <-> event types
INSERT INTO "_user_eventtype" ("A", "B")
SELECT id, 2
FROM "EventType"
WHERE id IN (1, 8, 9, 10, 11)
ON CONFLICT DO NOTHING;

-- 3. Promote default user to ADMIN (required for admin settings access)
UPDATE users SET role = 'ADMIN' WHERE id = 2 AND role != 'ADMIN';

-- 4. Create Labor Depot tenant user (separate from 4V Data user ID 2)
INSERT INTO users (name, email, username, "identityProvider", "completedOnboarding", locale, "timeZone", "weekStart", role, uuid)
VALUES ('Labor Depot', 'labor-depot-6cb4c0@aishacrm.local', 'labor-depot-6cb4c0', 'CAL', true, 'en', 'America/Chicago', 'Sunday', 'ADMIN', gen_random_uuid())
ON CONFLICT (username) DO NOTHING;

-- 5. Reassign Labor Depot event type (ID 8) to the Labor Depot user
UPDATE "Host" SET "userId" = (SELECT id FROM users WHERE username = 'labor-depot-6cb4c0') WHERE "eventTypeId" = 8;
UPDATE "_user_eventtype" SET "B" = (SELECT id FROM users WHERE username = 'labor-depot-6cb4c0') WHERE "A" = 8;
UPDATE "EventType" SET "userId" = (SELECT id FROM users WHERE username = 'labor-depot-6cb4c0') WHERE id = 8;
