/**
 * Le lien d'une invitation : l'adresse du jeu et `?join=CODE`. Un paramètre
 * plutôt qu'un chemin : GitHub Pages n'a pas de page de repli pour un chemin
 * inconnu (voir `vite.config.ts` pour les parties de test), alors que la
 * page d'accueil s'ouvre toujours, quelle que soit sa requête.
 */

import { INVITE_PARAM, cleanPartyCode } from '../../shared/api.ts';

/** Le lien à partager, bâti sur l'adresse de la page courante (base de Vite comprise). */
export function inviteUrl(pageHref: string, code: string): string {
  const url = new URL(pageHref);

  url.search = '';
  url.hash = '';
  url.searchParams.set(INVITE_PARAM, code);

  return url.toString();
}

/**
 * Le code que porte la requête de la page, ou `null` : pas d'invitation. Un
 * paramètre présent mais illisible vaut `''` — le jeu dira que le lien est
 * invalide plutôt que de l'ignorer en silence.
 */
export function inviteCodeOf(search: string): string | null {
  const raw = new URLSearchParams(search).get(INVITE_PARAM);

  if (raw === null) return null;

  return cleanPartyCode(raw) ?? '';
}

/** L'adresse de la page sans l'invitation : on y revient en quittant l'écran « Rejoindre ». */
export function withoutInvite(pageHref: string): string {
  const url = new URL(pageHref);

  url.searchParams.delete(INVITE_PARAM);

  return url.toString();
}
