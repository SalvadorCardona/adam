/**
 * Le brouillard de guerre — contenu pur.
 *
 * Trois états par case, comme dans Age of Empires (`sim/fog.ts`) :
 * - **inexplorée** : personne n'y est jamais allé, la carte y est indigo plein ;
 * - **explorée** : on y a vu quelque chose, on n'y voit plus rien en direct —
 *   le terrain et ce qui s'y tenait la dernière fois, sous un voile ;
 * - **visible** : une source de vision la couvre, tout s'y montre en direct.
 *
 * Les sources sont Adam, les habitants dehors, chaque bâtiment du joueur
 * (chantier compris) et, de loin, la tour de guet. Leurs disques
 * s'additionnent : une case est visible dès qu'un seul la couvre.
 *
 * Les rayons sont en tuiles. Celui d'un bâtiment se compte depuis le bord
 * de son emprise : une mairie de 3 × 3 voit plus loin qu'un puits.
 */

import { PALETTE } from './artDirection.ts';
import type { BuildingId } from './buildings.ts';

export const FOG_VISION = {
  /**
   * Adam : c'est lui qui explore. Sa portée de construction (7 tuiles) et
   * celle de son arc (6) tiennent dedans — il ne vise ni ne bâtit à l'aveugle.
   */
  player: 7,
  /** Un habitant dehors — porteur, bûcheron, forestier, bâtisseur, Ève : il révèle ce qu'il traverse. */
  people: 3,
  /** Un bâtiment du joueur, chantier compris, depuis le bord de son emprise. */
  building: 3,
  /**
   * Les bâtiments qui voient plus loin. La tour de guet surveille ce que son
   * arc (8, puis 10 renforcée) ne touche pas encore : on voit venir la vague.
   */
  buildings: { watchtower: 13 } as Partial<Record<BuildingId, number>>,
  /**
   * Une sauvegarde d'avant le brouillard : la colonie connaît déjà les
   * alentours de ce qu'elle a bâti, à ce rayon autour de chaque bâtiment et d'Adam.
   */
  legacy: 12,
} as const;

/**
 * Le voile, tiré de la palette — jamais de noir ni de gris : l'indigo.
 *
 * - `unexplored` : la teinte pleine de l'inconnu ;
 * - `explored` : le voile d'une case explorée hors de vue, à `exploredAlpha` —
 *   la carte se lit dessous, assombrie et bleutée, figée.
 *
 * Le bord entre deux états est un fondu d'une tuile ou deux
 * (`render/fogLayer.ts`), jamais une marche d'escalier.
 */
export const FOG_TINT = {
  unexplored: PALETTE.ink.shade,
  explored: PALETTE.ink.base,
  exploredAlpha: 0.42,
  /** Le voile, plus léger, d'une région pas encore conquise (`data/regions.ts`), même vue. */
  regionAlpha: 0.26,
} as const;
