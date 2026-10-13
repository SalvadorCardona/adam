/**
 * Le serveur assemblé : base migrée, API et WebSocket sur un même port.
 * `main.ts` le démarre ; les tests le démarrent sur un port libre.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import type { ServerConfig } from './config.ts';
import { migrate, openDatabase, readMigrations, type Migration } from './db.ts';
import { tokenReader } from './accounts.ts';
import { partyDirectory } from './parties.ts';
import { PartyRooms } from './rooms.ts';
import { attachSocket } from './socket.ts';

export interface RunningServer {
  readonly port: number;
  readonly db: DatabaseSync;
  /** Les migrations appliquées à ce démarrage. */
  readonly migrated: readonly Migration[];
  close(): Promise<void>;
}

export async function startServer(config: ServerConfig): Promise<RunningServer> {
  const db = openDatabase(config.databasePath);
  let migrated: Migration[];

  try {
    migrated = migrate(db, readMigrations());
  } catch (error) {
    db.close();
    throw error;
  }

  // Les salles du jeu à deux : le WebSocket les remplit, la fermeture d'une session (`DELETE`) les vide.
  const rooms = new PartyRooms(partyDirectory(db), tokenReader(db, Date.now));
  const app = createApp({ config, db, onPartyClosed: (code) => rooms.end(code) });
  const server = await new Promise<Server>((resolve, reject) => {
    const http = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => resolve(http as Server));

    http.once('error', reject);
  });
  const hub = attachSocket(server, config, rooms);

  return {
    port: (server.address() as AddressInfo).port,
    db,
    migrated,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => {
          db.close();
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
