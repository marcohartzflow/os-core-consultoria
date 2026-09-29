-- Reserved permissions (who accesses what) belong to the system administrator role only:
-- iam.role.create/update/delete, iam.user.roles.assign, iam.user.mfa.reset, iam.user.anonymize.
-- Custom roles that held any of them lose them here; each change is recorded in the audit trail.
-- The system role receives iam.user.roles.assign from the bootstrap on the next start (it always
-- holds the whole catalog). iam.user.update keeps its key but now only renames users; assigning
-- roles moved to the reserved iam.user.roles.assign.

INSERT INTO audit_event (id, occurred_at, origin, action, entity_type, entity_id, details)
SELECT gen_random_uuid(), now(), 'SYSTEM', 'iam.role.reserved_permissions_removed', 'role', r.id::text,
       jsonb_build_object('name', r.name, 'removed', jsonb_agg(rp.permission ORDER BY rp.permission))
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
WHERE NOT r.is_system
  AND rp.permission IN ('iam.role.create', 'iam.role.update', 'iam.role.delete',
                        'iam.user.roles.assign', 'iam.user.mfa.reset', 'iam.user.anonymize')
GROUP BY r.id, r.name;

DELETE FROM role_permissions rp
USING roles r
WHERE rp.role_id = r.id
  AND NOT r.is_system
  AND rp.permission IN ('iam.role.create', 'iam.role.update', 'iam.role.delete',
                        'iam.user.roles.assign', 'iam.user.mfa.reset', 'iam.user.anonymize');
