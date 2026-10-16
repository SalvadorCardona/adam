/**
 * Les serveurs ICE du vocal. Un STUN public suffit pour commencer : il aide
 * deux navigateurs à se trouver derrière leur box. Derrière certains réseaux
 * (4G, entreprise), la connexion directe est impossible et un **TURN** relaie
 * le son ; il se branche au build (`VITE_TURN_*`), sans rien changer d'autre.
 */

export interface IceServer {
  readonly urls: string | readonly string[];
  readonly username?: string;
  readonly credential?: string;
}

export const STUN_SERVERS: readonly IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/** Les variables du build qui décrivent un TURN. */
export interface TurnEnv {
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

/** Le STUN, plus le TURN si son adresse (`turn:` ou `turns:`) et ses identifiants sont donnés. */
export function iceServers(env: TurnEnv): readonly IceServer[] {
  const url = env.VITE_TURN_URL?.trim();
  const username = env.VITE_TURN_USERNAME?.trim();
  const credential = env.VITE_TURN_CREDENTIAL?.trim();

  if (!url || !username || !credential || !/^turns?:/u.test(url)) return STUN_SERVERS;

  return [...STUN_SERVERS, { urls: url, username, credential }];
}
