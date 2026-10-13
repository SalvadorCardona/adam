-- Les parties hébergées : un joueur connecté invite un ami par un code court.
-- Le code est tiré au hasard (jamais déduit de l'id), unique, et la session
-- expire (`expires_at`, millisecondes) ou se ferme (`closed_at`). Pas
-- d'identifiant exposé : le client ne connaît que le code.
CREATE TABLE parties (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  host_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  closed_at  INTEGER
) STRICT;

CREATE INDEX parties_host ON parties (host_id);

-- La salle d'attente : qui a rejoint la partie, et quand.
CREATE TABLE party_guests (
  party_id   INTEGER NOT NULL REFERENCES parties (id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (party_id, account_id)
) STRICT, WITHOUT ROWID;
