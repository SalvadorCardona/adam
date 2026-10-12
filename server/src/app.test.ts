import { describe, expect, it } from 'vitest';
import { API_SERVICE, API_VERSION, isHealthResponse } from '../../shared/api.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, readMigrations } from './db.ts';

function app(now = () => 0) {
  const db = openDatabase(':memory:');

  migrate(db, readMigrations());

  return { db, app: createApp({ config: loadConfig({ CORS_ORIGINS: 'https://cardona.digital' }), db, now }) };
}

describe('GET /health', () => {
  it('répond ce que le client attend', async () => {
    let clock = 0;
    const { app: api } = app(() => clock);

    clock = 12_500;
    const response = await api.request('/health');
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(isHealthResponse(body)).toBe(true);
    expect(body).toEqual({ ok: true, service: API_SERVICE, api: API_VERSION, schema: readMigrations().length, uptime: 12 });
  });

  it('autorise l’origine du jeu, pas une autre', async () => {
    const { app: api } = app();
    const allowed = await api.request('/health', { headers: { Origin: 'https://cardona.digital' } });
    const refused = await api.request('/health', { headers: { Origin: 'https://evil.example' } });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://cardona.digital');
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('répond 503 quand la base ne répond plus', async () => {
    const { app: api, db } = app();

    db.close();
    expect((await api.request('/health')).status).toBe(503);
  });
});

describe('une route inconnue', () => {
  it('répond 404 en JSON', async () => {
    const response = await app().app.request('/nowhere');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'notFound' });
  });
});
