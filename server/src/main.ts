/**
 * Le point d'entrée : `npm run dev:server` en local, `node server/src/main.ts`
 * dans le conteneur. Node exécute le TypeScript tel quel (types effacés) :
 * aucune étape de build.
 */

import { loadConfig, readEnv } from './config.ts';
import { startServer } from './server.ts';

const config = loadConfig(readEnv());
const server = await startServer(config);

for (const migration of server.migrated) console.log(`migration ${migration.version}_${migration.name} appliquée`);
console.log(`adam server sur http://${config.host}:${server.port} — base ${config.databasePath}`);

// Docker arrête le conteneur par SIGTERM : on ferme proprement la base avant de sortir.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
