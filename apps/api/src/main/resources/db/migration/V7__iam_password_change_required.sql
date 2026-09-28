-- Contas cuja senha foi definida por terceiros (bootstrap) precisam trocá-la no primeiro acesso.
ALTER TABLE users ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT FALSE;
