import { describe, expect, it } from 'vitest';
import { DAILY_LIMITS, isDailyResponse, isSessionResponse } from '../../shared/api.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, readMigrations } from './db.ts';

const NOW = Date.UTC(2026, 9, 17, 12);
const TODAY = '2026-10-17';

function setup() {
  const db = openDatabase(':memory:');

  migrate(db, readMigrations());

  const api = createApp({ config: loadConfig({}), db, clock: () => NOW, clientIp: () => '10.0.0.1' });
  const send = (method: string, path: string, token?: string, body?: unknown) =>
    api.request(path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const signUp = async (nickname: string): Promise<string> => {
    const response = await send('POST', '/auth/register', undefined, {
      nickname,
      email: `${nickname.toLowerCase()}@example.com`,
      password: 'une-phrase-secrète',
    });
    const body: unknown = await response.json();

    if (!isSessionResponse(body)) throw new Error('inscription attendue');

    return body.token;
  };

  return { send, signUp };
}

describe('classement de la carte du jour', () => {
  it('est vide au départ, sans compte', async () => {
    const { send } = setup();
    const response = await send('GET', `/daily/${TODAY}`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(isDailyResponse(body) && body.entries).toEqual([]);
  });

  it('garde le meilleur score de chaque compte et classe du plus haut au plus bas', async () => {
    const { send, signUp } = setup();
    const lina = await signUp('Lina');
    const marc = await signUp('Marc');

    await send('POST', `/daily/${TODAY}`, lina, { score: 30 });
    await send('POST', `/daily/${TODAY}`, lina, { score: 20 });
    await send('POST', `/daily/${TODAY}`, marc, { score: 25 });

    const body: unknown = await (await send('GET', `/daily/${TODAY}`)).json();

    expect(isDailyResponse(body) && body.entries).toEqual([
      { nickname: 'Lina', score: 30 },
      { nickname: 'Marc', score: 25 },
    ]);
  });

  it('refuse un score sans session, illisible, hors borne ou pour un jour lointain', async () => {
    const { send, signUp } = setup();
    const lina = await signUp('Lina');

    expect((await send('POST', `/daily/${TODAY}`, undefined, { score: 10 })).status).toBe(401);
    expect((await send('POST', `/daily/${TODAY}`, lina, { score: 0 })).status).toBe(400);
    expect((await send('POST', `/daily/${TODAY}`, lina, { score: DAILY_LIMITS.maxScore + 1 })).status).toBe(400);
    expect((await send('POST', `/daily/${TODAY}`, lina, { score: 1.5 })).status).toBe(400);
    expect((await send('POST', '/daily/2026-10-10', lina, { score: 10 })).status).toBe(400);
    expect((await send('POST', '/daily/2026-02-30', lina, { score: 10 })).status).toBe(400);
    expect((await send('GET', '/daily/n-importe-quoi')).status).toBe(400);
  });
});
