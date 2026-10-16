-- Les invités : un ami ouvre le lien d'une partie et la rejoint avec son seul
-- pseudo, sans adresse ni mot de passe. Son compte est temporaire, marqué
-- `guest` : une adresse tirée au hasard, jamais montrée, et aucun hachage —
-- personne ne peut s'y connecter, seule sa session (gardée sur son appareil)
-- le fait entrer.
ALTER TABLE accounts ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;
