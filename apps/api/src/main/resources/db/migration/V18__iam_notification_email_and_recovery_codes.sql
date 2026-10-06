-- NIST SP 800-63B-4: "CSPs SHALL support at least two notification addresses per subscriber account".
-- The login e-mail is the first; this optional second address also receives every security notice
-- (never a link). It must differ from the login e-mail, or it would not be a second address.
ALTER TABLE users ADD COLUMN notification_email VARCHAR(320);
ALTER TABLE users ADD CONSTRAINT users_notification_email_differs CHECK (notification_email IS NULL OR notification_email <> email);

-- Recovery codes now carry about 74 bits (15 characters of a 31-symbol alphabet); NIST SP 800-63B-4
-- asks saved recovery codes for at least 64. Codes issued before had about 49.5 bits and stop being
-- accepted: the person issues new ones in the security settings (the screen shows none left).
DELETE FROM user_mfa_recovery_code;
