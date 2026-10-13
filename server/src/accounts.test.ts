import { describe, expect, it } from 'vitest';
import { isAccountError, isMeResponse, isSessionResponse } from '../../shared/api.ts';
import { LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS, SESSION_MS } from './accounts.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, readMigrations } from './db.ts';

const ADAM = { nickname: 'Adam', email: 'adam@example.com', password: 'une-phrase-secrète' };

function setup() {
  const db = openDatabase(':memory:');
  const time = { now: 1_700_000_000_000 };

  migrate(db, readMigrations());

  const api = createApp({ config: loadConfig({}), db, clock: () => time.now, clientIp: () => '10.0.0.1' });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    api.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const me = (token: string) => api.request('/auth/me', { headers: { Authorization: `Bearer ${token}` } });

  return { api, db, time, post, me };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

describe('POST /auth/register', () => {
  it('crée le compte et ouvre une session', async () => {
    const { post, me, db } = setup();
    const response = await post('/auth/register', ADAM);
    const body = await json(response);

    expect(response.status).toBe(201);
    expect(isSessionResponse(body)).toBe(true);
    if (!isSessionResponse(body)) return;
    expect(body.user.nickname).toBe('Adam');
    expect(JSON.stringify(body)).not.toContain(ADAM.password);
    expect((await me(body.token)).status).toBe(200);

    const row = db.prepare('SELECT password_hash FROM accounts').get() as { password_hash: string };

    expect(row.password_hash).toMatch(/^argon2id\$/u);
    expect(row.password_hash).not.toContain(ADAM.password);
  });

  it('ne garde que l’empreinte du jeton', async () => {
    const { post, db } = setup();
    const body = await json(await post('/auth/register', ADAM));

    if (!isSessionResponse(body)) throw new Error('inscription attendue');

    const rows = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(body.token);
  });

  it('refuse une adresse déjà prise, quelle que soit sa casse', async () => {
    const { post } = setup();

    await post('/auth/register', ADAM);

    const response = await post('/auth/register', { ...ADAM, nickname: 'Autre', email: '  ADAM@Example.com ' });

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, error: 'emailTaken' });
  });

  it('valide les champs et dit lesquels', async () => {
    const { post } = setup();
    const response = await post('/auth/register', { nickname: 'A', email: 'pas-une-adresse', password: 'court' });
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(isAccountError(body)).toBe(true);
    expect(body).toMatchObject({
      error: 'invalid',
      fields: [
        { field: 'nickname', problem: 'tooShort' },
        { field: 'email', problem: 'badFormat' },
        { field: 'password', problem: 'tooShort' },
      ],
    });
  });

  it('refuse un corps qui n’est pas du JSON', async () => {
    const { api } = setup();
    const response = await api.request('/auth/register', { method: 'POST', body: 'x' });

    expect(response.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('reconnecte avec le bon mot de passe, adresse en autre casse', async () => {
    const { post, me } = setup();

    await post('/auth/register', ADAM);

    const response = await post('/auth/login', { email: 'Adam@Example.com', password: ADAM.password });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(isSessionResponse(body)).toBe(true);
    if (isSessionResponse(body)) expect((await me(body.token)).status).toBe(200);
  });

  it('refuse un mauvais mot de passe comme une adresse inconnue, sans les distinguer', async () => {
    const { post } = setup();

    await post('/auth/register', ADAM);

    const wrong = await post('/auth/login', { email: ADAM.email, password: 'mauvais-mot-de-passe' });
    const unknown = await post('/auth/login', { email: 'personne@example.com', password: 'mauvais-mot-de-passe' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await json(wrong)).toEqual(await json(unknown));
  });

  it('limite les tentatives, puis laisse passer la fenêtre écoulée', async () => {
    const { post, time } = setup();

    await post('/auth/register', ADAM);
    for (let i = 0; i < LOGIN_MAX_PER_EMAIL; i += 1) {
      expect((await post('/auth/login', { email: ADAM.email, password: 'mauvais-mot-de-passe' })).status).toBe(401);
    }

    // Même le bon mot de passe attend : sinon la limite ne protégerait de rien.
    const blocked = await post('/auth/login', { email: ADAM.email, password: ADAM.password });
    const body = await json(blocked);

    expect(blocked.status).toBe(429);
    expect(body).toMatchObject({ error: 'tooManyAttempts' });
    expect((body as { retryAfter: number }).retryAfter).toBeGreaterThan(0);

    time.now += LOGIN_WINDOW_MS + 1000;
    expect((await post('/auth/login', { email: ADAM.email, password: ADAM.password })).status).toBe(200);
  });

  it('exige les deux champs', async () => {
    const { post } = setup();

    expect((await post('/auth/login', { email: '', password: '' })).status).toBe(400);
  });
});

describe('sessions', () => {
  it('se terminent à la déconnexion, et la déconnexion se répète sans erreur', async () => {
    const { post, me } = setup();
    const body = await json(await post('/auth/register', ADAM));

    if (!isSessionResponse(body)) throw new Error('inscription attendue');

    const auth = { Authorization: `Bearer ${body.token}` };

    expect((await post('/auth/logout', {}, auth)).status).toBe(200);
    expect((await me(body.token)).status).toBe(401);
    expect((await post('/auth/logout', {}, auth)).status).toBe(200);
  });

  it('expirent', async () => {
    const { post, me, time } = setup();
    const body = await json(await post('/auth/register', ADAM));

    if (!isSessionResponse(body)) throw new Error('inscription attendue');

    time.now += SESSION_MS + 1000;
    expect((await me(body.token)).status).toBe(401);
  });

  it('refusent un jeton inconnu ou absent', async () => {
    const { api, me } = setup();

    expect((await me('inconnu')).status).toBe(401);
    expect((await api.request('/auth/me')).status).toBe(401);

    const body = await json(await api.request('/auth/me'));

    expect(isMeResponse(body)).toBe(false);
    expect(isAccountError(body)).toBe(true);
  });
});
