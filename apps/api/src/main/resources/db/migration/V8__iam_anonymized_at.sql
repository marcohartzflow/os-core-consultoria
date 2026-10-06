-- LGPD art. 18: uma conta desativada pode ter seus dados pessoais anonimizados de forma irreversível.
ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMPTZ;
