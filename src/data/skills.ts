/**
 * Le rôle d'Adam la nuit : une compétence active, des mutants qui le
 * traquent, un combo de nuit et l'aube anticipée.
 *
 * Tout est de la donnée ; la logique est dans `sim/skills.ts` et le monde
 * (`World.castSkill`, `World.combo`, `World.skill`).
 */

import type { ItemId } from './items.ts';

/** Ticks par seconde de jeu (`TICKS_PER_SECOND` du monde, que `data/` n'importe pas). */
const TPS = 20;

/**
 * « Volée » : trois flèches en éventail vers la direction du joystick (ou,
 * sans direction, vers l'ennemi le plus proche, sinon là où Adam regarde).
 * Elle se débloque au niveau `unlockLevel` d'Adam — le premier —, et sa
 * recharge est `cooldownTicks`.
 */
export const VOLLEY = {
  unlockLevel: 1,
  cooldownTicks: 8 * TPS,
  arrows: 3,
  /** Angle entre deux flèches voisines, en degrés. */
  spreadDegrees: 16,
} as const;

/**
 * Les traqueurs : des assaillants de la vague qui ne marchent pas sur la
 * mairie mais sur Adam, tant qu'il est à `sightTiles` d'eux. Au contact, ils
 * le frappent. Qui l'est se tire de la seed, de la nuit et du rang, jamais
 * du PRNG du monde : un assaillant sur `every`, à partir de la nuit `fromNight`.
 */
export const HUNTERS = {
  fromNight: 2,
  every: 4,
  sightTiles: 9,
  reachTiles: 0.9,
  damage: 1,
  attackTicks: 1.5 * TPS,
} as const;

/**
 * Le combo de nuit : chaque mutant abattu moins de `windowTicks` après le
 * précédent le fait monter. Tous les `killsPerStep` abattus, le multiplicateur
 * gagne `stepMultiplier` (au plus `maxMultiplier`) ; le Prestige de chaque
 * mutant abattu à plus d'un est mis de côté en bonus et versé à l'aube.
 * Un bâtiment frappé fait retomber le combo.
 */
export const COMBO = {
  windowTicks: 6 * TPS,
  killsPerStep: 3,
  stepMultiplier: 0.5,
  maxMultiplier: 3,
} as const;

/**
 * « Nuit nette » : la vague de la nuit abattue toute, la nuit raccourcit
 * (`remainTicks` avant l'aube) et le butin de l'aube s'enrichit de `reward`.
 */
export const CLEAN_NIGHT = {
  remainTicks: 20 * TPS,
  reward: { ironPlate: 1, food: 2 } as const satisfies Partial<Record<ItemId, number>>,
  prestige: 5,
} as const;
