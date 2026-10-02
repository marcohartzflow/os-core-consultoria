-- Lockout in the Keycloak brute-force model (failures counted across temporary locks, counter reset
-- after a quiet period) with the NIST SP 800-63B-4 cap on consecutive failures.
ALTER TABLE users ADD COLUMN last_failed_login_at TIMESTAMPTZ;
-- Reached the consecutive-failure cap: no password works until the person resets it by e-mail or an
-- administrator re-enables the account.
ALTER TABLE users ADD COLUMN locked_permanently BOOLEAN NOT NULL DEFAULT FALSE;

-- Recovery codes are hashed with the password encoder (salted Argon2id, OWASP ASVS 5.0 6.5.2): the
-- encoded value is longer than 64 characters and, being salted, cannot be looked up or kept unique.
-- Codes issued before this change were keyed hashes that no longer verify; the person issues new ones.
ALTER TABLE user_mfa_recovery_code DROP CONSTRAINT user_mfa_recovery_code_code_hash_key;
ALTER TABLE user_mfa_recovery_code ALTER COLUMN code_hash TYPE VARCHAR(255);
DELETE FROM user_mfa_recovery_code;

-- Spring Session stores the login name (the e-mail) here; e-mails may have up to 320 characters.
ALTER TABLE spring_session ALTER COLUMN principal_name TYPE VARCHAR(320);
