SELECT id, email, role, employee_role, perm_notes_anywhere, perm_all_records, tenant_id, tenant_uuid
FROM users
WHERE lower(email) = lower('theresea@labordepotllc.com');

SELECT tm.team_id, tm.role, tm.access_level, tm.user_id, tm.employee_id
FROM team_members tm
JOIN users u ON (tm.user_id = u.id OR tm.employee_id = u.id)
WHERE lower(u.email) = lower('theresea@labordepotllc.com')
ORDER BY tm.team_id;