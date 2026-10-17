/**
 * Les niveaux d'Adam : de l'XP au niveau, du niveau aux points de vie.
 *
 * Tout ici est pur. `World` garde l'XP totale (`Player.xp`), la gagne à
 * chaque ennemi abattu (`gainXp`) et lit les PV de niveau dans
 * `World.maxHp` ; les bonus de statistiques sont les talents choisis
 * (`sim/talents.ts`), lus dans `World.bonus`.
 */

import { BASE_XP, KILL_XP, LEVEL_GAINS, MAX_LEVEL, XP_CURVE, XP_SHARE, type Shooter } from '../data/levels.ts';
import type { EnemyId, WildlifeId } from '../data/enemies.ts';

/** L'XP qui sépare le niveau `level` du suivant. */
export function xpToNext(level: number): number {
  return Math.round(XP_CURVE.base * level ** XP_CURVE.growth);
}

/** L'XP totale qu'il faut avoir pour atteindre `level` (niveau 1 : zéro). */
export function xpForLevel(level: number): number {
  let total = 0;

  for (let n = 1; n < Math.min(level, MAX_LEVEL); n += 1) total += xpToNext(n);
  return total;
}

/** Le niveau d'une XP totale, borné à `MAX_LEVEL`. */
export function levelOf(xp: number): number {
  let level = 1;

  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

/** Où en est la barre : `into` sur `needed` pour le niveau suivant ; au dernier niveau, pleine. */
export function levelProgress(xp: number): { level: number; into: number; needed: number } {
  const level = levelOf(xp);

  if (level >= MAX_LEVEL) return { level, into: 1, needed: 1 };
  return { level, into: xp - xpForLevel(level), needed: xpToNext(level) };
}

/** Les points de vie en plus que donnent les niveaux atteints. */
export function levelHp(level: number): number {
  return LEVEL_GAINS.maxHp * (level - 1);
}

/** L'XP d'un ennemi vaincu, avant la part de celui qui a tiré. */
export function killXp(proto: EnemyId | WildlifeId): number {
  return KILL_XP[proto];
}

/** L'XP d'une base qui tombe (`chief` : son chef) selon son niveau, borné à la table. */
export function baseXp(level: number, part: 'base' | 'chief'): number {
  return BASE_XP[Math.max(0, Math.min(BASE_XP.length - 1, level - 1))]![part];
}

/** La part d'XP qui revient à Adam selon qui a tiré, arrondie : l'XP reste entière. */
export function sharedXp(amount: number, shooter: Shooter): number {
  return Math.round(amount * XP_SHARE[shooter]);
}
