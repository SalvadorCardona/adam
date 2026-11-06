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
  type ForgotResponse,
  type MailLocale,
  type MeResponse,
  type SessionResponse,
  RESET_PARAM,
} from '../../shared/api.ts';
import { resetEmail, type Mailer } from './mail.ts';
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
/** Invités par IP sur la même fenêtre : un salon, une soirée entre amis, pas une usine à comptes. */
export const GUEST_MAX_PER_IP = 20;
/** Un lien « mot de passe oublié » vaut 30 minutes. */
export const RESET_TTL_MS = 30 * 60 * 1000;
/** Demandes de lien par adresse, et par IP, sur la fenêtre : de quoi réessayer, pas de quoi inonder une boîte. */
export const FORGOT_MAX_PER_EMAIL = 3;
export const FORGOT_MAX_PER_IP = 10;
export const FORGOT_WINDOW_MS = 60 * 60 * 1000;
/** Jetons de réinitialisation refusés par IP sur la fenêtre de connexion. */
export const RESET_MAX_PER_IP = 20;

export interface AccountDeps {
  readonly db: DatabaseSync;
  /** L'horloge, en millisecondes depuis 1970. */
  readonly clock: () => number;
  /** L'IP du client ; en test, une valeur fixe. */
  readonly clientIp: (c: Context) => string;
  /** L'envoi des e-mails (Brevo, ou les journaux sans clé). */
  readonly mailer: Mailer;
  /** L'adresse publique du jeu : le lien de l'e-mail y mène (`PUBLIC_URL`). */
  readonly publicUrl: string;
}

/** Le lien de l'e-mail : la page du jeu et `?reset=<jeton>`. */
export function resetLink(publicUrl: string, token: string): string {
  const url = new URL(publicUrl);

  url.search = '';
  url.hash = '';
  url.searchParams.set(RESET_PARAM, token);

  return url.toString();
}

const mailLocale = (value: unknown): MailLocale => (value === 'en' ? 'en' : 'fr');

interface AccountRow {
  readonly id: number;
  readonly nickname: string;
  readonly email: string;
  readonly password_hash: string;
  readonly guest: number;
}

const fingerprint = (token: string): string => createHash('sha256').update(token).digest('hex');

const publicUser = (row: AccountRow): AccountUser =>
  row.guest ? { id: row.id, nickname: row.nickname, email: '', guest: true } : { id: row.id, nickname: row.nickname, email: row.email };

/** L'adresse d'un invité : unique, jamais montrée, dans un domaine qui n'existe pas (`.invalid`). */
const guestEmail = (): string => `guest-${randomBytes(12).toString('hex')}@guest.invalid`;

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

/** Le compte derrière un jeton de session, ou `null` (inconnu, expiré). Le WebSocket le lit d'ici. */
export function tokenReader(db: DatabaseSync, clock: () => number): (token: string) => AccountUser | null {
  const findBySession = db.prepare(
    'SELECT a.id, a.nickname, a.email, a.password_hash, a.guest FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?',
  );

  return (token) => {
    const row = findBySession.get(fingerprint(token), clock()) as AccountRow | undefined;

    return row ? publicUser(row) : null;
  };
}

/**
 * Qui parle ? Le compte derrière le jeton `Authorization: Bearer`, ou `null`
 * (pas de jeton, jeton inconnu ou expiré). Les routes qui demandent un
 * joueur connecté — parties hébergées — le lisent d'ici.
 */
export function sessionReader(db: DatabaseSync, clock: () => number): (c: Context) => AccountUser | null {
  const userOf = tokenReader(db, clock);

  return (c) => {
    const token = bearer(c);

    return token ? userOf(token) : null;
  };
}

function bearer(c: Context): string | null {
  const match = /^Bearer\s+(\S+)$/iu.exec(c.req.header('Authorization') ?? '');

  return match?.[1] ?? null;
}

