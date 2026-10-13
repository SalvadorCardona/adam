/**
 * Les comptes : inscription, connexion, déconnexion, « qui suis-je ».
 *
 * Session : un jeton opaque (32 octets au hasard) que le client garde sur
 * l'appareil et renvoie en `Authorization: Bearer`. Un cookie httpOnly serait
 * plus sûr contre le vol par script, mais le jeu (GitHub Pages) et le serveur
 * sont sur deux origines : le cookie y serait « tiers », que Safari et les
 * navigateurs mobiles refusent. Le jeton, lui, marche partout, y compris dans
 * une PWA ou Capacitor ; le serveur n'en garde que l'empreinte SHA-256.
 *
 * Ni mot de passe ni jeton ne sont journalisés.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Hono, type Context } from 'hono';
import {
  API_PATHS,
  cleanEmail,
  cleanNickname,
  emailProblem,
  nicknameProblem,
  passwordProblem,
  type AccountErrorResponse,
  type AccountUser,
  type FieldError,
  type MeResponse,
  type SessionResponse,
} from '../../shared/api.ts';
import { DECOY_HASH, hashPassword, verifyPassword } from './passwords.ts';
import { AttemptLimiter } from './rateLimit.ts';

/** Une session dure 90 jours, renouvelée à chaque connexion. */
export const SESSION_MS = 90 * 24 * 3600 * 1000;
/** Échecs de connexion tolérés par adresse, et par IP, sur la fenêtre. */
export const LOGIN_MAX_PER_EMAIL = 5;
export const LOGIN_MAX_PER_IP = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Inscriptions par IP sur la fenêtre. */
export const REGISTER_MAX_PER_IP = 10;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export interface AccountDeps {
  readonly db: DatabaseSync;
  /** L'horloge, en millisecondes depuis 1970. */
  readonly clock: () => number;
  /** L'IP du client ; en test, une valeur fixe. */
  readonly clientIp: (c: Context) => string;
}

interface AccountRow {
  readonly id: number;
  readonly nickname: string;
  readonly email: string;
  readonly password_hash: string;
}

const fingerprint = (token: string): string => createHash('sha256').update(token).digest('hex');

const publicUser = (row: AccountRow): AccountUser => ({ id: row.id, nickname: row.nickname, email: row.email });

function fail(
  c: Context,
  status: 400 | 401 | 409 | 429,
  error: AccountErrorResponse['error'],
  extra: Partial<AccountErrorResponse> = {},
): Response {
  const body: AccountErrorResponse = { ok: false, error, ...extra };

  c.header('Cache-Control', 'no-store');

  return c.json(body, status);
}

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();

    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Qui parle ? Le compte derrière le jeton `Authorization: Bearer`, ou `null`
 * (pas de jeton, jeton inconnu ou expiré). Les routes qui demandent un
 * joueur connecté — parties hébergées — le lisent d'ici.
 */
export function sessionReader(db: DatabaseSync, clock: () => number): (c: Context) => AccountUser | null {
  const findBySession = db.prepare(
    'SELECT a.id, a.nickname, a.email, a.password_hash FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?',
  );

  return (c) => {
    const token = bearer(c);
    const row = token ? (findBySession.get(fingerprint(token), clock()) as AccountRow | undefined) : undefined;

    return row ? publicUser(row) : null;
  };
}

function bearer(c: Context): string | null {
  const match = /^Bearer\s+(\S+)$/iu.exec(c.req.header('Authorization') ?? '');

  return match?.[1] ?? null;
}

