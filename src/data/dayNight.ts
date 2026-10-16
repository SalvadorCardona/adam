/**
 * Le cycle jour / nuit — contenu pur.
 *
 * On bâtit le jour, les mutants sortent la nuit. Le cycle démarre quand le
 * toit de la mairie est posé, par une journée : rien n'attaque, on récolte,
 * on explore, on bâtit. Au crépuscule la carte vire à l'indigo et les
 * lampions de la colonie s'allument ; la nuit, les vagues arrivent (cf.
 * `WAVES`, `data/enemies.ts`) ; à l'aube, les mutants qui restent fuient le
 * jour et la colonie ramasse le butin de la nuit survécue.
 *
 * Les durées sont en ticks (20 par seconde). L'horloge vit dans
 * `sim/dayNight.ts` ; le rendu ne fait qu'appliquer la teinte.
 */

import { PALETTE } from './artDirection.ts';
import type { ItemId } from './items.ts';

/** Les quatre phases, dans l'ordre où elles se suivent. */
export const DAY_CYCLE = {
  /** Journée : pas de mutant, le ciel est normal. */
  day: 20 * 180,
  /** Crépuscule : la teinte monte, les lampions s'allument, « La nuit tombe — rentrez ». */
  dusk: 20 * 15,
  /** Nuit : les vagues arrivent. */
  night: 20 * 100,
  /** Aube : la teinte redescend, les mutants fuient, le butin tombe. */
  dawn: 20 * 10,
} as const;

/**
 * Les couleurs de la nuit, toutes tirées de la palette : la carte est
 * **multipliée** par un voile indigo, jamais assombrie vers le noir — la nuit
 * est bleu nuit saturé, comme le veut la direction artistique.
 *
 * Les lumières éclaircissent ce voile au lieu de s'ajouter à la carte : elles
 * sont dessinées ensemble en `max`, si bien que dix lampes qui se recouvrent
 * n'éclairent pas plus qu'une seule. Une ville dense reste lisible.
 *
 * - `veil` : la teinte du voile hors des lumières, à `veilStrength` à la nuit noire ;
 * - `vision` : la teinte autour d'Adam, plus claire — il voit à `visionRadius` ;
 * - `lamp` : la lueur des fenêtres et des lampions de la colonie ;
 * - `halo` : le halo des mutants, vert fluo — famille réservée, signal de danger.
 */
export const NIGHT_TINT = {
  veil: PALETTE.ink.base,
  vision: PALETTE.paper.shade,
  lamp: PALETTE.yellow.light,
  halo: PALETTE.toxic.base,
  /** Force du voile au cœur de la nuit (0 à 1) : la part d'indigo mêlée au blanc. */
  veilStrength: 0.55,
  /** Rayon de la vision d'Adam, en tuiles. */
  visionRadius: 5,
  /** Rayon de la lueur d'un bâtiment, en tuiles, au-delà de son emprise. */
  lampRadius: 2,
  /** Rayon du halo d'un mutant, en tuiles. */
  haloRadius: 1.2,
  /**
   * Plafond des lueurs (0 à 1) : au cœur d'une lampe, le voile glisse d'autant
   * vers sa couleur. Deux lueurs qui se recouvrent ne dépassent jamais ce plafond.
   */
  lampCeiling: 0.45,
  haloCeiling: 0.6,
} as const;

/** Le butin de l'aube quand la mairie a tenu la nuit : en ville, sinon dans le sac, le surplus au sol. */
export const DAWN_REWARD = {
  wood: 5,
  stone: 5,
  food: 3,
} as const satisfies Partial<Record<ItemId, number>>;

/**
 * Après le Signal, chaque aube : de `min` à `max` survivants, tirés du PRNG
 * du monde, arrivent à la mairie. Ce sont des porteurs, logés chez elle.
 */
export const SURVIVORS = {
  min: 1,
  max: 3,
} as const;

/**
 * L'horloge du HUD : à `nightWarning` ticks de la tombée de la nuit, son
 * cadran pulse et vire au corail — le temps de rentrer.
 */
export const DAY_DIAL = {
  nightWarning: 20 * 20,
} as const;

/**
 * « Passer la nuit » : une nuit calme (`World.calmNight`) peut défiler plus
 * vite, `speed` ticks de simulation par tick de temps réel, jusqu'à l'aube —
 * ou jusqu'à ce qu'un mutant reparaisse. Rien ne change dans la simulation :
 * c'est la boucle de `main.ts` qui en fait plus par image.
 */
export const HASTEN = {
  speed: 4,
} as const;
