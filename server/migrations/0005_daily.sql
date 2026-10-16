-- Le classement de la carte du jour : le meilleur score de chaque compte, par
-- date UTC (`AAAA-MM-JJ`). Une ligne par (date, compte), jamais deux.
CREATE TABLE daily_scores (
  date       TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date, account_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX daily_scores_rank ON daily_scores (date, score DESC);
