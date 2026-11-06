-- Mot de passe oublié : un lien à usage unique, envoyé par e-mail. Comme pour
-- les sessions, le serveur ne garde que l'empreinte (SHA-256) du jeton — une
-- base volée ne donne aucun lien. Le jeton expire (`expires_at`, en
-- millisecondes) et disparaît une fois servi ; un compte supprimé emporte les
-- siens.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX password_resets_account ON password_resets (account_id);
CREATE INDEX password_resets_expiry ON password_resets (expires_at);
