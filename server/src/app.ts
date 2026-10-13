/**
 * L'API HTTP. Hono : un routeur typé, sans dépendance, qui parle `Request` /
 * `Response` comme le navigateur — les tests l'appellent par `app.request()`,
 * sans ouvrir de port.
 */

import type { DatabaseSync } from 'node:sqlite';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { API_PATHS, API_SERVICE, API_VERSION, type HealthResponse } from '../../shared/api.ts';
import { originAllowed, type ServerConfig } from './config.ts';
import { accountRoutes, sessionReader } from './accounts.ts';
import { partyRoutes } from './parties.ts';
import { schemaVersion } from './db.ts';

export interface AppDeps {
  readonly config: ServerConfig;
  readonly db: DatabaseSync;
  /** L'horloge, en millisecondes : `performance.now` en vrai, une valeur figée en test. */
  readonly now?: () => number;
  /** L'horloge murale, en millisecondes depuis 1970 (sessions, limites de tentatives). */
  readonly clock?: () => number;
  /** L'IP du client, pour les limites de tentatives. */
  readonly clientIp?: (c: Context) => string;
}

/** L'IP vue par Node ; derrière un proxy (Dokploy), la première de `X-Forwarded-For`. */
function peerIp(c: Context): string {
  const forwarded = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim();

  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function createApp({ config, db, now = () => performance.now(), clock = Date.now, clientIp = peerIp }: AppDeps): Hono {
  const startedAt = now();
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => (originAllowed(config, origin) ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
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

  app.route('/', accountRoutes({ db, clock, clientIp }));
  app.route('/', partyRoutes({ db, clock, clientIp, userOf: sessionReader(db, clock), ttlMs: config.inviteTtlMs }));

  app.notFound((c) => c.json({ ok: false, error: 'notFound' }, 404));
  app.onError((error, c) => {
    console.error(error);

    return c.json({ ok: false, error: 'internal' }, 500);
  });

  return app;
}
