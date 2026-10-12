/**
 * Les niveaux d'Adam — contenu pur, aucune logique.
 *
 * Adam gagne de l'expérience (XP) à chaque ennemi qu'il abat, et plus il
 * en a, plus il est fort. Seule l'XP totale est de l'état (`Player.xp`) :
 * le niveau, ses bonus et la barre du HUD s'en déduisent (`sim/levels.ts`).
 * Les gains d'un niveau sont des modificateurs additifs sur les mêmes
 * statistiques que la recherche (`World.bonus`) : ils se cumulent avec le
 * labo sans autre logique.
 */

import type { EnemyId, WildlifeId } from './enemies.ts';
import type { ResearchStat } from './research.ts';

/** Le niveau le plus haut : la courbe est là pour que le dernier se mérite. */
export const MAX_LEVEL = 15;

/**
 * Ce que coûte le passage du niveau `n` au suivant : `base × n ^ growth`,
 * arrondi. Chaque niveau demande plus que le précédent, sans s'emballer :
 * le niveau 5 vient après une soixantaine de mutants, le dernier après des
 * semaines de bases abattues.
 */
export const XP_CURVE = { base: 10, growth: 1.6 } as const;

/** L'XP que rapporte un ennemi vaincu — abattu ou assommé. Plus il est fort, plus il rapporte. */
export const KILL_XP = {
  mutant: 3,
  brute: 10,
  queen: 60,
  larva: 1,
  crab: 2,
  wolf: 5,
  guardian: 5,
  spitter: 5,
  /** Plus l'XP de sa base (`BASE_XP[].chief`). */
  chief: 10,
  /** Les gardiens de région : plus la conquête (`REGION_RINGS[].prestige`, `xp`). */
  greatWolf: 15,
  giantCrab: 15,
  colossus: 15,
  sludgeKing: 15,
} as const satisfies Record<EnemyId | WildlifeId, number>;

/**
 * L'XP d'une base mutante par niveau (`ENEMY_BASE_LEVELS[level - 1]`) :
 * `base` quand elle tombe, `chief` en plus pour son chef.
 */
export const BASE_XP = [
  { base: 25, chief: 10 },
  { base: 60, chief: 25 },
  { base: 120, chief: 50 },
] as const satisfies readonly { base: number; chief: number }[];

/**
 * La part d'XP selon qui a tiré : Adam en plein, les compagnons de l'armée
 * (à venir) à moitié, les tours de guet pas du tout — Adam ne s'entraîne
 * pas quand il laisse la défense faire.
 */
export const XP_SHARE = {
  player: 1,
  companion: 0.5,
  tower: 0,
} as const satisfies Record<string, number>;

export type Shooter = keyof typeof XP_SHARE;

/** Ce qu'Adam gagne à chaque niveau atteint après le premier. */
export interface LevelGains {
  /** Points de vie max en plus. */
  maxHp: number;
  /** Les statistiques de la recherche, en modificateur additif (`World.bonus`). */
  stats: Partial<Record<ResearchStat, number>>;
}

export const LEVEL_GAINS = {
  maxHp: 1,
  stats: { bowDamage: 0.1 },
} as const satisfies LevelGains;
