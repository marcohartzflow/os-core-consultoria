-- Spring Modulith 2.1.1, event publication registry (JDBC), schema v2 + tabela de arquivo.
-- Copiado de org/springframework/modulith/events/jdbc/schemas/v2/schema-postgresql.sql
-- e schema-postgresql-archive.sql (jar spring-modulith-events-jdbc).
-- spring.modulith.events.jdbc.schema-initialization.enabled=false: o schema é responsabilidade do Flyway.
-- completion-mode=ARCHIVE: publicação concluída é movida para event_publication_archive.

CREATE TABLE event_publication
(
  id                     UUID NOT NULL,
  listener_id            TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  serialized_event       TEXT NOT NULL,
  publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date        TIMESTAMP WITH TIME ZONE,
  status                 TEXT,
  completion_attempts    INT,
  last_resubmission_date TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
CREATE INDEX event_publication_serialized_event_hash_idx ON event_publication USING hash(serialized_event);
CREATE INDEX event_publication_by_completion_date_idx ON event_publication (completion_date);

CREATE TABLE event_publication_archive
(
  id                     UUID NOT NULL,
  listener_id            TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  serialized_event       TEXT NOT NULL,
  publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date        TIMESTAMP WITH TIME ZONE,
  status                 TEXT,
  completion_attempts    INT,
  last_resubmission_date TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
CREATE INDEX event_publication_archive_serialized_event_hash_idx ON event_publication_archive USING hash(serialized_event);
CREATE INDEX event_publication_archive_by_completion_date_idx ON event_publication_archive (completion_date);
