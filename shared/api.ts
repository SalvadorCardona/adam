/**
 * Le contrat entre le jeu et son back-end : ce que l'un envoie, ce que
 * l'autre lit. Importé des deux côtés — `src/net/` dans le navigateur,
 * `server/src/` dans Node —, il ne connaît donc ni le DOM ni Node : des
 * types, des constantes et des gardes pures, rien d'autre.
 *
 * Le jeu ne dépend jamais du serveur pour jouer. Ce contrat ne décrit que
 * des fonctions en ligne, qui s'ajoutent à une partie locale complète.
 */

/**
 * La version du contrat. Elle monte quand une réponse change de forme d'une
 * façon qu'un client plus ancien lirait mal ; le client la compare à la
 * sienne et se tient hors ligne si elle ne correspond pas.
 */
export const API_VERSION = 1;

/** Le nom que `/health` renvoie : un autre service sur la même URL n'est pas « en ligne ». */
export const API_SERVICE = 'adam';

/** Les chemins de l'API, des deux côtés la même chaîne. */
export const API_PATHS = {
  health: '/health',
  socket: '/ws',
  register: '/auth/register',
  login: '/auth/login',
  /** Un invité : un pseudo seul, pour rejoindre (ou héberger) une partie sans créer de compte. */
  guest: '/auth/guest',
  logout: '/auth/logout',
  me: '/auth/me',
  parties: '/parties',
} as const;

/** Le chemin d'une partie hébergée (`GET` pour la voir, `DELETE` pour la fermer). */
export const partyPath = (code: string): string => `${API_PATHS.parties}/${code}`;
/** Rejoindre la partie (`POST`). */
export const partyJoinPath = (code: string): string => `${partyPath(code)}/join`;
/** Quitter la salle d'attente d'un autre (`POST`). */
export const partyLeavePath = (code: string): string => `${partyPath(code)}/leave`;

/** La réponse de `GET /health`. */
export interface HealthResponse {
  readonly ok: true;
  readonly service: typeof API_SERVICE;
  readonly api: number;
  /** La dernière migration appliquée à la base. */
  readonly schema: number;
  /** Secondes depuis le démarrage du serveur. */
  readonly uptime: number;
}

/** Une réponse lue sur le réseau est-elle bien celle de `/health` ? */
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;

  const body = value as Record<string, unknown>;

  return (
    body['ok'] === true &&
    body['service'] === API_SERVICE &&
    typeof body['api'] === 'number' &&
    typeof body['schema'] === 'number' &&
    typeof body['uptime'] === 'number'
  );
}

/**
 * Les messages du WebSocket : une poignée de main, un ping applicatif, et le
 * jeu à deux. Pour jouer, l'hôte et l'ami s'annoncent (`host`, `join`) avec
 * le code de la partie et leur jeton de session ; le serveur vérifie qui ils
 * sont, puis relaie entre eux, sans les lire, les messages du jeu (`relay`) —
 * la partie tourne chez l'hôte, qui fait autorité (`src/net/lockstep.ts`).
 */
export type ServerMessage =
  | { readonly type: 'hello'; readonly api: number }
  | { readonly type: 'pong'; readonly t: number }
  | { readonly type: 'error'; readonly reason: SocketError }
  /** L'hôte est dans la salle de sa partie. */
  | { readonly type: 'hosting'; readonly code: string }
  /** L'ami est dans la salle ; `hostOnline` : l'hôte y est aussi, la partie peut commencer. */
  | { readonly type: 'joined'; readonly code: string; readonly host: string; readonly hostOnline: boolean }
  /** À l'hôte : un ami est entré (ou revenu), un ami est parti. `guest` : l'id de son compte. */
  | { readonly type: 'guestIn'; readonly guest: number; readonly nickname: string }
  | { readonly type: 'guestOut'; readonly guest: number }
  /** À l'ami : l'hôte est revenu, l'hôte est parti. */
  | { readonly type: 'hostIn' }
  | { readonly type: 'hostOut' }
  /** La session est fermée par l'hôte : plus personne n'y joue. */
  | { readonly type: 'ended' }
  /** Un message du jeu, tel que l'autre l'a envoyé ; `from` : l'ami qui l'envoie, pour l'hôte. */
  | { readonly type: 'relay'; readonly data: unknown; readonly from?: number }
  /**
   * La signalisation du vocal (WebRTC) d'un autre membre de la salle : le
   * serveur ne la lit pas, il la passe avec l'id et le pseudo de l'expéditeur.
   * Le son, lui, ne passe jamais par ici.
   */
  | { readonly type: 'voice'; readonly from: number; readonly nickname: string; readonly data: unknown };