export function accountRoutes({ db, clock, clientIp, mailer, publicUrl }: AccountDeps): Hono {
  const routes = new Hono();
  const loginByEmail = new AttemptLimiter(LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS, clock);
  const loginByIp = new AttemptLimiter(LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS, clock);
  const registerByIp = new AttemptLimiter(REGISTER_MAX_PER_IP, REGISTER_WINDOW_MS, clock);

  const guestByIp = new AttemptLimiter(GUEST_MAX_PER_IP, REGISTER_WINDOW_MS, clock);
  const forgotByEmail = new AttemptLimiter(FORGOT_MAX_PER_EMAIL, FORGOT_WINDOW_MS, clock);
  const forgotByIp = new AttemptLimiter(FORGOT_MAX_PER_IP, FORGOT_WINDOW_MS, clock);
  const resetByIp = new AttemptLimiter(RESET_MAX_PER_IP, LOGIN_WINDOW_MS, clock);

  const findByEmail = db.prepare('SELECT id, nickname, email, password_hash, guest FROM accounts WHERE email = ?');
  const insertAccount = db.prepare('INSERT INTO accounts (nickname, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
  const insertGuest = db.prepare("INSERT INTO accounts (nickname, email, password_hash, created_at, guest) VALUES (?, ?, '', ?, 1)");
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const currentUser = sessionReader(db, clock);
  const insertReset = db.prepare('INSERT INTO password_resets (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const deleteResetsOf = db.prepare('DELETE FROM password_resets WHERE account_id = ?');
  const deleteExpiredResets = db.prepare('DELETE FROM password_resets WHERE expires_at <= ?');
  const findReset = db.prepare(
    'SELECT a.id, a.nickname, a.email, a.password_hash, a.guest FROM password_resets r JOIN accounts a ON a.id = r.account_id WHERE r.token_hash = ? AND r.expires_at > ?',
  );
  const consumeReset = db.prepare('DELETE FROM password_resets WHERE token_hash = ? AND expires_at > ?');
  const updatePassword = db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?');
  const deleteSessionsOf = db.prepare('DELETE FROM sessions WHERE account_id = ?');

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

  /*
   * Un invité : l'ami qui ouvre le lien d'une partie entre son pseudo et joue,
   * sans adresse ni mot de passe. Un compte temporaire, marqué `guest`, sans
   * hachage : `verifyPassword` refuse tout, personne ne s'y connecte ; seul le
   * jeton gardé sur son appareil le fait revenir.
   */
  routes.post(API_PATHS.guest, async (c) => {
    const ip = clientIp(c);
    const wait = guestByIp.retryAfter(ip);

    if (wait > 0) return fail(c, 429, 'tooManyAttempts', { retryAfter: wait });

    const body = await readJson(c);
    const nickname = cleanNickname(text(body?.['nickname']));
    const problem = nicknameProblem(nickname);

    if (!body || problem) return fail(c, 400, 'invalid', { fields: [{ field: 'nickname', problem: problem ?? 'empty' }] });

    guestByIp.hit(ip);

    const id = Number(insertGuest.run(nickname, guestEmail(), new Date(clock()).toISOString()).lastInsertRowid);
    const response: SessionResponse = { ok: true, token: openSession(id), user: { id, nickname, email: '', guest: true } };

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

  /*
   * Mot de passe oublié. La réponse est toujours la même, que l'adresse ait un
   * compte ou non, et elle n'attend pas l'envoi : ni le corps ni la durée ne
   * disent si le compte existe. Un invité n'a pas d'adresse : rien ne part.
   * Un nouveau lien remplace les précédents du compte.
   */
  routes.post(API_PATHS.forgot, async (c) => {
    const ip = clientIp(c);
    const body = await readJson(c);
    const email = cleanEmail(text(body?.['email']));
    const wait = Math.max(forgotByIp.retryAfter(ip), forgotByEmail.retryAfter(email));

    if (wait > 0) return fail(c, 429, 'tooManyAttempts', { retryAfter: wait });

    const problem = emailProblem(email);

    if (!body || problem) return fail(c, 400, 'invalid', { fields: [{ field: 'email', problem: problem ?? 'empty' }] });

    forgotByIp.hit(ip);
    forgotByEmail.hit(email);

    const row = findByEmail.get(email) as AccountRow | undefined;

    if (row && !row.guest) {
      const token = randomBytes(32).toString('base64url');
      const now = clock();

      deleteExpiredResets.run(now);
      deleteResetsOf.run(row.id);
      insertReset.run(fingerprint(token), row.id, new Date(now).toISOString(), now + RESET_TTL_MS);

      const message = resetEmail(mailLocale(body['locale']), row.nickname, resetLink(publicUrl, token));

      void mailer.send({ to: row.email, toName: row.nickname, ...message }).catch(() => false);
    }

    const response: ForgotResponse = { ok: true };

    c.header('Cache-Control', 'no-store');

    return c.json(response);
  });

  /*
   * Le lien ouvert : le jeton (inconnu, expiré ou déjà servi : `badToken`) et
   * le nouveau mot de passe, aux règles de l'inscription. Le jeton est
   * consommé, toutes les sessions du compte sont fermées — un voleur de
   * session en est chassé —, puis une nouvelle s'ouvre pour ce joueur-ci.
   */
  routes.post(API_PATHS.reset, async (c) => {
    const ip = clientIp(c);
    const wait = resetByIp.retryAfter(ip);

    if (wait > 0) return fail(c, 429, 'tooManyAttempts', { retryAfter: wait });

    const body = await readJson(c);
    const token = text(body?.['token']);
    const password = text(body?.['password']);
    const problem = passwordProblem(password);

    if (!body || problem) return fail(c, 400, 'invalid', { fields: [{ field: 'password', problem: problem ?? 'empty' }] });

    const now = clock();
    const hash = fingerprint(token);
    const row = token.length > 0 && token.length <= 128 ? (findReset.get(hash, now) as AccountRow | undefined) : undefined;

    if (!row) {
      resetByIp.hit(ip);

      return fail(c, 400, 'badToken');
    }

    const passwordHash = await hashPassword(password);

    db.exec('BEGIN');
    try {
      // Deux envois du même lien en même temps : un seul le consomme.
      if (Number(consumeReset.run(hash, clock()).changes) !== 1) {
        db.exec('ROLLBACK');
        resetByIp.hit(ip);

        return fail(c, 400, 'badToken');
      }
      updatePassword.run(passwordHash, row.id);
      deleteResetsOf.run(row.id);
      deleteSessionsOf.run(row.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    loginByEmail.reset(row.email);

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
