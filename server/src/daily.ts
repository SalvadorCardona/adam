/**
 * Le classement de la carte du jour : `GET /daily/:date` donne les meilleurs
 * scores de la date UTC, `POST /daily/:date` y dépose celui d'un joueur connecté
 * (invité compris). Le serveur ne garde que le meilleur de chaque compte.
 *
 * Ce n'est qu'un ajout : la carte, son modificateur et le score se calculent
 * dans le jeu, sans serveur. Le score est celui que le client annonce — le
 * jeu se rejoue, mais le serveur ne le rejoue pas — ; il est borné.
 */

import type { DatabaseSync } from 'node:sqlite';
import { Hono, type Context } from 'hono';
import {
  DAILY_LIMITS,
  isDailyDate,
  type AccountUser,
  type DailyErrorResponse,
  type DailyResponse,
} from '../../shared/api.ts';

export interface DailyDeps {
  readonly db: DatabaseSync;
  readonly clock: () => number;
  /** Qui parle ? (`sessionReader` de `accounts.ts`) */
  readonly userOf: (c: Context) => AccountUser | null;
}

const DAY_MS = 24 * 3600 * 1000;

function fail(c: Context, status: 400 | 401, error: DailyErrorResponse['error']): Response {
  const body: DailyErrorResponse = { ok: false, error };

  c.header('Cache-Control', 'no-store');

  return c.json(body, status);
}

export function dailyRoutes({ db, clock, userOf }: DailyDeps): Hono {
  const routes = new Hono();

  const top = db.prepare(
    'SELECT a.nickname, s.score FROM daily_scores s JOIN accounts a ON a.id = s.account_id WHERE s.date = ? ORDER BY s.score DESC, s.updated_at, a.id LIMIT ?',
  );
  const keep = db.prepare(
    `INSERT INTO daily_scores (date, account_id, score, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (date, account_id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at WHERE excluded.score > score`,
  );

  const board = (c: Context, date: string): Response => {
    const entries = (top.all(date, DAILY_LIMITS.top) as unknown as { nickname: string; score: number }[]).map(({ nickname, score }) => ({ nickname, score }));
    const body: DailyResponse = { ok: true, date, entries };

    c.header('Cache-Control', 'no-store');

    return c.json(body);
  };

  routes.get('/daily/:date', (c) => {
    const date = c.req.param('date');

    return isDailyDate(date) ? board(c, date) : fail(c, 400, 'badDate');
  });

  routes.post('/daily/:date', async (c) => {
    const user = userOf(c);

    if (!user) return fail(c, 401, 'unauthorized');

    const date = c.req.param('date');

    if (!isDailyDate(date)) return fail(c, 400, 'badDate');

    // Pas de score pour un jour lointain : la veille, aujourd'hui et demain suffisent à tous les fuseaux.
    const now = clock();
    const apart = Math.abs(Date.parse(`${date}T00:00:00Z`) - Math.floor(now / DAY_MS) * DAY_MS) / DAY_MS;

    if (apart > DAILY_LIMITS.daysAround) return fail(c, 400, 'outOfRange');

    const body: unknown = await c.req.json().catch(() => null);
    const score = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['score'] : undefined;

    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > DAILY_LIMITS.maxScore) return fail(c, 400, 'badScore');

    keep.run(date, user.id, score, now);

    return board(c, date);
  });

  return routes;
}
