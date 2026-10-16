/**
 * Les glaneurs : quelle ressource un ouvrier libre ramasse à la main, et d'où.
 *
 * Comme `lumberjacks.ts`, ce module ne fait rien bouger — `World` fait marcher
 * le glaneur avec `walkToward()`. Il répond à une question : quelles tuiles de
 * bois ou de pierre, dans le rayon de la mairie, du plus proche de sa porte au
 * plus loin. Seules les tuiles du carré qui englobe le rayon sont interrogées,
 * jamais la carte. Deux glaneurs — ou un glaneur et un bûcheron — ne visent
 * jamais la même tuile : c'est `World` qui tient les réservations.
 */

import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import { logisticRadiusOf } from '../data/buildings.ts';
import { GLEANERS } from '../data/workers.ts';
import type { ResourceId } from '../data/resources.ts';
import type { ResourceIndex } from './resources.ts';
import type { Entity } from './types.ts';
import { pointInLogisticRange } from './warehouse.ts';

export interface GleanNode {
  tx: number;
  ty: number;
  resource: ResourceId;
  d2: number;
}

/** Une ressource qu'on ramasse à mains nues : bois et pierre, jamais le minerai. */
export function isGleanable(resource: ResourceId): boolean {
  return (GLEANERS.resources as readonly ResourceId[]).includes(resource);
}

/**
 * Les ressources à glaner dans le rayon logistique de la mairie, de la plus
 * proche de sa porte à la plus loin. `allowed` : la tuile se récolte-t-elle ?
 * (pas dans la zone d'une base mutante debout).
 */
export function gleanNodes(
  hall: Entity,
  door: { x: number; y: number },
  resources: ResourceIndex,
  allowed: (tx: number, ty: number) => boolean = () => true,
): GleanNode[] {
  const span = Math.ceil(logisticRadiusOf(hall.proto, hall.kind === 'site' ? 1 : hall.level));
  const cx = hall.tx + Math.floor(hall.width / 2);
  const cy = hall.ty + Math.floor(hall.height / 2);
  const nodes: GleanNode[] = [];

  if (!Number.isFinite(span)) return nodes;

  for (let ty = cy - span - 1; ty <= cy + span; ty += 1) {
    for (let tx = cx - span - 1; tx <= cx + span; tx += 1) {
      const resource = resources.at(tx, ty)?.id;
      const x = (tx + 0.5) * TILE_SIZE;
      const y = (ty + 0.5) * TILE_SIZE;

      if (!resource || !isGleanable(resource) || !pointInLogisticRange(hall, x, y) || !allowed(tx, ty)) continue;
      nodes.push({ tx, ty, resource, d2: distanceSq(door.x, door.y, x, y) });
    }
  }
  // À distance égale, l'ordre de balayage départage : le choix ne dépend que de la carte.
  return nodes.sort((a, b) => a.d2 - b.d2);
}
