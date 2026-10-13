/**
 * Le lien d'une invitation : l'adresse du jeu et `?join=CODE`. Un paramètre
 * plutôt qu'un chemin : GitHub Pages n'a pas de page de repli pour un chemin
 * inconnu (voir `vite.config.ts` pour les parties de test), alors que la
 * page d'accueil s'ouvre toujours, quelle que soit sa requête.
 */

import { INVITE_PARAM, PLAY_PARAM, cleanPartyCode } from '../../shared/api.ts';

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

/**
 * L'adresse où l'ami joue : la page du jeu et `?play=CODE`. Rouverte (page
 * rechargée, connexion retrouvée), elle le remet dans la partie de l'hôte.
 * `resync` compte les recalages d'affilée sur une image neuve.
 */
export function playUrl(pageHref: string, code: string, resync = 0): string {
  const url = new URL(pageHref);

  url.search = '';
  url.hash = '';
  url.searchParams.set(PLAY_PARAM, code);
  if (resync > 0) url.searchParams.set('resync', String(resync));

  return url.toString();
}

/** Le code de la partie où joue l'ami, ou `null` : la page n'est pas celle d'un ami en jeu. */
export function playCodeOf(search: string): string | null {
  const raw = new URLSearchParams(search).get(PLAY_PARAM);

  return raw === null ? null : cleanPartyCode(raw);
}

/** Les recalages d'affilée déjà faits (`playUrl`). */
export function resyncsOf(search: string): number {
  const count = Number(new URLSearchParams(search).get('resync') ?? 0);

  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** L'adresse du jeu seul, sans invitation ni partie : l'écran titre de l'ami, sa propre partie. */
export function titleUrl(pageHref: string): string {
  const url = new URL(pageHref);

  url.search = '';
  url.hash = '';

  return url.toString();
}
