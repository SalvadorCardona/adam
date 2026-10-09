/**
 * Entrepôt : le rayon où agit le stock de la ville.
 *
 * Les deux rôles de l'entrepôt sont séparés :
 * - le **stock** est le `Store` de la mairie (`World.townStock()`), son
 *   coffre `Infinity`. Il n'a pas de comptabilité à lui : on n'y puise que
 *   son `available()`, pour qu'un porteur qui aura promis ce stock ne se le
 *   fasse pas prendre sous le nez ;
 * - le **rayon** (`logisticRadius` du prototype), ici, dit qui peut y puiser.
 *   Un stock global trop pratique rendrait les porteurs inutiles : hors du
 *   rayon, on livre encore à la main. Il finira dans un `LogisticNetwork`
 *   quand il y aura des nœuds relais.
 */

import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import { logisticRadiusOf } from '../data/buildings.ts';
import type { Entity } from './types.ts';

/** L'entité est-elle dans le rayon logistique de `hub` ? Mesuré de centre d'emprise à centre d'emprise. */
export function inLogisticRange(hub: Entity, entity: Pick<Entity, 'tx' | 'ty' | 'width' | 'height'>): boolean {
  const radius = logisticRadiusOf(hub.proto, hub.kind === 'site' ? 1 : hub.level) * TILE_SIZE;
  const hubX = (hub.tx + hub.width / 2) * TILE_SIZE;
  const hubY = (hub.ty + hub.height / 2) * TILE_SIZE;
  const x = (entity.tx + entity.width / 2) * TILE_SIZE;
  const y = (entity.ty + entity.height / 2) * TILE_SIZE;

  // `Infinity * Infinity` reste `Infinity` : un rayon infini couvre tout.
  return distanceSq(hubX, hubY, x, y) <= radius * radius;
}

/** Le point (x, y), en pixels monde, est-il dans le rayon logistique de `hub` ? Pour ce qui n'a pas d'emprise : la caravane. */
export function pointInLogisticRange(hub: Entity, x: number, y: number): boolean {
  const radius = logisticRadiusOf(hub.proto, hub.kind === 'site' ? 1 : hub.level) * TILE_SIZE;

  return distanceSq((hub.tx + hub.width / 2) * TILE_SIZE, (hub.ty + hub.height / 2) * TILE_SIZE, x, y) <= radius * radius;
}
