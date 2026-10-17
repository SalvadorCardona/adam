/**
 * Le budget de bake du sol, partagé par `ChunkLayer` (le sol baké),
 * `WaterLayer` (le champ et le maillage de l'eau) et `ResourceLayer` (les
 * sprites des arbres et des rochers d'un chunk neuf) : au plus
 * `BAKES_PER_FRAME` blocs par image, et pas un de plus une fois
 * `BAKE_BUDGET_MS` passées — le premier passe toujours, pour que le sol
 * avance. Un dézoom complet ou un pan rapide découvre des dizaines de blocs
 * d'un coup : faits tous dans la même image, c'est une saccade de plusieurs
 * centaines de ms sur un téléphone.
 *
 * Et l'ordre (`bakeOrder`) : les plus proches du centre de la caméra
 * d'abord, les blocs manquants avant les blocs à rebaker — un trou se voit,
 * une texture d'avant à peine. Pur, sans Pixi, pour se tester sans canvas.
 */

import { coordKey } from '../core/grid.ts';
import type { ChunkBounds } from './camera.ts';

export const BAKES_PER_FRAME = 4;
export const BAKE_BUDGET_MS = 8;

export class BakeBudget {
  private used = 0;
  private deadline = 0;

  /** Une image commence, à `now` ms. */
  public start(now: number): void {
    this.used = 0;
    this.deadline = now + BAKE_BUDGET_MS;
  }

  /** Un bloc de plus dans cette image, à `now` ms ? Le premier toujours, puis tant que le nombre et le temps le permettent. */
  public take(now: number): boolean {
    if (this.used >= BAKES_PER_FRAME || (this.used > 0 && now > this.deadline)) return false;
    this.used += 1;
    return true;
  }

}

/** Un bloc à baker, ou à rebaker. */
export interface BakeJob {
  bx: number;
  by: number;
  key: string;
}

/**
 * Les blocs à (re)baker, dans l'ordre : d'abord ceux de la zone vue qui
 * manquent, puis ses blocs périmés (`stale`), puis les périmés gardés dans la
 * marge ; à rang égal, le plus proche du centre de la caméra (`cx`, `cy`, en
 * blocs). Un bloc périmé hors de tout reste en attente : l'éviction le jettera,
 * ou il sera rebaké en revenant.
 */
export function bakeOrder(
  bounds: ChunkBounds,
  cx: number,
  cy: number,
  baked: (key: string) => boolean,
  stale: ReadonlySet<string>,
): BakeJob[] {
  const ranked: { job: BakeJob; rank: number; distance: number }[] = [];
  const distance = (bx: number, by: number): number => (bx + 0.5 - cx) ** 2 + (by + 0.5 - cy) ** 2;

  for (let by = bounds.minCy; by <= bounds.maxCy; by += 1) {
    for (let bx = bounds.minCx; bx <= bounds.maxCx; bx += 1) {
      const key = coordKey(bx, by);

      if (!baked(key)) ranked.push({ job: { bx, by, key }, rank: 0, distance: distance(bx, by) });
    }
  }
  for (const key of stale) {
    const [bx, by] = key.split(',').map(Number) as [number, number];
    const inside = bx >= bounds.minCx && bx <= bounds.maxCx && by >= bounds.minCy && by <= bounds.maxCy;

    ranked.push({ job: { bx, by, key }, rank: inside ? 1 : 2, distance: distance(bx, by) });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.distance - b.distance);
  return ranked.map(({ job }) => job);
}