export type ClientMessage =
  | { readonly type: 'ping'; readonly t: number }
  | { readonly type: 'host'; readonly code: string; readonly token: string }
  | { readonly type: 'join'; readonly code: string; readonly token: string }
  /** Un message du jeu : de l'hôte à ses amis (`to` : un seul), ou de l'ami à l'hôte. */
  | { readonly type: 'relay'; readonly data: unknown; readonly to?: number }
  /** Signalisation du vocal : à tous les autres membres de la salle, ou à `to` (l'id d'un compte) seulement. */
  | { readonly type: 'voice'; readonly data: unknown; readonly to?: number };

/**
 * Ce qu'un message refusé reçoit en retour : illisible, jeton inconnu, code
 * inconnu, session fermée, pas sa partie, pas encore dans une salle, ou une
 * connexion plus récente du même joueur qui prend sa place.
 */
export type SocketError = 'badMessage' | 'unauthorized' | 'notFound' | 'closed' | 'forbidden' | 'notInRoom' | 'replaced';

export const PLAY_LIMITS = {
  /**
   * Le plus gros message accepté : l'image complète d'une partie, que l'hôte
   * envoie à l'ami qui arrive. Une longue partie en fait quelques centaines de
   * Ko ; le reste du protocole tient en quelques dizaines d'octets.
   */
  maxMessageBytes: 4 * 1024 * 1024,
  /** Messages relayés par seconde au plus, par connexion : au-delà, ils sont jetés. */
  relaysPerSecond: 60,
} as const;

/** Le vocal : sa signalisation a son propre budget, pour ne jamais gêner les pas de la partie. */
export const VOICE_LIMITS = {
  /** Une offre ou une réponse SDP tient dans quelques Ko ; au-delà, ce n'est pas du vocal. */
  maxSignalBytes: 16 * 1024,
  /** Messages de signalisation par seconde au plus, par connexion : une rafale de candidats ICE passe, le reste est jeté. */
  signalsPerSecond: 40,
} as const;

/** Un message reçu par le serveur est-il l'un de ceux qu'il connaît ? */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const message = value as Record<string, unknown>;
  const { type, code, token, to } = message;

  if (type === 'ping' && typeof message['t'] === 'number') return { type: 'ping', t: message['t'] };
  if ((type === 'host' || type === 'join') && typeof code === 'string' && typeof token === 'string') return { type, code, token };
  if (type === 'relay' && 'data' in message && (to === undefined || (typeof to === 'number' && Number.isSafeInteger(to)))) {
    return { type: 'relay', data: message['data'], ...(to !== undefined && { to }) };
  }

  if (type === 'voice' && 'data' in message && (to === undefined || (typeof to === 'number' && Number.isSafeInteger(to)))) {
    return { type: 'voice', data: message['data'], ...(to !== undefined && { to }) };
  }

  return null;
}

/** Un message reçu du serveur, s'il en a la forme ; `null` sinon. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const message = value as Record<string, unknown>;

  switch (message['type']) {
    case 'hello':
    case 'pong':
    case 'error':
    case 'hosting':
    case 'hostIn':
    case 'hostOut':
    case 'ended':
    case 'guestOut':
      return value as ServerMessage;
    case 'joined':
      return typeof message['host'] === 'string' && typeof message['hostOnline'] === 'boolean' ? (value as ServerMessage) : null;
    case 'guestIn':
      return typeof message['guest'] === 'number' && typeof message['nickname'] === 'string' ? (value as ServerMessage) : null;
    case 'relay':
      return 'data' in message ? (value as ServerMessage) : null;
    case 'voice':
      return 'data' in message && typeof message['from'] === 'number' && typeof message['nickname'] === 'string' ? (value as ServerMessage) : null;
    default:
      return null;
  }
}

/**
 * Les comptes. Facultatifs : le jeu se joue sans, et les sauvegardes restent
 * locales. Un compte donne un pseudo (affiché en jeu), une adresse e-mail et
 * un mot de passe ; la session tient dans un jeton opaque que le client garde
 * sur l'appareil et renvoie en `Authorization: Bearer`.
 */

/** Les bornes des champs, les mêmes pour le formulaire du jeu et pour le serveur. */
export const ACCOUNT_LIMITS = {
  nickname: { min: 2, max: 20 },
  email: { max: 254 },
  password: { min: 8, max: 128 },
} as const;

