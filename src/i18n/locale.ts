/**
 * La langue du jeu : laquelle est choisie, et le dictionnaire qui va avec.
 *
 * Deux langues, un dictionnaire chacune (`fr/`, `en/`). Le français fait foi :
 * le type `Messages` se déduit de lui, et l'anglais doit avoir exactement les
 * mêmes clés — une clé oubliée casse le typecheck, et `i18n.test.ts` compare
 * les deux arbres.
 *
 * `sim/` et `data/` n'en savent rien : la simulation émet des identifiants
 * (un id d'objet, un code de refus, un id de quête), l'UI les traduit avec
 * `t()`. Les textes français du contenu restent dans `data/` ; le dictionnaire
 * français les reprend, l'anglais les traduit.
 *
 * Le français est dans le paquet de départ ; l'anglais est un morceau à part
 * (`loadLocale`, import dynamique) que l'on n'attend que si on le veut :
 * `setLocale('en')` suppose qu'il est arrivé (ou posé par `registerMessages`).
 *
 * Changer de langue ne recharge rien : `setLocale` rappelle chaque abonné
 * d'`onLocale`, qui réécrit ses libellés fixes ; le reste de l'UI relit `t()`
 * à chaque rendu. Le choix est une préférence de l'appareil
 * (`storage/localLocale.ts`), jamais dans la partie.
 */

import { FR } from './fr/index.ts';
import type { Messages } from './messages.ts';

export type Locale = 'fr' | 'en';

export const LOCALES: readonly Locale[] = ['fr', 'en'];

const DICTIONARIES: Partial<Record<Locale, Messages>> & { fr: Messages } = { fr: FR };

/** Chaque langue se nomme dans la sienne : le sélecteur n'a pas besoin de son dictionnaire. */
export const LOCALE_NAMES: Record<Locale, string> = { fr: 'Français', en: 'English' };

/** Pose le dictionnaire d'une langue (celui que `loadLocale` vient de charger, ou celui d'un test). */
export function registerMessages(locale: Locale, messages: Messages): void {
  DICTIONARIES[locale] = messages;
}

/** Charge le dictionnaire d'une langue s'il n'est pas déjà là : à attendre avant `setLocale`. */
export async function loadLocale(locale: Locale): Promise<void> {
  if (DICTIONARIES[locale]) return;
  if (locale === 'en') registerMessages('en', (await import('./en/index.ts')).EN);
}

let current: Locale = 'fr';
const listeners = new Set<(locale: Locale) => void>();

export function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en';
}

/** La langue en cours. */
export function locale(): Locale {
  return current;
}

/** Le dictionnaire de la langue en cours : à relire à chaque rendu, jamais à garder. */
export function t(): Messages {
  return DICTIONARIES[current] ?? DICTIONARIES.fr;
}

/** Change de langue et prévient les abonnés ; sans effet si c'est déjà la bonne ou si son dictionnaire n'est pas chargé. */
export function setLocale(next: Locale): void {
  if (next === current || !DICTIONARIES[next]) return;
  current = next;
  for (const listener of [...listeners]) listener(next);
}

/**
 * Appelle `apply` tout de suite, puis à chaque changement de langue. Pour les
 * libellés fixes d'un élément qui vit toute la partie : un élément recréé à
 * chaque rendu relit `t()` et n'a pas besoin de s'abonner. Renvoie de quoi se
 * désabonner.
 */
export function onLocale(apply: (locale: Locale) => void): () => void {
  apply(current);
  listeners.add(apply);
  return () => listeners.delete(apply);
}

/**
 * La langue d'un premier lancement, d'après celles du navigateur : le
 * français s'il vient en tête (`fr`, `fr-CA`…), l'anglais sinon.
 */
export function detectLocale(languages: readonly string[]): Locale {
  const first = languages[0]?.toLowerCase() ?? '';

  return first === 'fr' || first.startsWith('fr-') ? 'fr' : 'en';
}
