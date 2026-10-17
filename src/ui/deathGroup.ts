/**
 * Les morts rapprochées d'un même mal font un seul toast : « 8 colons sont
 * morts de soif », avec « Voir » qui centre la caméra sur l'endroit (la moyenne
 * des morts). Pure — le HUD lui donne l'heure —, pour se tester sans DOM.
 */

import { GRAVES } from '../data/graves.ts';
import type { NeedId } from '../data/needs.ts';

export interface DeathReading {
  /** Combien de morts dans la fenêtre, celle-ci comprise. */
  count: number;
  /** La cause commune, ou `mixed` quand la faim et la soif se mêlent. */
  need: NeedId | 'mixed';
  /** Où regarder : la moyenne des morts, en pixels monde. */
  x: number;
  y: number;
}

export class DeathGroup {
  private count = 0;
  private needs = new Set<NeedId>();
  private sumX = 0;
  private sumY = 0;
  private last = -Infinity;

  /** Une mort à l'instant `nowMs` : ce que le toast doit dire. `count` à 1 : une mort seule, la fenêtre s'ouvre. */
  public add(nowMs: number, need: NeedId, x: number, y: number): DeathReading {
    if (nowMs - this.last > GRAVES.groupSeconds * 1000) {
      this.count = 0;
      this.needs.clear();
      this.sumX = 0;
      this.sumY = 0;
    }
    this.last = nowMs;
    this.count += 1;
    this.needs.add(need);
    this.sumX += x;
    this.sumY += y;

    const [only] = this.needs;

    return { count: this.count, need: this.needs.size === 1 && only !== undefined ? only : 'mixed', x: this.sumX / this.count, y: this.sumY / this.count };
  }
}
