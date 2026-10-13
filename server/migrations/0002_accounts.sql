-- Les comptes, facultatifs : un pseudo affiché en jeu, une adresse (unique,
-- en minuscules) et le hachage du mot de passe — jamais le mot de passe.
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY,
  nickname      TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
) STRICT;

-- Les sessions : le client garde un jeton opaque, le serveur seulement son
-- empreinte (SHA-256) — une base volée ne donne aucune session. Un compte
-- supprimé emporte ses sessions.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX sessions_account ON sessions (account_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);
