/**
 * La base SQLite et ses migrations.
 *
 * `node:sqlite` est le SQLite embarqué dans Node (24 et plus) : aucun module
 * natif à compiler, ni en local ni dans l'image Docker. Des requêtes SQL
 * écrites à la main, préparées, sans ORM : le schéma restera petit, et le SQL
 * se lit tel qu'il s'exécute.
 *
 * Une migration est un fichier `NNNN_nom.sql` de `server/migrations/`,
 * numéroté à la suite, jamais modifié une fois publié — on en ajoute un
 * autre. Chacune s'applique dans sa transaction et s'inscrit dans
 * `schema_migrations` : une migration qui échoue ne laisse rien derrière elle,
 * et le serveur ne démarre pas.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/** Le dossier des migrations livrées avec le serveur. */
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Les migrations d'un dossier, dans l'ordre ; un nom mal formé ou un numéro qui saute est une erreur. */
export function readMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const match = MIGRATION_FILE.exec(file);

      if (!match) throw new Error(`Migration mal nommée : ${file} (attendu : 0001_nom.sql)`);

      return { version: Number(match[1]), name: match[2]!, sql: readFileSync(join(dir, file), 'utf8') };
    });

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migrations non contiguës : ${migration.version} à la place ${index + 1}`);
    }
  });

  return migrations;
}

/** Le nom de la base avant le renommage du jeu (`adam.sqlite` ← `mobile-factory.sqlite`). */
const LEGACY_NAME: Readonly<Record<string, string>> = { 'adam.sqlite': 'mobile-factory.sqlite' };

/**
 * Le jeu a changé de nom, sa base aussi : si le fichier attendu manque et que
 * l'ancien est là, à côté, on le renomme avec son journal WAL et sa mémoire
 * partagée. Rend `true` s'il y a eu renommage.
 */
export function adoptLegacyDatabase(path: string): boolean {
  const legacyName = LEGACY_NAME[basename(path)];

  if (legacyName === undefined || existsSync(path)) return false;

  const legacy = join(dirname(path), legacyName);

  if (!existsSync(legacy)) return false;
  for (const suffix of ['-wal', '-shm']) if (existsSync(legacy + suffix)) renameSync(legacy + suffix, path + suffix);
  renameSync(legacy, path);

  return true;
}

/** Ouvre la base (et crée son dossier) avec les réglages du serveur. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
    adoptLegacyDatabase(path);
  }

  const db = new DatabaseSync(path);

  // WAL : les lectures ne bloquent pas l'écriture. Clés étrangères vérifiées, et un verrou attend au lieu d'échouer.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  return db;
}

/** La dernière migration appliquée (0 sur une base neuve). */
export function schemaVersion(db: DatabaseSync): number {
  ensureLedger(db);

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined;

  return row?.version ?? 0;
}

/**
 * Applique, dans l'ordre, les migrations que la base n'a pas encore. Rend
 * celles qu'elle vient d'appliquer. Refuse une base plus récente que le code,
 * ou dont une migration appliquée a changé de nom.
 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[]): Migration[] {
  ensureLedger(db);

  const applied = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as {
    version: number;
    name: string;
  }[];

  for (const { version, name } of applied) {
    const known = migrations[version - 1];

    if (!known) throw new Error(`La base est en version ${version}, plus récente que ce serveur`);
    if (known.name !== name) throw new Error(`La migration ${version} s'appelait ${name}, elle s'appelle ${known.name}`);
  }

  const pending = migrations.slice(applied.length);
  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');

  for (const migration of pending) {
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version}_${migration.name} : ${String(error)}`, { cause: error });
    }
  }

  return pending;
}

function ensureLedger(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT',
  );
}
