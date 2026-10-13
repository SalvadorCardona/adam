/**
 * Les parties hébergées : un joueur connecté ouvre une session de partie, le
 * serveur lui donne un code d'invitation, un ami le rejoint et attend dans la
 * salle d'attente ; ils jouent ensuite par le WebSocket (`rooms.ts`).
 *
 * Le code est tiré au hasard (`randomBytes`, jamais déduit de l'id), assez long
 * pour qu'un essai au hasard ne tombe pas dessus, et chercher des codes
 * inconnus est limité par IP. La session expire (`INVITE_TTL_MINUTES`) ou se
 * ferme : lien expiré, plus personne ne rejoint. Un hôte n'a qu'une session
 * ouverte à la fois. Le jeu lui-même passe par le WebSocket (`rooms.ts`), qui
 * lit ici qui est l'hôte et qui est dans la salle (`partyDirectory`).
 */

import { randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Hono, type Context } from 'hono';
import {
  API_PATHS,
  PARTY_ALPHABET,
  PARTY_LIMITS,
  cleanPartyCode,
  type AccountUser,
  type PartyErrorResponse,
  type PartyInfo,
  type PartyResponse,
} from '../../shared/api.ts';
import { AttemptLimiter } from './rateLimit.ts';

/** Codes inconnus tolérés par IP sur la fenêtre : de quoi se tromper, pas de quoi deviner. */
export const LOOKUP_MAX_PER_IP = 30;
export const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
/** Les parties finies depuis plus d'un jour sont effacées. */
const KEEP_MS = 24 * 3600 * 1000;

export interface PartyDeps {
  readonly db: DatabaseSync;
  readonly clock: () => number;
  readonly clientIp: (c: Context) => string;
  /** Qui parle ? (`sessionReader` de `accounts.ts`) */
  readonly userOf: (c: Context) => AccountUser | null;
  /** Durée de validité d'une invitation, en millisecondes. */
  readonly ttlMs: number;
  /** L'hôte ferme sa session : ceux qui y jouent l'apprennent (`PartyRooms.end`). */
  readonly onClosed?: (code: string) => void;
}

/** Ce que le WebSocket a besoin de savoir d'une partie : son hôte, sa salle, si elle est fermée. */
export interface PartyDirectory {
  find(code: string): { readonly hostId: number; readonly host: string; readonly closed: boolean } | null;
  isGuest(code: string, accountId: number): boolean;
}

/**
 * Une partie expirée se joue encore : l'invitation ne sert plus à entrer,
 * mais l'ami déjà dans la salle peut s'y reconnecter tant que l'hôte ne l'a
 * pas fermée.
 */
export function partyDirectory(db: DatabaseSync): PartyDirectory {
  const findParty = db.prepare('SELECT p.host_id, a.nickname AS host, p.closed_at FROM parties p JOIN accounts a ON a.id = p.host_id WHERE p.code = ?');
  const findGuest = db.prepare('SELECT 1 FROM party_guests g JOIN parties p ON p.id = g.party_id WHERE p.code = ? AND g.account_id = ?');

  return {
    find(code) {
      const row = findParty.get(code) as { host_id: number; host: string; closed_at: number | null } | undefined;

      return row ? { hostId: row.host_id, host: row.host, closed: row.closed_at !== null } : null;
    },
    isGuest: (code, accountId) => findGuest.get(code, accountId) !== undefined,
  };
}

interface PartyRow {
  readonly id: number;
  readonly code: string;
  readonly host_id: number;
  readonly host: string;
  readonly expires_at: number;
  readonly closed_at: number | null;
}

interface GuestRow {
  readonly id: number;
  readonly nickname: string;
}

/** Un code au hasard : chaque caractère tiré sans biais dans l'alphabet. */
export function newPartyCode(): string {
  let code = '';

  for (let i = 0; i < PARTY_LIMITS.codeLength; i += 1) code += PARTY_ALPHABET[randomInt(PARTY_ALPHABET.length)]!;

  return code;
}

function fail(c: Context, status: 401 | 403 | 404 | 409 | 410 | 429, error: PartyErrorResponse['error'], retryAfter?: number): Response {
  const body: PartyErrorResponse = { ok: false, error, ...(retryAfter !== undefined && { retryAfter }) };

  c.header('Cache-Control', 'no-store');

  return c.json(body, status);
}

