/**
 * La carte du jour dans l'adresse : `?daily=2026-10-17`.
 *
 * Le bouton de l'écran titre ouvre la page sur la date UTC du jour ; la
 * partie du jour a sa propre sauvegarde (`DAILY_SAVE_KEY`) et ignore `?seed=`.
 * Fonctions pures, testées en Node.
 */

import { isDailyDate } from '../sim/daily.ts';

/** Le paramètre d'URL qui porte la date de la carte du jour. */
const DAILY_PARAM = 'daily';

/** La date de `?daily=AAAA-MM-JJ`, ou `null` si l'URL n'en donne pas de lisible. */
export function parseDailyDate(search: string): string | null {
  const raw = new URLSearchParams(search).get(DAILY_PARAM);

  return raw !== null && isDailyDate(raw) ? raw : null;
}

/** L'adresse de la page avec `?daily=` posé à `date`, ou retiré (`null`) pour la partie principale. */
export function dailyUrl(href: string, date: string | null): string {
  const url = new URL(href);

  if (date === null) url.searchParams.delete(DAILY_PARAM);
  else url.searchParams.set(DAILY_PARAM, date);
  url.searchParams.delete('seed');
  url.hash = '';
  return url.toString();
}
