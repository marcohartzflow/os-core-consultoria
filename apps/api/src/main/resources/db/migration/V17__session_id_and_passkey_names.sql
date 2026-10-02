-- Session ids are now 43 characters (256 random bits, Base64url) instead of a 36-character UUID.
ALTER TABLE spring_session ALTER COLUMN session_id TYPE VARCHAR(100);

-- One WebAuthn identity per login name: registration looks it up by name before creating it.
ALTER TABLE user_entities ADD CONSTRAINT user_entities_name_key UNIQUE (name);
