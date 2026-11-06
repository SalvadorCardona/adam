import { describe, expect, it } from 'vitest';
import { isAccountError, isSessionResponse } from '../../shared/api.ts';
import { FORGOT_MAX_PER_EMAIL, FORGOT_MAX_PER_IP, FORGOT_WINDOW_MS, RESET_MAX_PER_IP, RESET_TTL_MS, resetLink } from './accounts.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, readMigrations } from './db.ts';
import type { MailMessage } from './mail.ts';

const ADAM = { nickname: 'Adam', email: 'adam@example.com', password: 'une-phrase-secrète' };
const NEW_PASSWORD = 'un-tout-nouveau-secret';

function setup() {
  const db = openDatabase(':memory:');
  const time = { now: 1_700_000_000_000 };
  const ip = { value: '10.0.0.1' };
  const sent: MailMessage[] = [];

  migrate(db, readMigrations());

  const api = createApp({
    config: loadConfig({}),
    db,
    clock: () => time.now,
    clientIp: () => ip.value,
    mailer: {
      send: (message) => {
        sent.push(message);

        return Promise.resolve(true);
      },
    },
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    api.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const me = (token: string) => api.request('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  /** Le jeton du dernier e-mail : la requête du lien. */
  const lastToken = (): string => {
    const link = /https?:\/\/\S+/u.exec(sent.at(-1)?.text ?? '')?.[0];

    if (!link) throw new Error('aucun lien envoyé');

    return new URL(link).searchParams.get('reset') ?? '';
  };

  return { db, time, ip, sent, post, me, lastToken };
}

async function register(post: ReturnType<typeof setup>['post']): Promise<string> {
  const body: unknown = await (await post('/auth/register', ADAM)).json();

  if (!isSessionResponse(body)) throw new Error('inscription attendue');

  return body.token;
}

describe('POST /auth/forgot', () => {
  it('envoie un lien à usage unique, et ne garde que son empreinte', async () => {
    const { post, sent, lastToken, db } = setup();

    await register(post);

    const response = await post('/auth/forgot', { email: ' ADAM@example.com ', locale: 'fr' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ADAM.email, toName: 'Adam', subject: 'Adam — nouveau mot de passe' });
    expect(sent[0]!.text).toContain('Un produit Hermez');
    expect(sent[0]!.html).toContain('Un produit Hermez');
    expect(sent[0]!.text).toContain('https://hermez.dev/adam/?reset=');

    const rows = db.prepare('SELECT token_hash FROM password_resets').all() as { token_hash: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(lastToken());
  });

  it('écrit l’e-mail dans la langue demandée', async () => {
    const { post, sent } = setup();

    await register(post);
    await post('/auth/forgot', { email: ADAM.email, locale: 'en' });
    expect(sent[0]!.subject).toBe('Adam — new password');
    expect(sent[0]!.text).toContain('A Hermez product');
  });

  it('répond pareil pour une adresse inconnue, sans rien envoyer', async () => {
    const { post, sent } = setup();

    await register(post);

    const known = await post('/auth/forgot', { email: ADAM.email });
    const unknown = await post('/auth/forgot', { email: 'personne@example.com' });

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sent).toHaveLength(1);
  });

  it('n’envoie rien à un invité', async () => {
    const { post, sent, db } = setup();

    await post('/auth/guest', { nickname: 'Ève' });

    const { email } = db.prepare('SELECT email FROM accounts').get() as { email: string };

    expect((await post('/auth/forgot', { email })).status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('refuse une adresse illisible', async () => {
    const { post } = setup();
    const response = await post('/auth/forgot', { email: 'pas-une-adresse' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid', fields: [{ field: 'email', problem: 'badFormat' }] });
  });

  it('limite les demandes par adresse, connue ou non, puis laisse passer la fenêtre écoulée', async () => {
    const { post, sent, time, ip } = setup();

    await register(post);
    for (const email of [ADAM.email, 'personne@example.com']) {
      for (let i = 0; i < FORGOT_MAX_PER_EMAIL; i += 1) {
        ip.value = `10.0.1.${i}`;
        expect((await post('/auth/forgot', { email })).status).toBe(200);
      }

      const blocked = await post('/auth/forgot', { email });

      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toMatchObject({ error: 'tooManyAttempts' });
    }
    expect(sent).toHaveLength(FORGOT_MAX_PER_EMAIL);

    time.now += FORGOT_WINDOW_MS + 1000;
    expect((await post('/auth/forgot', { email: ADAM.email })).status).toBe(200);
  });

  it('limite les demandes par IP', async () => {
    const { post } = setup();

    for (let i = 0; i < FORGOT_MAX_PER_IP; i += 1) expect((await post('/auth/forgot', { email: `joueur${i}@example.com` })).status).toBe(200);
    expect((await post('/auth/forgot', { email: 'encore@example.com' })).status).toBe(429);
  });
});

describe('POST /auth/reset', () => {
  it('change le mot de passe, ferme toutes les sessions et en ouvre une nouvelle', async () => {
    const { post, me, lastToken } = setup();
    const first = await register(post);
    const second: unknown = await (await post('/auth/login', ADAM)).json();

    if (!isSessionResponse(second)) throw new Error('connexion attendue');

    await post('/auth/forgot', { email: ADAM.email });

    const response = await post('/auth/reset', { token: lastToken(), password: NEW_PASSWORD });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(isSessionResponse(body)).toBe(true);
    if (!isSessionResponse(body)) return;
    expect(body.user).toMatchObject({ nickname: 'Adam', email: ADAM.email });

    expect((await me(first)).status).toBe(401);
    expect((await me(second.token)).status).toBe(401);
    expect((await me(body.token)).status).toBe(200);
    expect((await post('/auth/login', ADAM)).status).toBe(401);
    expect((await post('/auth/login', { email: ADAM.email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('refuse un jeton déjà servi', async () => {
    const { post, lastToken } = setup();

    await register(post);
    await post('/auth/forgot', { email: ADAM.email });

    const token = lastToken();

    expect((await post('/auth/reset', { token, password: NEW_PASSWORD })).status).toBe(200);

    const again = await post('/auth/reset', { token, password: 'encore-un-autre-secret' });

    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ ok: false, error: 'badToken' });
  });

  it('refuse un jeton expiré', async () => {
    const { post, lastToken, time } = setup();

    await register(post);
    await post('/auth/forgot', { email: ADAM.email });
    time.now += RESET_TTL_MS + 1000;

    const response = await post('/auth/reset', { token: lastToken(), password: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'badToken' });
    expect((await post('/auth/login', ADAM)).status).toBe(200);
  });

  it('refuse un jeton remplacé par une demande plus récente', async () => {
    const { post, lastToken } = setup();

    await register(post);
    await post('/auth/forgot', { email: ADAM.email });

    const old = lastToken();

    await post('/auth/forgot', { email: ADAM.email });
    expect((await post('/auth/reset', { token: old, password: NEW_PASSWORD })).status).toBe(400);
    expect((await post('/auth/reset', { token: lastToken(), password: NEW_PASSWORD })).status).toBe(200);
  });

  it('applique au mot de passe les règles de l’inscription, sans consommer le jeton', async () => {
    const { post, lastToken } = setup();

    await register(post);
    await post('/auth/forgot', { email: ADAM.email });

    const short = await post('/auth/reset', { token: lastToken(), password: 'court' });
    const body: unknown = await short.json();

    expect(short.status).toBe(400);
    expect(isAccountError(body) && body.fields).toEqual([{ field: 'password', problem: 'tooShort' }]);
    expect((await post('/auth/reset', { token: lastToken(), password: NEW_PASSWORD })).status).toBe(200);
  });

  it('limite les jetons inconnus par IP', async () => {
    const { post } = setup();

    for (let i = 0; i < RESET_MAX_PER_IP; i += 1) expect((await post('/auth/reset', { token: `faux-${i}`, password: NEW_PASSWORD })).status).toBe(400);
    expect((await post('/auth/reset', { token: 'encore', password: NEW_PASSWORD })).status).toBe(429);
  });
});

describe('resetLink', () => {
  it('pose le jeton sur l’adresse publique du jeu', () => {
    expect(resetLink('https://hermez.dev/adam/', 'abc_-1')).toBe('https://hermez.dev/adam/?reset=abc_-1');
    expect(resetLink('http://localhost:5173/adam/?x=1#y', 't')).toBe('http://localhost:5173/adam/?reset=t');
  });
});
