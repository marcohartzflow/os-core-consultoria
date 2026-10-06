-- Values the scenarios filter by, picked from the seeded data: one person with events, one role,
-- one task entity, one correlation id. Prints a JSON object for run.mjs --params.
SELECT json_build_object(
  'actorId', u.id, 'actorEmailPart', split_part(u.email, '@', 1) || '@', 'userSearch', 'silva',
  'roleId', (SELECT id FROM roles WHERE NOT is_system ORDER BY name LIMIT 1),
  'entityId', (SELECT entity_id FROM audit_event WHERE entity_type = 'user' AND entity_id = u.id::text LIMIT 1),
  'correlationId', (SELECT correlation_id FROM audit_event WHERE correlation_id IS NOT NULL ORDER BY occurred_at DESC OFFSET 5000 LIMIT 1),
  'assigneeId', u.id,
  'weekAgo', to_char((now() - interval '7 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'today', to_char(current_date, 'YYYY-MM-DD'),
  -- "Go to date" 100 000 events back: the page of events before this instant.
  'deepTo', (SELECT to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             FROM audit_event ORDER BY occurred_at DESC OFFSET 100000 LIMIT 1))
FROM users u WHERE u.email LIKE 'mariana.teixeira%' ORDER BY u.email LIMIT 1;
