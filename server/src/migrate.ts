/** `npm run migrate -w server` : applique les migrations sans démarrer le serveur. */

import { loadConfig, readEnv } from './config.ts';
import { migrate, openDatabase, readMigrations, schemaVersion } from './db.ts';

const config = loadConfig(readEnv());
const db = openDatabase(config.databasePath);

try {
  const applied = migrate(db, readMigrations());

  for (const migration of applied) console.log(`migration ${migration.version}_${migration.name} appliquée`);
  console.log(`base ${config.databasePath} en version ${schemaVersion(db)}`);
} finally {
  db.close();
}