export function accountRoutes({ db, clock, clientIp }: AccountDeps): Hono {
  const routes = new Hono();
  const loginByEmail = new AttemptLimiter(LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS, clock);
  const loginByIp = new AttemptLimiter(LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS, clock);
  const registerByIp = new AttemptLimiter(REGISTER_MAX_PER_IP, REGISTER_WINDOW_MS, clock);

  const findByEmail = db.prepare('SELECT id, nickname, email, password_hash FROM accounts WHERE email = ?');
  const insertAccount = db.prepare('INSERT INTO accounts (nickname, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const currentUser = sessionReader(db, clock);

  function openSession(accountId: number): string {
    const token = randomBytes(32).toString('base64url');
    const now = clock();

    deleteExpired.run(now);
    insertSession.run(fingerprint(token), accountId, new Date(now).toISOString(), now + SESSION_MS);

    return token;
  }

  routes.post(API_PATHS.register, async (c) => {
    const ip = clientIp(c);
    const wait = registerByIp.retryAfter(ip);

    if (wait > 0) return fail(c, 429, 'tooManyAttempts', { retryAfter: wait });

    const body = await readJson(c);
    const nickname = cleanNickname(text(body?.['nickname']));
    const email = cleanEmail(text(body?.['email']));
    const password = text(body?.['password']);
    const problems: FieldError[] = [];
    const nicknameIssue = nicknameProblem(nickname);
    const emailIssue = emailProblem(email);
    const passwordIssue = passwordProblem(password);

    if (nicknameIssue) problems.push({ field: 'nickname', problem: nicknameIssue });
    if (emailIssue) problems.push({ field: 'email', problem: emailIssue });
    if (passwordIssue) problems.push({ field: 'password', problem: passwordIssue });
    if (!body || problems.length > 0) return fail(c, 400, 'invalid', { fields: problems });

    registerByIp.hit(ip);

    if (findByEmail.get(email)) return fail(c, 409, 'emailTaken');

    const hash = await hashPassword(password);
    let id: number;

    try {
      id = Number(insertAccount.run(nickname, email, hash, new Date(clock()).toISOString()).lastInsertRowid);
    } catch {
      // Deux inscriptions simultanées de la même adresse : la contrainte UNIQUE tranche.
      return fail(c, 409, 'emailTaken');
    }

    const response: SessionResponse = { ok: true, token: openSession(id), user: { id, nickname, email } };

    c.header('Cache-Control', 'no-store');

    return c.json(response, 201);
  });

  routes.post(API_PATHS.login, async (c) => {
    const ip = clientIp(c);
    const body = await readJson(c);
    const email = cleanEmail(text(body?.['email']));
    const password = text(body?.['password']);
    const wait = Math.max(loginByIp.retryAfter(ip), loginByEmail.retryAfter(email));

    if (wait > 0) return fail(c, 429, 'tooManyAttempts', { retryAfter: wait });
    if (!body || email === '' || password === '' || password.length > 1024) {
      return fail(c, 400, 'invalid', {
        fields: [
          ...(email === '' ? [{ field: 'email', problem: 'empty' } as const] : []),
          ...(password === '' ? [{ field: 'password', problem: 'empty' } as const] : []),
        ],
      });
    }

    const row = findByEmail.get(email) as AccountRow | undefined;
    // Même travail que l'adresse existe ou non : la durée ne dit pas laquelle.
    const good = await verifyPassword(password, row?.password_hash ?? DECOY_HASH);

    if (!row || !good) {
      loginByIp.hit(ip);
      loginByEmail.hit(email);

      return fail(c, 401, 'badCredentials');
    }

    loginByEmail.reset(email);

    const response: SessionResponse = { ok: true, token: openSession(row.id), user: publicUser(row) };

    c.header('Cache-Control', 'no-store');

    return c.json(response);
  });

  routes.post(API_PATHS.logout, (c) => {
    const token = bearer(c);

    // Idempotent : se déconnecter d'une session déjà finie réussit aussi.
    if (token) deleteSession.run(fingerprint(token));
    c.header('Cache-Control', 'no-store');

    return c.json({ ok: true });
  });

  routes.get(API_PATHS.me, (c) => {
    const user = currentUser(c);

    if (!user) return fail(c, 401, 'unauthorized');

    const response: MeResponse = { ok: true, user };

    c.header('Cache-Control', 'no-store');

    return c.json(response);
  });

  return routes;
}
