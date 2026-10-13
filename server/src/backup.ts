/**
 * `npm run backup -w server` : copie la base à chaud dans `backups/` (à côté
 * du fichier SQLite, donc dans le volume `/data` en production) et ne garde
 * que les `BACKUP_KEEP` plus récentes. `DatabaseSync.backup` passe par l'API
 * de sauvegarde de SQLite : la copie est cohérente même pendant que le
 * serveur écrit — une copie du fichier en WAL ne le serait pas.
 *
 * En production, Dokploy le lance chaque nuit dans le conteneur
 * (`node server/src/backup.ts`, voir docs/deploiement.md).
 */

import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { loadConfig, readEnv } from './config.ts';

/** Combien de copies on garde : deux semaines de sauvegardes quotidiennes. */
export const BACKUP_KEEP = 14;

const STAMP = /^(.*)-(\d{8}T\d{6}Z)\.sqlite$/;

/** Le nom d'une copie : celui de la base et l'instant, triables par ordre alphabétique. */
export function backupName(databasePath: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  return `${basename(databasePath, '.sqlite')}-${stamp}.sqlite`;
}

/** Les copies d'un dossier, de la plus ancienne à la plus récente. */
export function listBackups(dir: string, databasePath: string): string[] {
  const base = basename(databasePath, '.sqlite');

  return readdirSync(dir)
    .filter((file) => STAMP.exec(file)?.[1] === base)
    .sort();
}

/** Sauvegarde la base, élague les plus anciennes ; renvoie le chemin de la nouvelle copie. */
export async function backupDatabase(databasePath: string, keep = BACKUP_KEEP, now = new Date()): Promise<string> {
  if (databasePath === ':memory:') throw new Error('Une base en mémoire ne se sauvegarde pas');

  const dir = join(dirname(databasePath), 'backups');
  const target = join(dir, backupName(databasePath, now));

  mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(databasePath);

  try {
    await backup(db, target);
  } finally {
    db.close();
  }

  for (const old of listBackups(dir, databasePath).slice(0, -keep)) rmSync(join(dir, old));

  return target;
}

// Lancé directement (`node src/backup.ts`) et non importé par un test.
if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const config = loadConfig(readEnv());
  const target = await backupDatabase(config.databasePath);

  console.log(`sauvegarde ${target}`);
}
