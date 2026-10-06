-- Módulo de exemplo "tasks": tarefas internas da empresa.
-- assignee_id aponta para users.id sem FK de banco: o módulo iam é dono da tabela users e o
-- vínculo é validado pela API pública do iam (UserDirectory), não pelo schema.

CREATE TABLE tasks (
    id           UUID PRIMARY KEY,
    title        VARCHAR(200)  NOT NULL,
    description  VARCHAR(2000),
    status       VARCHAR(20)   NOT NULL,
    assignee_id  UUID,
    due_date     DATE,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ   NOT NULL,
    created_by   UUID,
    updated_at   TIMESTAMPTZ   NOT NULL,
    updated_by   UUID
);
CREATE INDEX tasks_status_due_date_idx ON tasks (status, due_date);
CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id);
