/**
 * Ce que la caméra montre : le culling des bâtiments et des mobiles.
 *
 * La zone vue est en tuiles (`Camera.visibleCells(TILE_SIZE, 1)`), marge
 * d'une tuile comprise. Un bâtiment ou un pantin qui n'y touche pas, dessin
 * compris — le toit au-dessus de l'emprise, la barre et les bulles au-dessus
 * du toit, la rangée d'un chantier plus large qu'une petite emprise, la tête
 * au-dessus des pieds —, n'est ni dessiné ni animé : `EntityLayer` et
 * `MobileLayer` le cachent et sautent sa mise à jour. La marge le fait
 * reparaître une tuile avant qu'il entre à l'écran : pas de « pop » au bord.
 */

import type { ChunkBounds } from './camera.ts';

/**
 * Ce qui dépasse de l'emprise d'un bâtiment, en tuiles : au-dessus de son
 * cadre, la barre, la bulle d'alerte qui la surmonte et son battement ; de
 * chaque côté, la rangée des objets d'un chantier et le rebond d'achèvement.
 */
export const BUILDING_OVERHANG = { up: 2.5, side: 2 } as const;

/**
 * Autour des pieds d'un mobile, en tuiles : le plus grand pantin (la Reine,
 * un gardien de région en plus grand), sa barre de vie ou sa bulle au-dessus
 * de la tête, son ombre dessous.
 */
export const MOBILE_REACH = { up: 6, side: 3, down: 1 } as const;

/** La boîte [left, right[ × [top, bottom[ (tuiles, fractions permises) touche-t-elle la zone vue ? */
export function boxInSight(left: number, top: number, right: number, bottom: number, sight: ChunkBounds): boolean {
  return right > sight.minCx && left < sight.maxCx + 1 && bottom > sight.minCy && top < sight.maxCy + 1;
}

/** Le dessin d'un bâtiment — son cadre de `frameHeight` px monde, ancré au pied de l'emprise — touche-t-il la zone vue ? */
export function buildingInSight(
  entity: { tx: number; ty: number; width: number; height: number },
  frameTiles: number,
  sight: ChunkBounds,
): boolean {
  const bottom = entity.ty + entity.height;

  return boxInSight(
    entity.tx - BUILDING_OVERHANG.side,
    bottom - frameTiles - BUILDING_OVERHANG.up,
    entity.tx + entity.width + BUILDING_OVERHANG.side,
    bottom,
    sight,
  );
}

/** Un mobile dont les pieds sont en (tx, ty), en tuiles : son pantin touche-t-il la zone vue ? */
export function mobileInSight(tx: number, ty: number, sight: ChunkBounds): boolean {
  return boxInSight(tx - MOBILE_REACH.side, ty - MOBILE_REACH.up, tx + MOBILE_REACH.side, ty + MOBILE_REACH.down, sight);
}
