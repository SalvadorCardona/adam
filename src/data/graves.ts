/**
 * Les tombes — contenu pur.
 *
 * Un habitant mort de faim ou de soif laisse une tombe fleurie là où il est
 * tombé (`sim/graves.ts`) : de l'état léger — sa case, son nom, son trait, sa
 * cause, le jour —, sauvegardé. Passé `max`, la plus ancienne perd sa pierre
 * et ne garde que ses fleurs ; le deuil pèse aussi sur ses proches (`MOOD.grief`,
 * `data/housing.ts`).
 */

export const GRAVES = {
  /** Tombes gardées avec leur nom ; la plus ancienne devient des fleurs seules au-delà. */
  max: 50,
  /** Fleurs seules gardées, les plus récentes : la carte ne se couvre pas sans fin. */
  maxBlooms: 150,
  /** Des morts rapprochées en moins de tant de secondes font un seul toast, « N colons sont morts de soif ». */
  groupSeconds: 10,
  /** Une tombe se tape à moins de tant de pixels monde de sa pierre. */
  tapReach: 18,
  /** Une tombe cherche une case libre jusqu'à tant de cases de l'endroit de la mort. */
  spread: 3,
} as const;
