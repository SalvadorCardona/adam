-- La première migration : une table clé / valeur pour l'instance elle-même.
-- Les comptes, les parties hébergées et les invitations viendront chacun
-- dans leur migration, numérotée à la suite.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

INSERT INTO meta (key, value) VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
