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
export const API_SERVICE = 'mobile-factory';

/** Les chemins de l'API, des deux côtés la même chaîne. */
export const API_PATHS = {
  health: '/health',
  socket: '/ws',
} as const;

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
 * Les messages du WebSocket. Pour l'instant, une poignée de main et un
 * ping applicatif ; la synchronisation d'une partie à deux s'y ajoutera.
 */
export type ServerMessage =
  | { readonly type: 'hello'; readonly api: number }
  | { readonly type: 'pong'; readonly t: number }
  | { readonly type: 'error'; readonly reason: SocketError };

export type ClientMessage = { readonly type: 'ping'; readonly t: number };

/** Ce qu'un message refusé reçoit en retour. */
export type SocketError = 'badMessage';

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

  if (message['type'] === 'ping' && typeof message['t'] === 'number') return { type: 'ping', t: message['t'] };

  return null;
}
