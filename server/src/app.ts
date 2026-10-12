/**
 * L'API HTTP. Hono : un routeur typé, sans dépendance, qui parle `Request` /
 * `Response` comme le navigateur — les tests l'appellent par `app.request()`,
 * sans ouvrir de port.
 */

import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_PATHS, API_SERVICE, API_VERSION, type HealthResponse } from '../../shared/api.ts';
import { originAllowed, type ServerConfig } from './config.ts';
import { schemaVersion } from './db.ts';

export interface AppDeps {
  readonly config: ServerConfig;
  readonly db: DatabaseSync;
  /** L'horloge, en millisecondes : `performance.now` en vrai, une valeur figée en test. */
  readonly now?: () => number;
}

export function createApp({ config, db, now = () => performance.now() }: AppDeps): Hono {
  const startedAt = now();
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => (originAllowed(config, origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  // La sonde du jeu et celle du conteneur : la base doit répondre, sinon 503.
  app.get(API_PATHS.health, (c) => {
    let schema: number;

    try {
      schema = schemaVersion(db);
    } catch {
      return c.json({ ok: false, service: API_SERVICE }, 503);
    }

    const body: HealthResponse = {
      ok: true,
      service: API_SERVICE,
      api: API_VERSION,
      schema,
      uptime: Math.floor((now() - startedAt) / 1000),
    };

    c.header('Cache-Control', 'no-store');

    return c.json(body);
  });

  app.notFound((c) => c.json({ ok: false, error: 'notFound' }, 404));
  app.onError((error, c) => {
    console.error(error);

    return c.json({ ok: false, error: 'internal' }, 500);
  });

  return app;
}
