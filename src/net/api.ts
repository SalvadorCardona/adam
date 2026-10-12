/**
 * L'accès au back-end. Son URL est fixée au build (`VITE_API_URL`) ; sans
 * elle, le jeu ne contacte personne et reste hors ligne. Le jeu ne dépend
 * jamais du serveur pour jouer : tout ce qui passe ici est une fonction en
 * ligne qui s'ajoute, et chaque appel peut échouer sans rien casser.
 */

import { API_PATHS, API_VERSION, isHealthResponse } from '../../shared/api.ts';

/** Le temps au-delà duquel une sonde est tenue pour perdue. */
export const PROBE_TIMEOUT_MS = 4000;

/** L'URL de base, propre (sans `/` final), ou `null` si elle est absente ou illisible. */
export function apiBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();

  if (!value) return null;
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** L'adresse du WebSocket du même serveur (`http` → `ws`, `https` → `wss`). */
export function socketUrl(base: string): string {
  return `${base.replace(/^http/, 'ws')}${API_PATHS.socket}`;
}

/**
 * Le serveur répond-il, dans la bonne version ? Jamais d'exception : réseau
 * coupé, délai dépassé, réponse étrangère ou version différente, c'est non.
 */
export async function probeHealth(
  base: string,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const response = await fetcher(`${base}${API_PATHS.health}`, { cache: 'no-store', signal: abort.signal });

    if (!response.ok) return false;

    const body: unknown = await response.json();

    return isHealthResponse(body) && body.api === API_VERSION;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
