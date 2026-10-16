/**
 * La carte du jour : une graine et un modificateur dérivés de la date UTC.
 *
 * Fonctions pures, sans horloge : la date vient de l'appelant. Deux joueurs
 * qui ouvrent la carte du même jour UTC — où qu'ils soient — jouent la même
 * carte avec la même règle ; le jeu étant déterministe, c'est la même partie.
 */

import { isDailyDate } from '../../shared/api.ts';
import { hash3 } from '../core/rng.ts';
import { DAILY_MOD_IDS, DAILY_MODS, type DailyGame, type DailyModId, type DailyModProto } from '../data/dailyMods.ts';

/** `AAAA-MM-JJ` : les trois nombres de la date. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Le sel du modificateur : la même graine tire la carte et la règle sans que l'une dépende de l'autre. */
const MOD_SALT = 0x6d6f64;

export { isDailyDate };

/** La date UTC (`AAAA-MM-JJ`) d'un instant en millisecondes depuis 1970. */
export function dailyDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** La graine de la carte du jour : un entier 32 bits non signé tiré de la date. */
export function dailySeed(date: string): number {
  const match = DATE_PATTERN.exec(date);

  if (!match || !isDailyDate(date)) throw new Error(`date du jour illisible : ${date}`);

  return hash3(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Le modificateur du jour, tiré de la graine du jour. */
export function dailyMod(date: string): DailyModId {
  return DAILY_MOD_IDS[hash3(dailySeed(date), MOD_SALT, 0) % DAILY_MOD_IDS.length]!;
}

/** Le jour tout entier : sa date et son modificateur. */
export function dailyGame(date: string): DailyGame {
  return { date, mod: dailyMod(date) };
}

/** Le modificateur d'une partie du jour, ou `{}` pour une partie ordinaire. */
export function modOf(daily: DailyGame | null): DailyModProto {
  return daily ? DAILY_MODS[daily.mod] : {};
}