export function partyRoutes({ db, clock, clientIp, userOf, ttlMs, onClosed }: PartyDeps): Hono {
  const routes = new Hono();
  const unknownByIp = new AttemptLimiter(LOOKUP_MAX_PER_IP, LOOKUP_WINDOW_MS, clock);

  const findParty = db.prepare(
    'SELECT p.id, p.code, p.host_id, a.nickname AS host, p.expires_at, p.closed_at FROM parties p JOIN accounts a ON a.id = p.host_id WHERE p.code = ?',
  );
  const insertParty = db.prepare('INSERT INTO parties (code, host_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const openOf = db.prepare('SELECT code FROM parties WHERE host_id = ? AND closed_at IS NULL AND expires_at > ?');
  const closeOf = db.prepare('UPDATE parties SET closed_at = ? WHERE host_id = ? AND closed_at IS NULL AND expires_at > ?');
  const closeOne = db.prepare('UPDATE parties SET closed_at = ? WHERE id = ?');
  const deleteOld = db.prepare('DELETE FROM parties WHERE MAX(expires_at, COALESCE(closed_at, 0)) <= ?');
  const guestsOf = db.prepare(
    'SELECT a.id, a.nickname FROM party_guests g JOIN accounts a ON a.id = g.account_id WHERE g.party_id = ? ORDER BY g.joined_at, a.id',
  );
  const addGuest = db.prepare('INSERT OR IGNORE INTO party_guests (party_id, account_id, joined_at) VALUES (?, ?, ?)');
  const removeGuest = db.prepare('DELETE FROM party_guests WHERE party_id = ? AND account_id = ?');

  /** La partie derrière ce code, ou la réponse d'échec à renvoyer. */
  function open(c: Context, raw: string): PartyRow | Response {
    const code = cleanPartyCode(raw);
    const row = code ? (findParty.get(code) as PartyRow | undefined) : undefined;

    if (!row) {
      const ip = clientIp(c);
      const wait = unknownByIp.retryAfter(ip);

      unknownByIp.hit(ip);

      return wait > 0 ? fail(c, 429, 'tooManyAttempts', wait) : fail(c, 404, 'notFound');
    }
    if (row.closed_at !== null) return fail(c, 410, 'closed');
    if (row.expires_at <= clock()) return fail(c, 410, 'expired');

    return row;
  }

  function view(row: PartyRow, user: AccountUser | null): PartyInfo {
    const guests = guestsOf.all(row.id) as unknown as GuestRow[];
    const role = user?.id === row.host_id ? 'host' : guests.some((guest) => guest.id === user?.id) ? 'guest' : 'none';

    return {
      code: row.code,
      host: row.host,
      expiresAt: row.expires_at,
      role,
      guests: role === 'none' ? [] : guests.map((guest) => guest.nickname),
      full: guests.length >= PARTY_LIMITS.maxGuests,
    };
  }

  const respond = (c: Context, row: PartyRow, user: AccountUser | null, status: 200 | 201 = 200): Response => {
    const body: PartyResponse = { ok: true, party: view(row, user) };

    c.header('Cache-Control', 'no-store');

    return c.json(body, status);
  };

  routes.post(API_PATHS.parties, (c) => {
    const user = userOf(c);

    if (!user) return fail(c, 401, 'unauthorized');

    const now = clock();

    deleteOld.run(now - KEEP_MS);
    // Une seule invitation ouverte par hôte : la précédente se ferme, et ceux qui y jouaient l'apprennent.
    const previous = openOf.all(user.id, now) as unknown as { code: string }[];

    closeOf.run(now, user.id, now);
    for (const { code } of previous) onClosed?.(code);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newPartyCode();

      try {
        insertParty.run(code, user.id, new Date(now).toISOString(), now + ttlMs);
      } catch {
        // Le code existe déjà (une chance sur 10^11) : on en tire un autre.
        continue;
      }

      return respond(c, findParty.get(code) as unknown as PartyRow, user, 201);
    }

    throw new Error('Impossible de tirer un code de partie libre');
  });

  routes.get(`${API_PATHS.parties}/:code`, (c) => {
    const row = open(c, c.req.param('code'));

    return row instanceof Response ? row : respond(c, row, userOf(c));
  });

  routes.post(`${API_PATHS.parties}/:code/join`, (c) => {
    const user = userOf(c);

    if (!user) return fail(c, 401, 'unauthorized');

    const row = open(c, c.req.param('code'));

    if (row instanceof Response) return row;

    const before = view(row, user);

    // L'hôte qui ouvre son propre lien retrouve sa salle ; un invité déjà entré aussi.
    if (before.role === 'none') {
      if (before.full) return fail(c, 409, 'full');
      addGuest.run(row.id, user.id, clock());
    }

    return respond(c, row, user);
  });

  routes.post(`${API_PATHS.parties}/:code/leave`, (c) => {
    const user = userOf(c);

    if (!user) return fail(c, 401, 'unauthorized');

    const row = open(c, c.req.param('code'));

    if (row instanceof Response) return row;
    removeGuest.run(row.id, user.id);
    c.header('Cache-Control', 'no-store');

    return c.json({ ok: true });
  });

  routes.delete(`${API_PATHS.parties}/:code`, (c) => {
    const user = userOf(c);

    if (!user) return fail(c, 401, 'unauthorized');

    const row = open(c, c.req.param('code'));

    if (row instanceof Response) return row;
    if (row.host_id !== user.id) return fail(c, 403, 'forbidden');
    closeOne.run(clock(), row.id);
    onClosed?.(row.code);
    c.header('Cache-Control', 'no-store');

    return c.json({ ok: true });
  });

  return routes;
}