export type AccountField = 'nickname' | 'email' | 'password';

/** Pourquoi un champ est refusé : la raison, que l'interface met en mots. */
export type FieldProblem = 'empty' | 'tooShort' | 'tooLong' | 'badFormat';

export interface FieldError {
  readonly field: AccountField;
  readonly problem: FieldProblem;
}

/** Le pseudo, nettoyé (espaces des bords retirés, espaces multiples réduits). */
export function cleanNickname(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ');
}

/** L'adresse, nettoyée : sans espaces autour, en minuscules (elle sert d'identifiant). */
export function cleanEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;
/** Lettres, chiffres, espace, tiret, point, apostrophe et souligné : rien qui casse l'affichage. */
const NICKNAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'’-]*$/u;

/** Le pseudo (déjà nettoyé) est-il acceptable ? `null` : oui. */
export function nicknameProblem(nickname: string): FieldProblem | null {
  const { min, max } = ACCOUNT_LIMITS.nickname;
  const length = [...nickname].length;

  if (length === 0) return 'empty';
  if (length < min) return 'tooShort';
  if (length > max) return 'tooLong';

  return NICKNAME.test(nickname) ? null : 'badFormat';
}

/** L'adresse (déjà nettoyée) est-elle acceptable ? */
export function emailProblem(email: string): FieldProblem | null {
  if (email.length === 0) return 'empty';
  if (email.length > ACCOUNT_LIMITS.email.max) return 'tooLong';

  return EMAIL.test(email) ? null : 'badFormat';
}

/** Le mot de passe, tel quel (jamais nettoyé : les espaces en font partie). */
export function passwordProblem(password: string): FieldProblem | null {
  const { min, max } = ACCOUNT_LIMITS.password;

  if (password.length === 0) return 'empty';
  if (password.length < min) return 'tooShort';
  if (password.length > max) return 'tooLong';

  return null;
}

/**
 * L'identité publique d'un compte : jamais de hachage, jamais de mot de passe.
 * `guest` : un invité (`POST /auth/guest`), venu avec son seul pseudo — son
 * adresse est vide, et personne ne peut s'y reconnecter.
 */
export interface AccountUser {
  readonly id: number;
  readonly nickname: string;
  readonly email: string;
  readonly guest?: boolean;
}

/** `POST /auth/register`. */
export interface RegisterRequest {
  readonly nickname: string;
  readonly email: string;
  readonly password: string;
}

/** `POST /auth/login`. */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/** `POST /auth/guest` : jouer à deux sans compte, avec un pseudo. */
export interface GuestRequest {
  readonly nickname: string;
}

/** La réponse d'une inscription (201), d'un invité (201) ou d'une connexion (200). */
export interface SessionResponse {
  readonly ok: true;
  readonly token: string;
  readonly user: AccountUser;
}

/** La réponse de `GET /auth/me`. */
export interface MeResponse {
  readonly ok: true;
  readonly user: AccountUser;
}

/**
 * Ce que le serveur répond quand il refuse : 400 `invalid` (avec les champs
 * en cause), 409 `emailTaken`, 401 `badCredentials` ou `unauthorized`, 429
 * `tooManyAttempts` (avec `retryAfter`, en secondes).
 */
export interface AccountErrorResponse {
  readonly ok: false;
  readonly error: 'invalid' | 'emailTaken' | 'badCredentials' | 'unauthorized' | 'tooManyAttempts';
  readonly fields?: readonly FieldError[];
  readonly retryAfter?: number;
}

export function isAccountUser(value: unknown): value is AccountUser {
  if (typeof value !== 'object' || value === null) return false;

  const user = value as Record<string, unknown>;

  return (
    typeof user['id'] === 'number' &&
    typeof user['nickname'] === 'string' &&
    typeof user['email'] === 'string' &&
    (user['guest'] === undefined || typeof user['guest'] === 'boolean')
  );
}

export function isSessionResponse(value: unknown): value is SessionResponse {
  if (typeof value !== 'object' || value === null) return false;

  const body = value as Record<string, unknown>;

  return body['ok'] === true && typeof body['token'] === 'string' && isAccountUser(body['user']);
}

export function isMeResponse(value: unknown): value is MeResponse {
  if (typeof value !== 'object' || value === null) return false;

  const body = value as Record<string, unknown>;

  return body['ok'] === true && isAccountUser(body['user']);
}

const ACCOUNT_ERRORS = ['invalid', 'emailTaken', 'badCredentials', 'unauthorized', 'tooManyAttempts'];

