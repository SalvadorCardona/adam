/**
 * Ce que la caméra montre, côté bâtiments : le culling des bulles que
 * `EntityLayer` pose au-dessus des toits (alerte de blocage).
 */

import type { ChunkBounds } from './camera.ts';

/** L'emprise (tuiles) touche-t-elle la zone vue, en tuiles ? */
export function inSight(entity: { tx: number; ty: number; width: number; height: number }, sight: ChunkBounds): boolean {
  return (
    entity.tx + entity.width > sight.minCx &&
    entity.tx <= sight.maxCx &&
    entity.ty + entity.height > sight.minCy &&
    entity.ty <= sight.maxCy
  );
}