export function isAccountError(value: unknown): value is AccountErrorResponse {
  if (typeof value !== 'object' || value === null) return false;

  const body = value as Record<string, unknown>;

  return body['ok'] === false && typeof body['error'] === 'string' && ACCOUNT_ERRORS.includes(body['error']);
}

/**
 * Les parties hébergées. Un joueur connecté héberge sa partie : le serveur
 * ouvre une session avec un code d'invitation court, difficile à deviner,
 * qui expire. L'ami qui ouvre le lien se connecte — ou entre son seul pseudo,
 * en invité (`API_PATHS.guest`) —, rejoint la salle, puis
 * entre dans la partie par le WebSocket (`?play=CODE`).
 */

/** Pas de I, L, O, 0 ni 1 : un code se lit à voix haute et se retape sans erreur. */
export const PARTY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const PARTY_LIMITS = {
  /** 31^8, soit près de 10^12 codes : hors de portée d'un essai au hasard, que le serveur limite en plus. */
  codeLength: 8,
  /** Un ami : la partie se joue à deux. */
  maxGuests: 1,
} as const;

/** Le paramètre d'URL qui porte le code d'une invitation : `…/adam/?join=ABCD2345`. */
export const INVITE_PARAM = 'join';

/** Le paramètre d'URL de l'ami en jeu : la page se rouvre dans la partie de l'hôte (`…/?play=ABCD2345`). */
export const PLAY_PARAM = 'play';

/**
 * Le code, tel qu'un joueur le tape ou le colle : majuscules, sans espaces ni
 * tirets. `null` : ce n'est pas la forme d'un code, inutile de demander au serveur.
 */
export function cleanPartyCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]+/gu, '');

  if (code.length !== PARTY_LIMITS.codeLength) return null;

  return [...code].every((char) => PARTY_ALPHABET.includes(char)) ? code : null;
}

/** Ce que le joueur est dans cette partie. */
export type PartyRole = 'host' | 'guest' | 'none';

/** Une partie hébergée, vue par `role` : la liste des invités n'est donnée qu'à ceux qui en font partie. */
export interface PartyInfo {
  readonly code: string;
  /** Le pseudo de l'hôte. */
  readonly host: string;
  /** Fin de validité, en millisecondes depuis 1970. */
  readonly expiresAt: number;
  readonly role: PartyRole;
  /** Les pseudos des invités, dans l'ordre d'arrivée ; vide pour qui n'est pas dans la salle. */
  readonly guests: readonly string[];
  /** Plus de place : un nouvel arrivant est refusé. */
  readonly full: boolean;
}

/** La réponse de `POST /parties` (201), `GET /parties/:code` et `POST /parties/:code/join`. */
export interface PartyResponse {
  readonly ok: true;
  readonly party: PartyInfo;
}

/**
 * Ce que le serveur répond quand il refuse : 401 `unauthorized`, 404
 * `notFound` (code inconnu ou mal formé), 410 `expired` ou `closed`, 409
 * `full`, 403 `forbidden` (fermer la partie d'un autre), 429 `tooManyAttempts`.
 */
export interface PartyErrorResponse {
  readonly ok: false;
  readonly error: 'unauthorized' | 'notFound' | 'expired' | 'closed' | 'full' | 'forbidden' | 'tooManyAttempts';
  readonly retryAfter?: number;
}

export function isPartyResponse(value: unknown): value is PartyResponse {
  if (typeof value !== 'object' || value === null) return false;

  const body = value as Record<string, unknown>;
  const party = body['party'];

  if (body['ok'] !== true || typeof party !== 'object' || party === null) return false;

  const info = party as Record<string, unknown>;

  return (
    typeof info['code'] === 'string' &&
    typeof info['host'] === 'string' &&
    typeof info['expiresAt'] === 'number' &&
    (info['role'] === 'host' || info['role'] === 'guest' || info['role'] === 'none') &&
    Array.isArray(info['guests']) &&
    info['guests'].every((guest) => typeof guest === 'string') &&
    typeof info['full'] === 'boolean'
  );
}

const PARTY_ERRORS = ['unauthorized', 'notFound', 'expired', 'closed', 'full', 'forbidden', 'tooManyAttempts'];

export function isPartyError(value: unknown): value is PartyErrorResponse {
  if (typeof value !== 'object' || value === null) return false;

  const body = value as Record<string, unknown>;

  return body['ok'] === false && typeof body['error'] === 'string' && PARTY_ERRORS.includes(body['error']);
}
